const { Client } = require("@modelcontextprotocol/sdk/client");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const {
  StreamableHTTPClientTransport,
} = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
const { SSEClientTransport } = require("@modelcontextprotocol/sdk/client/sse.js");

const MCP_TOOL_PREFIX = "mcp__";
const TOOL_REFRESH_TTL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 30000;

class MCPManager {
  constructor({ configStore, logger } = {}) {
    this.configStore = configStore;
    this.logger = logger;
    this.connections = new Map();
    this.toolRoutes = new Map();
    this.cachedToolDefinitions = [];
    this.cachedToolSummary = [];
    this.toolsByServer = {};
    this.lastRefreshAt = 0;
    this.refreshPromise = null;
  }

  isMcpToolName(toolName) {
    return typeof toolName === "string" && toolName.startsWith(MCP_TOOL_PREFIX);
  }

  _safeNameSegment(value, fallback = "tool") {
    const normalized = String(value || "")
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    const safe = normalized || fallback;
    if (/^[0-9]/.test(safe)) {
      return `t_${safe}`;
    }
    return safe;
  }

  _buildExposedToolName(alias, toolName, usedNames) {
    const safeAlias = this._safeNameSegment(alias, "server");
    const safeToolName = this._safeNameSegment(toolName, "tool");
    const baseName = `${MCP_TOOL_PREFIX}${safeAlias}__${safeToolName}`;

    let candidate = baseName;
    let suffix = 2;
    while (usedNames.has(candidate)) {
      candidate = `${baseName}_${suffix}`;
      suffix += 1;
    }
    usedNames.add(candidate);
    return candidate;
  }

  _isReadOnlyTool(tool) {
    if (!tool || typeof tool !== "object") return false;
    const annotations = tool.annotations || {};
    if (annotations.readOnlyHint === true) return true;
    if (annotations.destructiveHint === true) return false;
    return false;
  }

  _isToolAllowed(server, tool) {
    const readOnly = this._isReadOnlyTool(tool);
    if (readOnly) return true;

    if (!server.allowWriteTools) {
      return false;
    }

    const allowlist = Array.isArray(server.writableToolAllowlist)
      ? server.writableToolAllowlist
      : [];
    if (allowlist.length === 0) {
      return true;
    }

    return allowlist.includes(tool.name);
  }

  _toFunctionToolDefinition(exposedName, server, tool) {
    let parameters = tool?.inputSchema;
    if (!parameters || typeof parameters !== "object") {
      parameters = {
        type: "object",
        properties: {},
      };
    }
    if (!parameters.type) {
      parameters = {
        ...parameters,
        type: "object",
      };
    }
    if (parameters.type !== "object") {
      parameters = {
        type: "object",
        properties: {},
      };
    }

    const descriptionParts = [];
    descriptionParts.push(
      `[MCP:${server.alias}] ${tool.description || "MCP tool"}`
    );
    if (this._isReadOnlyTool(tool)) {
      descriptionParts.push("Read-only tool");
    }

    return {
      type: "function",
      function: {
        name: exposedName,
        description: descriptionParts.join(" "),
        parameters,
      },
    };
  }

  _getConnectionSignature(server) {
    return JSON.stringify({
      id: server.id,
      transport: server.transport,
      command: server.command,
      args: server.args || [],
      cwd: server.cwd || "",
      url: server.url || "",
      timeoutMs: server.timeoutMs || DEFAULT_TIMEOUT_MS,
      env: server.env || {},
      headers: server.headers || {},
      allowWriteTools: !!server.allowWriteTools,
      writableToolAllowlist: server.writableToolAllowlist || [],
    });
  }

  async _createConnection(server) {
    const timeoutMs = server.timeoutMs || DEFAULT_TIMEOUT_MS;
    const createClient = () =>
      new Client(
        {
          name: "tinker",
          version: "0.0.7",
        },
        {
          capabilities: {},
        }
      );

    let client = createClient();
    let transport = null;
    if (server.transport === "http") {
      if (!server.url) {
        throw new Error(`MCP server '${server.alias}' is missing a URL`);
      }
      const url = new URL(server.url);
      const headers = server.headers || {};

      try {
        transport = new StreamableHTTPClientTransport(url, {
          requestInit: {
            headers,
          },
        });
        await client.connect(transport, { timeout: timeoutMs });
      } catch (streamableError) {
        this.logger?.warn(
          `[MCP:${server.alias}] Streamable HTTP failed, falling back to SSE`,
          streamableError?.message || String(streamableError)
        );
        try {
          if (transport?.close) await transport.close();
        } catch (_closeError) {
          // Ignore cleanup failures.
        }
        client = createClient();
        transport = new SSEClientTransport(url, {
          requestInit: {
            headers,
          },
        });
        await client.connect(transport, { timeout: timeoutMs });
      }
    } else {
      if (!server.command) {
        throw new Error(`MCP server '${server.alias}' is missing a command`);
      }
      transport = new StdioClientTransport({
        command: server.command,
        args: Array.isArray(server.args) ? server.args : [],
        cwd: server.cwd || undefined,
        env: {
          ...process.env,
          ...(server.env || {}),
        },
        stderr: "pipe",
      });

      const stderr = transport.stderr;
      if (stderr && typeof stderr.on === "function") {
        stderr.on("data", (chunk) => {
          const text = String(chunk || "").trim();
          if (text) {
            this.logger?.debug(`[MCP:${server.alias}] stderr`, text);
          }
        });
      }

      await client.connect(transport, { timeout: timeoutMs });
    }

    return {
      client,
      transport,
      signature: this._getConnectionSignature(server),
    };
  }

  async _closeConnection(serverId) {
    const existing = this.connections.get(serverId);
    if (!existing) return;

    try {
      if (existing.client?.close) {
        await existing.client.close();
      }
    } catch (_error) {
      // Ignore client close errors.
    }

    try {
      if (existing.transport?.close) {
        await existing.transport.close();
      }
    } catch (_error) {
      // Ignore transport close errors.
    }

    this.connections.delete(serverId);
  }

  async _ensureConnection(server) {
    const signature = this._getConnectionSignature(server);
    const existing = this.connections.get(server.id);
    if (existing && existing.signature === signature) {
      return existing;
    }

    if (existing) {
      await this._closeConnection(server.id);
    }

    const connection = await this._createConnection(server);
    this.connections.set(server.id, connection);
    return connection;
  }

  async _closeStaleConnections(activeServerIds = new Set()) {
    const existingIds = Array.from(this.connections.keys());
    for (const serverId of existingIds) {
      if (!activeServerIds.has(serverId)) {
        await this._closeConnection(serverId);
      }
    }
  }

  _shapeToolsForPanel(tools, server) {
    return (tools || []).map((tool) => {
      const readOnly = this._isReadOnlyTool(tool);
      const included = this._isToolAllowed(server, tool);
      return {
        name: tool.name,
        description: tool.description || "",
        readOnly,
        included,
      };
    });
  }

  async _refreshToolsInternal() {
    const runtimeServers = await this.configStore.getRuntimeServers();
    if (!runtimeServers || runtimeServers.length === 0) {
      this.toolRoutes = new Map();
      this.cachedToolDefinitions = [];
      this.cachedToolSummary = [];
      this.toolsByServer = {};
      await this._closeStaleConnections(new Set());
      return [];
    }

    const nextToolDefinitions = [];
    const nextToolRoutes = new Map();
    const nextToolsByServer = {};
    const nextSummary = [];
    const usedNames = new Set();
    const activeServerIds = new Set();

    for (const server of runtimeServers) {
      activeServerIds.add(server.id);
      try {
        const connection = await this._ensureConnection(server);
        const listResult = await connection.client.listTools(undefined, {
          timeout: server.timeoutMs || DEFAULT_TIMEOUT_MS,
        });
        const tools = Array.isArray(listResult?.tools) ? listResult.tools : [];
        nextToolsByServer[server.id] = this._shapeToolsForPanel(tools, server);

        for (const tool of tools) {
          if (!this._isToolAllowed(server, tool)) continue;
          const exposedName = this._buildExposedToolName(
            server.alias,
            tool.name,
            usedNames
          );
          const definition = this._toFunctionToolDefinition(
            exposedName,
            server,
            tool
          );
          nextToolDefinitions.push(definition);
          nextToolRoutes.set(exposedName, {
            serverId: server.id,
            serverAlias: server.alias,
            originalToolName: tool.name,
            timeoutMs: server.timeoutMs || DEFAULT_TIMEOUT_MS,
          });
          nextSummary.push({
            name: exposedName,
            description: definition.function.description,
          });
        }
      } catch (error) {
        this.logger?.warn(
          `[MCP:${server.alias}] Failed to load tools`,
          error?.message || String(error)
        );
        nextToolsByServer[server.id] = [
          {
            name: "__connection_error__",
            description: error?.message || "Failed to connect to MCP server",
            readOnly: true,
            included: false,
          },
        ];
      }
    }

    await this._closeStaleConnections(activeServerIds);

    this.toolRoutes = nextToolRoutes;
    this.cachedToolDefinitions = nextToolDefinitions;
    this.cachedToolSummary = nextSummary;
    this.toolsByServer = nextToolsByServer;
    this.lastRefreshAt = Date.now();

    return nextToolDefinitions;
  }

  async refreshToolDefinitions({ force = false } = {}) {
    const now = Date.now();
    if (
      !force &&
      this.cachedToolDefinitions.length > 0 &&
      now - this.lastRefreshAt < TOOL_REFRESH_TTL_MS
    ) {
      return this.cachedToolDefinitions;
    }

    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this._refreshToolsInternal()
      .catch((error) => {
        this.logger?.error("Failed refreshing MCP tool definitions", error);
        return [];
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
  }

  async getToolDefinitions() {
    return this.refreshToolDefinitions({ force: false });
  }

  async getToolSummary() {
    await this.refreshToolDefinitions({ force: false });
    return this.cachedToolSummary;
  }

  async getToolsByServer({ force = false } = {}) {
    await this.refreshToolDefinitions({ force });
    return this.toolsByServer;
  }

  _normalizeToolCallResult(rawResult, route) {
    if (!rawResult || typeof rawResult !== "object") {
      return {
        mcp: {
          serverId: route.serverId,
          serverAlias: route.serverAlias,
          toolName: route.originalToolName,
        },
        content: [],
        structuredContent: null,
        text: "",
      };
    }

    const content = Array.isArray(rawResult.content) ? rawResult.content : [];
    const textParts = [];
    for (const part of content) {
      if (part?.type === "text" && typeof part.text === "string") {
        textParts.push(part.text);
      }
    }

    return {
      mcp: {
        serverId: route.serverId,
        serverAlias: route.serverAlias,
        toolName: route.originalToolName,
      },
      isError: Boolean(rawResult.isError),
      content,
      structuredContent: rawResult.structuredContent || null,
      text: textParts.join("\n"),
      raw: rawResult,
    };
  }

  async executeTool(exposedToolName, args = {}) {
    if (!this.isMcpToolName(exposedToolName)) {
      return {
        error: `Not an MCP tool: ${exposedToolName}`,
      };
    }

    let route = this.toolRoutes.get(exposedToolName);
    if (!route) {
      await this.refreshToolDefinitions({ force: true });
      route = this.toolRoutes.get(exposedToolName);
    }

    if (!route) {
      return {
        error: `Unknown MCP tool: ${exposedToolName}`,
      };
    }

    try {
      const runtimeServers = await this.configStore.getRuntimeServers();
      const server = runtimeServers.find((item) => item.id === route.serverId);
      if (!server) {
        return {
          error: `MCP server not available for tool: ${exposedToolName}`,
        };
      }

      const connection = await this._ensureConnection(server);
      const result = await connection.client.callTool(
        {
          name: route.originalToolName,
          arguments:
            args && typeof args === "object" && !Array.isArray(args) ? args : {},
        },
        undefined,
        {
          timeout: route.timeoutMs || DEFAULT_TIMEOUT_MS,
        }
      );
      return this._normalizeToolCallResult(result, route);
    } catch (error) {
      this.logger?.warn(
        `[MCP:${route.serverAlias}] Tool execution failed`,
        route.originalToolName,
        error?.message || String(error)
      );
      return {
        error: `MCP tool execution failed: ${error?.message || "Unknown error"}`,
        mcp: {
          serverId: route.serverId,
          serverAlias: route.serverAlias,
          toolName: route.originalToolName,
        },
      };
    }
  }

  async testServer(runtimeServer) {
    const alias = runtimeServer?.alias || runtimeServer?.id || "server";
    let connection = null;
    try {
      this.logger?.info(`[MCP:${alias}] Testing connection`);
      connection = await this._createConnection(runtimeServer);
      const listResult = await connection.client.listTools(undefined, {
        timeout: runtimeServer.timeoutMs || DEFAULT_TIMEOUT_MS,
      });
      const tools = Array.isArray(listResult?.tools) ? listResult.tools : [];
      this.logger?.info(`[MCP:${alias}] Test succeeded`, {
        toolCount: tools.length,
      });
      return {
        success: true,
        serverId: runtimeServer.id,
        serverAlias: alias,
        toolCount: tools.length,
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description || "",
          readOnly: this._isReadOnlyTool(tool),
          included: this._isToolAllowed(runtimeServer, tool),
        })),
      };
    } catch (error) {
      this.logger?.warn(
        `[MCP:${alias}] Test failed`,
        error?.message || "Failed to connect to MCP server"
      );
      return {
        success: false,
        serverId: runtimeServer?.id,
        serverAlias: alias,
        error: error?.message || "Failed to connect to MCP server",
      };
    } finally {
      try {
        if (connection?.client?.close) {
          await connection.client.close();
        }
      } catch (_error) {
        // Ignore close errors.
      }
      try {
        if (connection?.transport?.close) {
          await connection.transport.close();
        }
      } catch (_error) {
        // Ignore close errors.
      }
    }
  }

  async dispose() {
    const ids = Array.from(this.connections.keys());
    for (const id of ids) {
      await this._closeConnection(id);
    }
    this.toolRoutes = new Map();
    this.cachedToolDefinitions = [];
    this.cachedToolSummary = [];
    this.toolsByServer = {};
  }
}

module.exports = {
  MCPManager,
  MCP_TOOL_PREFIX,
};
