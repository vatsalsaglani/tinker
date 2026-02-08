// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Check,
  CirclePlus,
  FlaskConical,
  Loader2,
  PlugZap,
  Save,
  Server,
  Trash2,
  Wrench,
} from "lucide-react";
import Switch from "./components/Switch";
import { createUILogger, installGlobalErrorHandlers } from "./utils/ui-logger";

const vscode =
  typeof acquireVsCodeApi !== "undefined" ? acquireVsCodeApi() : null;
if (typeof window !== "undefined" && vscode) {
  window.__tinkerVsCodeApi = vscode;
}

const uiLogger = createUILogger("McpPanel");
installGlobalErrorHandlers(uiLogger);

function createEmptyServer() {
  const id = `server_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    alias: `server_${new Date().getTime().toString().slice(-4)}`,
    enabled: true,
    transport: "stdio",
    command: "",
    argsText: "",
    cwd: "",
    url: "",
    allowWriteTools: false,
    writableToolAllowlistText: "",
    timeoutMs: 30000,
    envSecrets: [],
    headerSecrets: [],
  };
}

function normalizeSecretRows(secretRows = [], refs = [], kind = "env", serverId = "") {
  const rows = [];
  const source = secretRows.length > 0 ? secretRows : refs;
  for (const item of source) {
    const name = String(item?.name || "").trim();
    if (!name) continue;
    rows.push({
      name,
      secretKey:
        item?.secretKey ||
        `mcp.${serverId.replace(/[^a-zA-Z0-9_.-]/g, "_")}.${kind}.${name.replace(
          /[^a-zA-Z0-9_.-]/g,
          "_"
        )}`,
      value: "",
      hasValue: Boolean(item?.hasValue),
      dirty: false,
    });
  }
  return rows;
}

function toUiServer(server) {
  const id = String(server?.id || "").trim() || createEmptyServer().id;
  return {
    id,
    alias: server?.alias || id,
    enabled: server?.enabled !== false,
    transport: server?.transport === "http" ? "http" : "stdio",
    command: server?.command || "",
    argsText: Array.isArray(server?.args) ? server.args.join(" ") : "",
    cwd: server?.cwd || "",
    url: server?.url || "",
    allowWriteTools: Boolean(server?.allowWriteTools),
    writableToolAllowlistText: Array.isArray(server?.writableToolAllowlist)
      ? server.writableToolAllowlist.join(", ")
      : "",
    timeoutMs:
      Number.isFinite(server?.timeoutMs) && Number(server.timeoutMs) > 0
        ? Number(server.timeoutMs)
        : 30000,
    envSecrets: normalizeSecretRows(
      server?.envSecrets || [],
      server?.envSecretRefs || [],
      "env",
      id
    ),
    headerSecrets: normalizeSecretRows(
      server?.headerSecrets || [],
      server?.headerSecretRefs || [],
      "header",
      id
    ),
  };
}

function splitArgs(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  return raw
    .split(/\s+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function splitCsv(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function toPersistedServer(server) {
  const envSecretRefs = (server.envSecrets || [])
    .filter((row) => row.name?.trim())
    .map((row) => ({
      name: row.name.trim(),
      secretKey: row.secretKey,
    }));

  const headerSecretRefs = (server.headerSecrets || [])
    .filter((row) => row.name?.trim())
    .map((row) => ({
      name: row.name.trim(),
      secretKey: row.secretKey,
    }));

  return {
    id: server.id,
    alias: String(server.alias || "").trim() || server.id,
    enabled: server.enabled !== false,
    transport: server.transport === "http" ? "http" : "stdio",
    command: String(server.command || "").trim(),
    args: splitArgs(server.argsText),
    cwd: String(server.cwd || "").trim(),
    url: String(server.url || "").trim(),
    allowWriteTools: Boolean(server.allowWriteTools),
    writableToolAllowlist: splitCsv(server.writableToolAllowlistText),
    timeoutMs: Number(server.timeoutMs) || 30000,
    envSecretRefs,
    headerSecretRefs,
  };
}

function getChangedSecretPayload(server) {
  const payload = {
    env: {},
    headers: {},
    envClear: [],
    headerClear: [],
  };

  for (const row of server.envSecrets || []) {
    const name = row.name?.trim();
    if (!name || !row.dirty) continue;
    if (row.value) payload.env[name] = row.value;
    else payload.envClear.push(name);
  }
  for (const row of server.headerSecrets || []) {
    const name = row.name?.trim();
    if (!name || !row.dirty) continue;
    if (row.value) payload.headers[name] = row.value;
    else payload.headerClear.push(name);
  }

  if (
    Object.keys(payload.env).length === 0 &&
    Object.keys(payload.headers).length === 0 &&
    payload.envClear.length === 0 &&
    payload.headerClear.length === 0
  ) {
    return null;
  }
  return payload;
}

function SecretTable({ title, rows, onAdd, onChange, onRemove }) {
  return (
    <div
      className="rounded-xl border p-3 space-y-2"
      style={{
        borderColor: "var(--vscode-panel-border)",
        backgroundColor: "var(--vscode-input-background)",
      }}
    >
      <div className="flex items-center justify-between">
        <p
          className="text-xs font-semibold uppercase"
          style={{ color: "var(--vscode-descriptionForeground)" }}
        >
          {title}
        </p>
        <button
          onClick={onAdd}
          className="text-xs px-2 py-1 rounded border"
          style={{
            borderColor: "var(--vscode-panel-border)",
            color: "var(--vscode-foreground)",
          }}
        >
          Add
        </button>
      </div>
      {rows.length === 0 && (
        <p
          className="text-xs"
          style={{ color: "var(--vscode-descriptionForeground)" }}
        >
          No entries added
        </p>
      )}
      {rows.map((row, index) => (
        <div key={`${row.secretKey}_${index}`} className="grid grid-cols-12 gap-2">
          <input
            value={row.name}
            onChange={(e) => onChange(index, { ...row, name: e.target.value, dirty: true })}
            placeholder="Name"
            className="col-span-4 px-2 py-1 rounded border text-xs bg-transparent"
            style={{
              borderColor: "var(--vscode-panel-border)",
              color: "var(--vscode-foreground)",
            }}
          />
          <input
            type="password"
            value={row.value}
            onChange={(e) =>
              onChange(index, { ...row, value: e.target.value, dirty: true })
            }
            placeholder={row.hasValue ? "Stored value (leave empty to keep)" : "Value"}
            className="col-span-6 px-2 py-1 rounded border text-xs bg-transparent"
            style={{
              borderColor: "var(--vscode-panel-border)",
              color: "var(--vscode-foreground)",
            }}
          />
          <div className="col-span-1 flex items-center justify-center">
            <span
              className="text-[10px]"
              style={{
                color: row.hasValue
                  ? "var(--vscode-testing-iconPassed)"
                  : "var(--vscode-descriptionForeground)",
              }}
              title={row.hasValue ? "Stored" : "Not stored"}
            >
              {row.hasValue ? "Stored" : "None"}
            </span>
          </div>
          <button
            onClick={() => onRemove(index)}
            className="col-span-1 p-1 rounded hover:bg-red-500/10 text-red-400"
            title="Remove"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function TabButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs border ${
        active ? "border-tinker-copper/50" : ""
      }`}
      style={{
        borderColor: active ? undefined : "var(--vscode-panel-border)",
        backgroundColor: active
          ? "var(--vscode-editor-background)"
          : "transparent",
        color: "var(--vscode-foreground)",
      }}
    >
      {label}
    </button>
  );
}

function McpPanel() {
  const [enabled, setEnabled] = useState(false);
  const [servers, setServers] = useState([]);
  const [selectedServerId, setSelectedServerId] = useState("");
  const [toolsByServer, setToolsByServer] = useState({});
  const [testResultByServer, setTestResultByServer] = useState({});
  const [activeTab, setActiveTab] = useState("general");
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshingTools, setIsRefreshingTools] = useState(false);
  const [testingServerId, setTestingServerId] = useState(null);
  const [inlineMessage, setInlineMessage] = useState(null);

  useEffect(() => {
    const handleMessage = (event) => {
      const message = event.data || {};
      if (message.type === "mcpConfigLoaded") {
        const config = message.config || {};
        const normalized = (config.servers || []).map((server) => toUiServer(server));
        setEnabled(Boolean(config.enabled));
        setServers(normalized);
        setSelectedServerId((previous) => {
          if (!previous && normalized[0]) return normalized[0].id;
          if (previous && normalized.some((server) => server.id === previous)) {
            return previous;
          }
          return normalized[0]?.id || "";
        });
        setIsSaving(false);
      } else if (message.type === "mcpToolsLoaded") {
        setToolsByServer(message.toolsByServer || {});
        setIsRefreshingTools(false);
      } else if (message.type === "mcpServerTestResult") {
        const result = message.result || {};
        if (result.serverId) {
          setTestResultByServer((prev) => ({ ...prev, [result.serverId]: result }));
          setTestingServerId((current) =>
            current === result.serverId ? null : current
          );
          if (result.success && Array.isArray(result.tools)) {
            setToolsByServer((prev) => ({
              ...prev,
              [result.serverId]: result.tools.map((tool) => ({
                name: tool.name,
                description: tool.description || "",
                readOnly: Boolean(tool.readOnly),
                included:
                  typeof tool.included === "boolean" ? tool.included : true,
              })),
            }));
            setActiveTab("tools");
          }
          setInlineMessage(
            result.success
              ? {
                  type: "success",
                  text: `Connection successful (${result.toolCount || 0} tools)`,
                }
              : {
                  type: "error",
                  text: `Connection failed: ${result.error || "Unknown error"}`,
                }
          );
        }
      } else if (message.type === "mcpEnabledState") {
        setEnabled(Boolean(message.enabled));
      }
    };

    window.addEventListener("message", handleMessage);
    vscode?.postMessage({ type: "loadMcpConfig" });
    vscode?.postMessage({ type: "refreshMcpTools" });
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const selectedServer = useMemo(
    () => servers.find((server) => server.id === selectedServerId) || null,
    [servers, selectedServerId]
  );

  const updateServer = (serverId, updater) => {
    setServers((prev) =>
      prev.map((server) => {
        if (server.id !== serverId) return server;
        return typeof updater === "function" ? updater(server) : updater;
      })
    );
  };

  const addServer = () => {
    const next = createEmptyServer();
    setServers((prev) => [...prev, next]);
    setSelectedServerId(next.id);
    setInlineMessage(null);
    setActiveTab("general");
  };

  const deleteSelectedServer = () => {
    if (!selectedServer) return;
    vscode?.postMessage({ type: "deleteMcpServer", serverId: selectedServer.id });
    setInlineMessage({
      type: "info",
      text: "Server deleted",
    });
  };

  const handleSave = () => {
    setIsSaving(true);
    const payloadServers = servers.map((server) => toPersistedServer(server));
    const secretValues = {};
    for (const server of servers) {
      const changed = getChangedSecretPayload(server);
      if (changed) {
        secretValues[server.id] = changed;
      }
    }

    vscode?.postMessage({
      type: "saveMcpConfig",
      payload: {
        enabled,
        servers: payloadServers,
        secretValues,
      },
    });
    setInlineMessage({
      type: "info",
      text: "Saving MCP configuration...",
    });
  };

  const handleTest = () => {
    if (!selectedServer) return;
    setTestingServerId(selectedServer.id);
    const persisted = toPersistedServer(selectedServer);
    const changed = getChangedSecretPayload(selectedServer);
    vscode?.postMessage({
      type: "testMcpServer",
      server: persisted,
      secretValues: {
        env: changed?.env || {},
        headers: changed?.headers || {},
      },
    });
    setInlineMessage({
      type: "info",
      text: `Testing server "${selectedServer.alias || selectedServer.id}"...`,
    });
  };

  const handleRefreshTools = () => {
    setIsRefreshingTools(true);
    vscode?.postMessage({ type: "refreshMcpTools" });
    setInlineMessage({
      type: "info",
      text: "Refreshing MCP tools...",
    });
  };

  const updateSecretRows = (serverId, key, nextRows) => {
    updateServer(serverId, (server) => ({
      ...server,
      [key]: nextRows,
    }));
  };

  const currentTools = selectedServer ? toolsByServer[selectedServer.id] || [] : [];
  const currentTest = selectedServer ? testResultByServer[selectedServer.id] : null;
  const isTestingSelected = Boolean(
    selectedServer && testingServerId === selectedServer.id
  );
  const canShowToolsTab = Boolean(selectedServer && currentTest?.success);

  useEffect(() => {
    if (!canShowToolsTab && activeTab === "tools") {
      setActiveTab("general");
    }
  }, [canShowToolsTab, activeTab]);

  return (
    <div
      className="min-h-screen p-6"
      style={{
        backgroundColor: "var(--vscode-editor-background)",
        color: "var(--vscode-foreground)",
      }}
    >
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-tinker-copper/20 flex items-center justify-center">
              <PlugZap size={18} className="text-tinker-copper" />
            </div>
            <div>
              <h1 className="text-xl font-bold">MCP Configuration</h1>
              <p
                className="text-sm"
                style={{ color: "var(--vscode-descriptionForeground)" }}
              >
                Configure workspace MCP servers and tool access
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs">MCP Enabled</span>
            <Switch
              checked={enabled}
              onChange={(value) => {
                setEnabled(value);
                vscode?.postMessage({ type: "setMcpEnabled", enabled: value });
              }}
            />
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-3 py-2 rounded-lg bg-tinker-copper text-white text-sm flex items-center gap-2"
            >
              {isSaving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-3 space-y-2">
            <button
              onClick={addServer}
              className="w-full px-3 py-2 rounded-lg border text-sm flex items-center justify-center gap-2"
              style={{
                borderColor: "var(--vscode-panel-border)",
                backgroundColor: "var(--vscode-input-background)",
              }}
            >
              <CirclePlus size={14} />
              Add Server
            </button>
            <div
              className="rounded-xl border p-2 space-y-1"
              style={{
                borderColor: "var(--vscode-panel-border)",
                backgroundColor: "var(--vscode-input-background)",
              }}
            >
              {servers.length === 0 && (
                <p
                  className="text-xs p-2"
                  style={{ color: "var(--vscode-descriptionForeground)" }}
                >
                  No MCP servers configured
                </p>
              )}
              {servers.map((server) => (
                <button
                  key={server.id}
                  onClick={() => setSelectedServerId(server.id)}
                  className={`w-full text-left px-2 py-2 rounded-lg text-xs border ${
                    selectedServerId === server.id ? "border-tinker-copper/50" : ""
                  }`}
                  style={{
                    borderColor:
                      selectedServerId === server.id
                        ? undefined
                        : "var(--vscode-panel-border)",
                    backgroundColor:
                      selectedServerId === server.id
                        ? "var(--vscode-editor-background)"
                        : "transparent",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{server.alias || server.id}</span>
                    {server.enabled && <Check size={12} className="text-green-400" />}
                  </div>
                  <p style={{ color: "var(--vscode-descriptionForeground)" }}>
                    {server.transport.toUpperCase()}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="col-span-9">
            {!selectedServer ? (
              <div
                className="rounded-xl border p-6 text-sm"
                style={{
                  borderColor: "var(--vscode-panel-border)",
                  backgroundColor: "var(--vscode-input-background)",
                  color: "var(--vscode-descriptionForeground)",
                }}
              >
                Select a server to configure
              </div>
            ) : (
              <div
                className="rounded-xl border p-4 space-y-4"
                style={{
                  borderColor: "var(--vscode-panel-border)",
                  backgroundColor: "var(--vscode-input-background)",
                }}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <Server size={15} />
                    Server Details
                  </h2>
                  <button
                    onClick={deleteSelectedServer}
                    className="text-xs px-2 py-1 rounded border text-red-400"
                    style={{ borderColor: "var(--vscode-panel-border)" }}
                  >
                    <Trash2 size={12} className="inline mr-1" />
                    Delete
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <TabButton
                    label="General"
                    active={activeTab === "general"}
                    onClick={() => setActiveTab("general")}
                  />
                  <TabButton
                    label="Advanced"
                    active={activeTab === "advanced"}
                    onClick={() => setActiveTab("advanced")}
                  />
                  {canShowToolsTab && (
                    <TabButton
                      label="Tools"
                      active={activeTab === "tools"}
                      onClick={() => setActiveTab("tools")}
                    />
                  )}
                </div>

                {activeTab === "general" && (
                  <>
                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-4">
                        <label className="text-xs block mb-1">Alias</label>
                        <input
                          value={selectedServer.alias}
                          onChange={(e) =>
                            updateServer(selectedServer.id, {
                              ...selectedServer,
                              alias: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 rounded border text-sm bg-transparent"
                          style={{ borderColor: "var(--vscode-panel-border)" }}
                        />
                      </div>
                      <div className="col-span-3">
                        <label className="text-xs block mb-1">Transport</label>
                        <select
                          value={selectedServer.transport}
                          onChange={(e) =>
                            updateServer(selectedServer.id, {
                              ...selectedServer,
                              transport: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 rounded border text-sm bg-transparent"
                          style={{ borderColor: "var(--vscode-panel-border)" }}
                        >
                          <option value="stdio">stdio</option>
                          <option value="http">http/sse</option>
                        </select>
                      </div>
                      <div className="col-span-3">
                        <label className="text-xs block mb-1">Timeout (ms)</label>
                        <input
                          type="number"
                          value={selectedServer.timeoutMs}
                          onChange={(e) =>
                            updateServer(selectedServer.id, {
                              ...selectedServer,
                              timeoutMs: Number(e.target.value) || 30000,
                            })
                          }
                          className="w-full px-3 py-2 rounded border text-sm bg-transparent"
                          style={{ borderColor: "var(--vscode-panel-border)" }}
                        />
                      </div>
                      <div className="col-span-2 flex items-end">
                        <div className="flex items-center gap-2">
                          <span className="text-xs">Enabled</span>
                          <Switch
                            checked={selectedServer.enabled}
                            onChange={(value) =>
                              updateServer(selectedServer.id, {
                                ...selectedServer,
                                enabled: value,
                              })
                            }
                          />
                        </div>
                      </div>

                      {selectedServer.transport === "stdio" ? (
                        <>
                          <div className="col-span-6">
                            <label className="text-xs block mb-1">Command</label>
                            <input
                              value={selectedServer.command}
                              onChange={(e) =>
                                updateServer(selectedServer.id, {
                                  ...selectedServer,
                                  command: e.target.value,
                                })
                              }
                              placeholder="npx"
                              className="w-full px-3 py-2 rounded border text-sm bg-transparent"
                              style={{ borderColor: "var(--vscode-panel-border)" }}
                            />
                          </div>
                          <div className="col-span-6">
                            <label className="text-xs block mb-1">Args</label>
                            <input
                              value={selectedServer.argsText}
                              onChange={(e) =>
                                updateServer(selectedServer.id, {
                                  ...selectedServer,
                                  argsText: e.target.value,
                                })
                              }
                              placeholder="-y @playwright/mcp@latest"
                              className="w-full px-3 py-2 rounded border text-sm bg-transparent"
                              style={{ borderColor: "var(--vscode-panel-border)" }}
                            />
                          </div>
                          <div className="col-span-12">
                            <label className="text-xs block mb-1">
                              Working Directory (optional)
                            </label>
                            <input
                              value={selectedServer.cwd}
                              onChange={(e) =>
                                updateServer(selectedServer.id, {
                                  ...selectedServer,
                                  cwd: e.target.value,
                                })
                              }
                              className="w-full px-3 py-2 rounded border text-sm bg-transparent"
                              style={{ borderColor: "var(--vscode-panel-border)" }}
                            />
                          </div>
                        </>
                      ) : (
                        <div className="col-span-12">
                          <label className="text-xs block mb-1">Server URL</label>
                          <input
                            value={selectedServer.url}
                            onChange={(e) =>
                              updateServer(selectedServer.id, {
                                ...selectedServer,
                                url: e.target.value,
                              })
                            }
                            placeholder="https://your-mcp-server.example.com/mcp"
                            className="w-full px-3 py-2 rounded border text-sm bg-transparent"
                            style={{ borderColor: "var(--vscode-panel-border)" }}
                          />
                        </div>
                      )}
                    </div>

                    <SecretTable
                      title="Environment Secrets"
                      rows={selectedServer.envSecrets}
                      onAdd={() =>
                        updateSecretRows(selectedServer.id, "envSecrets", [
                          ...selectedServer.envSecrets,
                          {
                            name: "",
                            secretKey: `mcp.${selectedServer.id}.env.new_${Date.now()}`,
                            value: "",
                            hasValue: false,
                            dirty: true,
                          },
                        ])
                      }
                      onChange={(index, next) => {
                        const rows = [...selectedServer.envSecrets];
                        rows[index] = next;
                        updateSecretRows(selectedServer.id, "envSecrets", rows);
                      }}
                      onRemove={(index) => {
                        const rows = [...selectedServer.envSecrets];
                        rows.splice(index, 1);
                        updateSecretRows(selectedServer.id, "envSecrets", rows);
                      }}
                    />

                    <SecretTable
                      title="Header Secrets"
                      rows={selectedServer.headerSecrets}
                      onAdd={() =>
                        updateSecretRows(selectedServer.id, "headerSecrets", [
                          ...selectedServer.headerSecrets,
                          {
                            name: "",
                            secretKey: `mcp.${selectedServer.id}.header.new_${Date.now()}`,
                            value: "",
                            hasValue: false,
                            dirty: true,
                          },
                        ])
                      }
                      onChange={(index, next) => {
                        const rows = [...selectedServer.headerSecrets];
                        rows[index] = next;
                        updateSecretRows(selectedServer.id, "headerSecrets", rows);
                      }}
                      onRemove={(index) => {
                        const rows = [...selectedServer.headerSecrets];
                        rows.splice(index, 1);
                        updateSecretRows(selectedServer.id, "headerSecrets", rows);
                      }}
                    />

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleTest}
                        disabled={isTestingSelected}
                        className="px-3 py-2 rounded-lg border text-sm flex items-center gap-2 disabled:opacity-60"
                        style={{ borderColor: "var(--vscode-panel-border)" }}
                      >
                        {isTestingSelected ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <FlaskConical size={14} />
                        )}
                        {isTestingSelected ? "Testing..." : "Test Connection"}
                      </button>
                    </div>
                  </>
                )}

                {activeTab === "advanced" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={selectedServer.allowWriteTools}
                        onChange={(value) =>
                          updateServer(selectedServer.id, {
                            ...selectedServer,
                            allowWriteTools: value,
                          })
                        }
                      />
                      <span className="text-sm">Allow writable tools</span>
                    </div>

                    <div>
                      <label className="text-xs block mb-1">
                        Writable Tool Allowlist (comma-separated, optional)
                      </label>
                      <input
                        value={selectedServer.writableToolAllowlistText}
                        onChange={(e) =>
                          updateServer(selectedServer.id, {
                            ...selectedServer,
                            writableToolAllowlistText: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 rounded border text-sm bg-transparent"
                        style={{ borderColor: "var(--vscode-panel-border)" }}
                      />
                      <p
                        className="mt-2 text-xs"
                        style={{ color: "var(--vscode-descriptionForeground)" }}
                      >
                        If empty and writable tools are enabled, all writable tools are allowed.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === "tools" && canShowToolsTab && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleTest}
                        disabled={isTestingSelected}
                        className="px-3 py-2 rounded-lg border text-sm flex items-center gap-2 disabled:opacity-60"
                        style={{ borderColor: "var(--vscode-panel-border)" }}
                      >
                        {isTestingSelected ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <FlaskConical size={14} />
                        )}
                        {isTestingSelected ? "Testing..." : "Test Connection"}
                      </button>
                      <button
                        onClick={handleRefreshTools}
                        disabled={isRefreshingTools}
                        className="px-3 py-2 rounded-lg border text-sm flex items-center gap-2 disabled:opacity-60"
                        style={{ borderColor: "var(--vscode-panel-border)" }}
                      >
                        {isRefreshingTools ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Wrench size={14} />
                        )}
                        {isRefreshingTools ? "Refreshing..." : "Refresh Tools"}
                      </button>
                    </div>

                    {currentTest && (
                      <div
                        className="text-xs rounded-lg border px-3 py-2"
                        style={{
                          borderColor: currentTest.success
                            ? "var(--vscode-testing-iconPassed)"
                            : "var(--vscode-testing-iconFailed)",
                        }}
                      >
                        {currentTest.success
                          ? `Connection successful (${currentTest.toolCount} tools)`
                          : `Connection failed: ${currentTest.error}`}
                      </div>
                    )}

                    <div
                      className="rounded-xl border p-3"
                      style={{
                        borderColor: "var(--vscode-panel-border)",
                        backgroundColor: "var(--vscode-editor-background)",
                      }}
                    >
                      <h3 className="text-sm font-semibold mb-2">Discovered Tools</h3>
                      {currentTools.length === 0 ? (
                        <p
                          className="text-xs"
                          style={{ color: "var(--vscode-descriptionForeground)" }}
                        >
                          No tool metadata loaded yet.
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {currentTools.map((tool) => (
                            <div
                              key={tool.name}
                              className="text-xs flex items-center justify-between px-2 py-1 rounded border"
                              style={{ borderColor: "var(--vscode-panel-border)" }}
                            >
                              <span>{tool.name}</span>
                              <span
                                style={{
                                  color: tool.included
                                    ? "var(--vscode-testing-iconPassed)"
                                    : "var(--vscode-descriptionForeground)",
                                }}
                              >
                                {tool.readOnly ? "read-only" : "writable"} ·{" "}
                                {tool.included ? "enabled" : "blocked"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {!canShowToolsTab && (
                  <div
                    className="rounded-lg border px-3 py-2 text-xs"
                    style={{
                      borderColor: "var(--vscode-panel-border)",
                      color: "var(--vscode-descriptionForeground)",
                    }}
                  >
                    Tools tab appears after a successful Test Connection.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {inlineMessage && (
          <div
            className="text-xs rounded-lg px-3 py-2"
            style={{
              border: `1px solid ${
                inlineMessage.type === "success"
                  ? "var(--vscode-testing-iconPassed)"
                  : inlineMessage.type === "error"
                  ? "var(--vscode-testing-iconFailed)"
                  : "var(--vscode-panel-border)"
              }`,
              color:
                inlineMessage.type === "success"
                  ? "var(--vscode-testing-iconPassed)"
                  : inlineMessage.type === "error"
                  ? "var(--vscode-testing-iconFailed)"
                  : "var(--vscode-descriptionForeground)",
            }}
          >
            {inlineMessage.text}
          </div>
        )}
      </div>
    </div>
  );
}

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<McpPanel />);
}

export default McpPanel;
