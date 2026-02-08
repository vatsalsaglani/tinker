const vscode = require("vscode");
const { v4: uuidv4 } = require("uuid");

const MCP_ENABLED_KEY = "mcp.enabled";
const MCP_SERVERS_KEY = "mcp.servers";

class MCPConfigStore {
  constructor({
    logger,
    getSecret,
    setSecret,
    deleteSecret,
  } = {}) {
    this.logger = logger;
    this.getSecret = getSecret;
    this.setSecret = setSecret;
    this.deleteSecret = deleteSecret;
  }

  _getConfig() {
    return vscode.workspace.getConfiguration("tinkerAssistant");
  }

  _getUpdateTarget() {
    if (vscode.workspace.workspaceFolders?.length) {
      return vscode.ConfigurationTarget.Workspace;
    }
    return vscode.ConfigurationTarget.Global;
  }

  _normalizeServerId(id) {
    const raw = typeof id === "string" ? id.trim() : "";
    const candidate = raw || `mcp_${uuidv4()}`;
    return candidate.replace(/[^a-zA-Z0-9_.-]/g, "_");
  }

  _normalizeAlias(alias, fallbackId) {
    const raw = typeof alias === "string" ? alias.trim() : "";
    const candidate = raw || fallbackId || "server";
    return candidate.replace(/[^a-zA-Z0-9_.-]/g, "_");
  }

  _normalizeStringArray(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const result = [];
    for (const entry of value) {
      const text = typeof entry === "string" ? entry.trim() : "";
      if (!text || seen.has(text)) continue;
      seen.add(text);
      result.push(text);
    }
    return result;
  }

  _buildSecretKey(serverId, kind, name) {
    const safeServerId = this._normalizeServerId(serverId);
    const safeName = String(name || "")
      .trim()
      .replace(/[^a-zA-Z0-9_.-]/g, "_");
    return `mcp.${safeServerId}.${kind}.${safeName}`;
  }

  _normalizeSecretRefs(secretRefs, serverId, kind) {
    if (!Array.isArray(secretRefs)) return [];

    const refs = [];
    const seenNames = new Set();
    for (const entry of secretRefs) {
      let name = "";
      let secretKey = "";

      if (typeof entry === "string") {
        name = entry.trim();
      } else if (entry && typeof entry === "object") {
        name = typeof entry.name === "string" ? entry.name.trim() : "";
        secretKey =
          typeof entry.secretKey === "string" ? entry.secretKey.trim() : "";
      }

      if (!name || seenNames.has(name)) continue;
      seenNames.add(name);

      refs.push({
        name,
        secretKey: secretKey || this._buildSecretKey(serverId, kind, name),
      });
    }

    return refs;
  }

  _normalizeServer(server, index = 0) {
    const id = this._normalizeServerId(server?.id || `server_${index + 1}`);
    const transport =
      server?.transport === "http" || server?.transport === "stdio"
        ? server.transport
        : "stdio";

    const timeoutMs = Number.isFinite(server?.timeoutMs)
      ? Math.min(120000, Math.max(1000, Number(server.timeoutMs)))
      : 30000;

    const writableToolAllowlist = this._normalizeStringArray(
      server?.writableToolAllowlist
    );

    return {
      id,
      alias: this._normalizeAlias(server?.alias, id),
      enabled: server?.enabled !== false,
      transport,
      command: typeof server?.command === "string" ? server.command.trim() : "",
      args: this._normalizeStringArray(server?.args),
      cwd: typeof server?.cwd === "string" ? server.cwd.trim() : "",
      url: typeof server?.url === "string" ? server.url.trim() : "",
      allowWriteTools: Boolean(server?.allowWriteTools),
      writableToolAllowlist,
      timeoutMs,
      envSecretRefs: this._normalizeSecretRefs(
        server?.envSecretRefs,
        id,
        "env"
      ),
      headerSecretRefs: this._normalizeSecretRefs(
        server?.headerSecretRefs,
        id,
        "header"
      ),
    };
  }

  _normalizeServers(servers) {
    if (!Array.isArray(servers)) return [];
    const normalized = [];
    const seenIds = new Set();
    for (let i = 0; i < servers.length; i++) {
      const server = this._normalizeServer(servers[i], i);
      if (seenIds.has(server.id)) {
        server.id = this._normalizeServerId(`${server.id}_${i + 1}`);
      }
      seenIds.add(server.id);
      normalized.push(server);
    }
    return normalized;
  }

  async loadConfig() {
    const config = this._getConfig();
    const enabled = Boolean(config.get(MCP_ENABLED_KEY, false));
    const servers = this._normalizeServers(config.get(MCP_SERVERS_KEY, []));
    return { enabled, servers };
  }

  async setEnabled(enabled) {
    const config = this._getConfig();
    await config.update(MCP_ENABLED_KEY, Boolean(enabled), this._getUpdateTarget());
  }

  _refMapBySecretKey(refs) {
    const map = new Map();
    for (const ref of refs || []) {
      map.set(ref.secretKey, ref);
    }
    return map;
  }

  async _deleteRefs(refs = []) {
    if (typeof this.deleteSecret !== "function") return;
    for (const ref of refs) {
      try {
        await this.deleteSecret(ref.secretKey);
      } catch (error) {
        this.logger?.warn("Failed deleting MCP secret ref", {
          ref: ref?.name,
          error: error?.message,
        });
      }
    }
  }

  async _syncRemovedSecretRefs(previousServers, nextServers) {
    const nextById = new Map(nextServers.map((server) => [server.id, server]));
    const previousById = new Map(
      previousServers.map((server) => [server.id, server])
    );

    for (const previousServer of previousServers) {
      const nextServer = nextById.get(previousServer.id);
      if (!nextServer) {
        await this._deleteRefs([
          ...(previousServer.envSecretRefs || []),
          ...(previousServer.headerSecretRefs || []),
        ]);
        continue;
      }

      const nextEnv = this._refMapBySecretKey(nextServer.envSecretRefs);
      const nextHeaders = this._refMapBySecretKey(nextServer.headerSecretRefs);
      const removedRefs = [];

      for (const ref of previousServer.envSecretRefs || []) {
        if (!nextEnv.has(ref.secretKey)) removedRefs.push(ref);
      }
      for (const ref of previousServer.headerSecretRefs || []) {
        if (!nextHeaders.has(ref.secretKey)) removedRefs.push(ref);
      }

      if (removedRefs.length > 0) {
        await this._deleteRefs(removedRefs);
      }
    }

    // Any accidental duplicates in previous map can still leave refs; handled by
    // deleting by explicit refs only.
    return previousById;
  }

  async _applySecretValues(server, secretValuesByServer) {
    if (
      typeof this.setSecret !== "function" ||
      typeof this.deleteSecret !== "function"
    ) {
      return;
    }

    const payload = secretValuesByServer?.[server.id] || {};
    const envValues = payload.env || {};
    const headerValues = payload.headers || {};
    const envClear = Array.isArray(payload.envClear) ? payload.envClear : [];
    const headerClear = Array.isArray(payload.headerClear)
      ? payload.headerClear
      : [];

    const envRefsByName = new Map(
      (server.envSecretRefs || []).map((ref) => [ref.name, ref])
    );
    const headerRefsByName = new Map(
      (server.headerSecretRefs || []).map((ref) => [ref.name, ref])
    );

    for (const [name, value] of Object.entries(envValues)) {
      const ref = envRefsByName.get(name);
      if (!ref || typeof value !== "string") continue;
      if (value.length === 0) {
        await this.deleteSecret(ref.secretKey);
      } else {
        await this.setSecret(ref.secretKey, value);
      }
    }

    for (const [name, value] of Object.entries(headerValues)) {
      const ref = headerRefsByName.get(name);
      if (!ref || typeof value !== "string") continue;
      if (value.length === 0) {
        await this.deleteSecret(ref.secretKey);
      } else {
        await this.setSecret(ref.secretKey, value);
      }
    }

    for (const name of envClear) {
      const ref = envRefsByName.get(name);
      if (ref) {
        await this.deleteSecret(ref.secretKey);
      }
    }

    for (const name of headerClear) {
      const ref = headerRefsByName.get(name);
      if (ref) {
        await this.deleteSecret(ref.secretKey);
      }
    }
  }

  async saveConfig({ enabled, servers, secretValues } = {}) {
    const previous = await this.loadConfig();
    const normalizedServers = this._normalizeServers(servers || []);
    const config = this._getConfig();
    const target = this._getUpdateTarget();

    if (enabled !== undefined) {
      await config.update(MCP_ENABLED_KEY, Boolean(enabled), target);
    }
    await config.update(MCP_SERVERS_KEY, normalizedServers, target);

    await this._syncRemovedSecretRefs(previous.servers, normalizedServers);
    for (const server of normalizedServers) {
      await this._applySecretValues(server, secretValues || {});
    }

    return {
      enabled: enabled !== undefined ? Boolean(enabled) : previous.enabled,
      servers: normalizedServers,
    };
  }

  async deleteServer(serverId) {
    const current = await this.loadConfig();
    const toDelete = current.servers.find((server) => server.id === serverId);
    if (!toDelete) {
      return current;
    }

    const nextServers = current.servers.filter((server) => server.id !== serverId);
    const config = this._getConfig();
    await config.update(MCP_SERVERS_KEY, nextServers, this._getUpdateTarget());
    await this._deleteRefs([
      ...(toDelete.envSecretRefs || []),
      ...(toDelete.headerSecretRefs || []),
    ]);

    return {
      enabled: current.enabled,
      servers: nextServers,
    };
  }

  async _resolveSecretRefStatus(secretRefs = []) {
    const result = [];
    for (const ref of secretRefs) {
      let hasValue = false;
      if (typeof this.getSecret === "function") {
        try {
          const value = await this.getSecret(ref.secretKey);
          hasValue = Boolean(value);
        } catch (_error) {
          hasValue = false;
        }
      }
      result.push({
        name: ref.name,
        secretKey: ref.secretKey,
        hasValue,
      });
    }
    return result;
  }

  async getPanelConfig() {
    const config = await this.loadConfig();
    const servers = [];
    for (const server of config.servers) {
      const envSecrets = await this._resolveSecretRefStatus(server.envSecretRefs);
      const headerSecrets = await this._resolveSecretRefStatus(
        server.headerSecretRefs
      );
      servers.push({
        ...server,
        envSecrets,
        headerSecrets,
      });
    }
    return {
      enabled: config.enabled,
      servers,
    };
  }

  async _resolveRuntimeSecretMap(refs = [], explicitValues = null) {
    const values = {};
    for (const ref of refs) {
      const explicitValue =
        explicitValues && Object.prototype.hasOwnProperty.call(explicitValues, ref.name)
          ? explicitValues[ref.name]
          : undefined;

      if (typeof explicitValue === "string") {
        if (explicitValue.length > 0) {
          values[ref.name] = explicitValue;
        }
        continue;
      }

      if (typeof this.getSecret !== "function") continue;
      try {
        const stored = await this.getSecret(ref.secretKey);
        if (stored) {
          values[ref.name] = stored;
        }
      } catch (_error) {
        // Ignore secret read errors in runtime resolution.
      }
    }
    return values;
  }

  async resolveRuntimeServer(server, secretValues = {}) {
    const normalized = this._normalizeServer(server, 0);
    const env = await this._resolveRuntimeSecretMap(
      normalized.envSecretRefs,
      secretValues.env || null
    );
    const headers = await this._resolveRuntimeSecretMap(
      normalized.headerSecretRefs,
      secretValues.headers || null
    );

    return {
      ...normalized,
      env,
      headers,
    };
  }

  async getRuntimeServers() {
    const config = await this.loadConfig();
    if (!config.enabled) {
      return [];
    }

    const runtimeServers = [];
    for (const server of config.servers) {
      if (!server.enabled) continue;
      const runtimeServer = await this.resolveRuntimeServer(server);
      runtimeServers.push(runtimeServer);
    }
    return runtimeServers;
  }
}

module.exports = {
  MCPConfigStore,
};
