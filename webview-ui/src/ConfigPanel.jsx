// @ts-nocheck
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  Save,
  Eye,
  EyeOff,
  Check,
  Key,
  Box,
  Trash2,
  Globe,
} from "lucide-react";
import {
  OpenAIIcon,
  ClaudeIcon,
  GeminiIcon,
  AzureIcon,
  BedrockIcon,
} from "./icons";
import ModelManager from "./components/ModelManager";
import Switch from "./components/Switch";

// Acquire VS Code API once at module level (singleton)
const vscode =
  typeof acquireVsCodeApi !== "undefined" ? acquireVsCodeApi() : null;

const providers = [
  { value: "openai", label: "OpenAI", icon: OpenAIIcon },
  { value: "anthropic", label: "Anthropic", icon: ClaudeIcon },
  { value: "gemini", label: "Gemini", icon: GeminiIcon },
  { value: "azure", label: "Azure", icon: AzureIcon },
  { value: "bedrock", label: "Bedrock", icon: BedrockIcon },
];

function ConfigPanel() {
  const [activeProvider, setActiveProvider] = useState("openai");

  // Per-provider API keys (input state)
  const [apiKeys, setApiKeys] = useState({
    openai: "",
    anthropic: "",
    gemini: "",
    azure: "",
    bedrock: "", // Not used for bedrock, but kept for consistency
  });

  // Which providers have saved keys
  const [keyStatus, setKeyStatus] = useState({
    openai: false,
    anthropic: false,
    gemini: false,
    azure: false,
    bedrock: false,
  });

  // Show/hide API key toggles per provider
  const [showKeys, setShowKeys] = useState({
    openai: false,
    anthropic: false,
    gemini: false,
    azure: false,
    bedrock: false,
  });

  // Custom models per provider
  const [customModels, setCustomModels] = useState({
    openai: [],
    anthropic: [],
    gemini: [],
    azure: [],
    bedrock: [],
  });

  // Azure endpoint
  const [azureEndpoint, setAzureEndpoint] = useState("");

  // Bedrock AWS credentials
  const [bedrockConfig, setBedrockConfig] = useState({
    awsAccessKey: "",
    awsSecretKey: "",
    awsRegion: "us-east-1",
  });
  const [showBedrockSecretKey, setShowBedrockSecretKey] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    const handleMessage = (event) => {
      const message = event.data;
      if (message.type === "customModelsLoaded") {
        setCustomModels(message.models || {});
      } else if (message.type === "providerKeysLoaded") {
        setKeyStatus(message.keyStatus || {});
      } else if (message.type === "settingsLoaded") {
        setAzureEndpoint(message.settings.baseURL || "");
      }
    };

    window.addEventListener("message", handleMessage);

    // Request data on mount
    vscode?.postMessage({ type: "loadCustomModels" });
    vscode?.postMessage({ type: "loadAllProviderKeys" });
    vscode?.postMessage({ type: "loadSettings" });

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleSaveApiKey = (provider) => {
    const key = apiKeys[provider];
    if (key) {
      vscode?.postMessage({
        type: "saveProviderApiKey",
        provider,
        apiKey: key,
      });
      setApiKeys((prev) => ({ ...prev, [provider]: "" }));
      // Optimistically update status
      setKeyStatus((prev) => ({ ...prev, [provider]: true }));
      setSaveStatus(`${provider} API key saved securely!`);
      setTimeout(() => setSaveStatus(""), 2000);
    }
  };

  const handleDeleteApiKey = (provider) => {
    vscode?.postMessage({
      type: "saveProviderApiKey",
      provider,
      apiKey: "", // Empty string will delete
    });
    // Optimistically update status
    setKeyStatus((prev) => ({ ...prev, [provider]: false }));
    setSaveStatus(`${provider} API key deleted`);
    setTimeout(() => setSaveStatus(""), 2000);
  };

  const handleSaveModels = () => {
    setIsSaving(true);
    vscode?.postMessage({
      type: "saveCustomModels",
      models: customModels,
    });
    setSaveStatus("Models saved!");
    setTimeout(() => {
      setIsSaving(false);
      setSaveStatus("");
    }, 1500);
  };

  const handleSaveAzureEndpoint = () => {
    vscode?.postMessage({
      type: "saveSettings",
      settings: { baseURL: azureEndpoint, provider: "azure", apiKey: "" },
    });
    setSaveStatus("Azure endpoint saved!");
    setTimeout(() => setSaveStatus(""), 2000);
  };

  const handleSaveBedrockConfig = () => {
    vscode?.postMessage({
      type: "saveSettings",
      settings: {
        provider: "bedrock",
        awsAccessKey: bedrockConfig.awsAccessKey,
        awsSecretKey: bedrockConfig.awsSecretKey,
        awsRegion: bedrockConfig.awsRegion,
      },
    });
    // Mark bedrock as having saved credentials
    setKeyStatus((prev) => ({ ...prev, bedrock: true }));
    setSaveStatus("Bedrock AWS credentials saved!");
    setTimeout(() => setSaveStatus(""), 2000);
  };

  const updateModelsForProvider = (provider, models) => {
    setCustomModels((prev) => ({ ...prev, [provider]: models }));
  };

  const currentProvider = providers.find((p) => p.value === activeProvider);

  return (
    <div
      className="min-h-screen p-6"
      style={{
        backgroundColor: "var(--vscode-editor-background)",
        color: "var(--vscode-foreground)",
      }}
    >
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-tinker-copper/20 flex items-center justify-center">
            <Key size={20} className="text-tinker-copper" />
          </div>
          <div>
            <h1
              className="text-xl font-bold"
              style={{ color: "var(--vscode-foreground)" }}
            >
              API & Model Configuration
            </h1>
            <p
              className="text-sm"
              style={{ color: "var(--vscode-descriptionForeground)" }}
            >
              Configure API keys and models for each provider
            </p>
          </div>
        </div>

        {/* Save Status Toast */}
        {saveStatus && (
          <div className="fixed top-4 right-4 px-4 py-2 bg-green-500/20 border border-green-500/40 rounded-lg text-green-400 text-sm flex items-center gap-2 z-50">
            <Check size={14} />
            {saveStatus}
          </div>
        )}

        {/* Provider Tabs */}
        <div
          className="flex gap-1 mb-6 rounded-xl p-1"
          style={{ backgroundColor: "var(--vscode-input-background)" }}
        >
          {providers.map((p) => {
            const Icon = p.icon;
            const hasKey = keyStatus[p.value];
            const isActive = activeProvider === p.value;
            return (
              <button
                key={p.value}
                onClick={() => setActiveProvider(p.value)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-all flex-1 justify-center ${
                  isActive ? "border border-tinker-copper/50" : ""
                }`}
                style={{
                  backgroundColor: isActive
                    ? "var(--vscode-editor-background)"
                    : "transparent",
                  color: isActive
                    ? "var(--vscode-foreground)"
                    : "var(--vscode-descriptionForeground)",
                }}
              >
                <Icon size={16} />
                <span>{p.label}</span>
                {hasKey && <Check size={12} className="text-green-400" />}
              </button>
            );
          })}
        </div>

        {/* Provider Config Card */}
        <div
          className="rounded-2xl border p-6 space-y-6"
          style={{
            borderColor: "var(--vscode-panel-border)",
            backgroundColor: "var(--vscode-input-background)",
          }}
        >
          {/* API Key Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Key size={14} className="text-tinker-copper" />
                <label
                  className="text-sm font-medium"
                  style={{ color: "var(--vscode-foreground)" }}
                >
                  {currentProvider?.label} API Key
                </label>
                {keyStatus[activeProvider] && (
                  <span className="text-xs text-green-400 flex items-center gap-1 bg-green-500/10 px-2 py-0.5 rounded-full">
                    <Check size={10} /> Saved
                  </span>
                )}
              </div>
              {keyStatus[activeProvider] && (
                <button
                  onClick={() => handleDeleteApiKey(activeProvider)}
                  className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 hover:bg-red-500/10 px-2 py-1 rounded-lg transition-colors"
                >
                  <Trash2 size={12} />
                  Delete Key
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <div
                className="flex-1 relative rounded-xl border focus-within:border-tinker-copper/50 transition-colors"
                style={{
                  backgroundColor: "var(--vscode-editor-background)",
                  borderColor: "var(--vscode-panel-border)",
                }}
              >
                <input
                  type={showKeys[activeProvider] ? "text" : "password"}
                  value={apiKeys[activeProvider]}
                  onChange={(e) =>
                    setApiKeys((prev) => ({
                      ...prev,
                      [activeProvider]: e.target.value,
                    }))
                  }
                  placeholder={
                    keyStatus[activeProvider]
                      ? "Enter new key to replace..."
                      : "Enter API key"
                  }
                  className="w-full bg-transparent rounded-xl px-4 py-3 pr-12 text-sm text-white placeholder:text-white/30 focus:outline-none"
                />
                <button
                  onClick={() =>
                    setShowKeys((prev) => ({
                      ...prev,
                      [activeProvider]: !prev[activeProvider],
                    }))
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                >
                  {showKeys[activeProvider] ? (
                    <EyeOff size={14} />
                  ) : (
                    <Eye size={14} />
                  )}
                </button>
              </div>
              <button
                onClick={() => handleSaveApiKey(activeProvider)}
                disabled={!apiKeys[activeProvider]}
                className="px-5 py-3 rounded-xl bg-tinker-copper text-white text-sm font-medium hover:bg-tinker-copper/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Save size={14} />
                Save Key
              </button>
            </div>

            <p className="text-xs text-white/40 mt-2">
              {keyStatus[activeProvider]
                ? "Key is stored securely in VS Code's encrypted storage"
                : "API key will be saved to VS Code's secure storage"}
            </p>
          </div>

          {/* Azure Endpoint (only for Azure) */}
          {activeProvider === "azure" && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Box size={14} className="text-blue-400" />
                <label className="text-sm font-medium text-white/80">
                  Azure Endpoint
                </label>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={azureEndpoint}
                  onChange={(e) => setAzureEndpoint(e.target.value)}
                  placeholder="https://your-resource.openai.azure.com"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
                />
                <button
                  onClick={handleSaveAzureEndpoint}
                  className="px-5 py-3 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-500/90 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Bedrock AWS Credentials (only for Bedrock) */}
          {activeProvider === "bedrock" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Globe size={14} className="text-orange-400" />
                <label className="text-sm font-medium text-white/80">
                  AWS Credentials
                </label>
                {keyStatus.bedrock && (
                  <span className="text-xs text-green-400 flex items-center gap-1 bg-green-500/10 px-2 py-0.5 rounded-full">
                    <Check size={10} /> Configured
                  </span>
                )}
              </div>
              <p className="text-xs text-white/40 mb-3">
                Enter your AWS credentials to access Claude models via Amazon
                Bedrock
              </p>

              {/* Access Key */}
              <div>
                <label className="text-xs text-white/60 mb-1 block">
                  AWS Access Key ID
                </label>
                <input
                  type="text"
                  value={bedrockConfig.awsAccessKey}
                  onChange={(e) =>
                    setBedrockConfig((prev) => ({
                      ...prev,
                      awsAccessKey: e.target.value,
                    }))
                  }
                  placeholder="AKIAIOSFODNN7EXAMPLE"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/50"
                />
              </div>

              {/* Secret Key */}
              <div>
                <label className="text-xs text-white/60 mb-1 block">
                  AWS Secret Access Key
                </label>
                <div className="relative">
                  <input
                    type={showBedrockSecretKey ? "text" : "password"}
                    value={bedrockConfig.awsSecretKey}
                    onChange={(e) =>
                      setBedrockConfig((prev) => ({
                        ...prev,
                        awsSecretKey: e.target.value,
                      }))
                    }
                    placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/50"
                  />
                  <button
                    onClick={() => setShowBedrockSecretKey((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors"
                  >
                    {showBedrockSecretKey ? (
                      <EyeOff size={14} />
                    ) : (
                      <Eye size={14} />
                    )}
                  </button>
                </div>
              </div>

              {/* Region */}
              <div>
                <label className="text-xs text-white/60 mb-1 block">
                  AWS Region
                </label>
                <input
                  type="text"
                  value={bedrockConfig.awsRegion}
                  onChange={(e) =>
                    setBedrockConfig((prev) => ({
                      ...prev,
                      awsRegion: e.target.value,
                    }))
                  }
                  placeholder="us-east-1"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/50"
                />
              </div>

              <button
                onClick={handleSaveBedrockConfig}
                disabled={
                  !bedrockConfig.awsAccessKey || !bedrockConfig.awsSecretKey
                }
                className="w-full px-5 py-3 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-500/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Save size={14} />
                Save AWS Credentials
              </button>
            </div>
          )}

          {/* Models Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Box size={14} className="text-purple-400" />
                <label className="text-sm font-medium text-white/80">
                  {currentProvider?.label} Models
                </label>
              </div>
              <button
                onClick={handleSaveModels}
                disabled={isSaving}
                className="px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 text-xs font-medium hover:bg-purple-500/30 transition-colors disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save Models"}
              </button>
            </div>

            <ModelManager
              models={customModels[activeProvider] || []}
              onChange={(models) =>
                updateModelsForProvider(activeProvider, models)
              }
              placeholder={`Add ${currentProvider?.label} model name...`}
            />
          </div>
        </div>

        {/* Quick Tips */}
        <div
          className="mt-6 p-4 rounded-xl border"
          style={{
            borderColor: "var(--vscode-panel-border)",
            backgroundColor: "var(--vscode-input-background)",
          }}
        >
          <h3
            className="text-sm font-medium mb-2"
            style={{ color: "var(--vscode-foreground)" }}
          >
            Tips
          </h3>
          <ul
            className="text-xs space-y-1"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            <li>
              • API keys are stored securely in VS Code's encrypted storage
            </li>
            <li>• Each provider has its own independent API key storage</li>
            <li>
              • Models you add here will appear in the chat sidebar dropdown
            </li>
            <li>• Changes are saved and synced immediately to the sidebar</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// Mount the app
const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<ConfigPanel />);
}

export default ConfigPanel;
