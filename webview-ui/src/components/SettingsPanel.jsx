// @ts-nocheck
import React, { useState, useEffect } from "react";
import { X, Save, Settings, Key, ExternalLink } from "lucide-react";
import { useVSCodeMessage } from "../hooks/useVSCodeMessage";
import {
  OpenAIIcon,
  ClaudeIcon,
  GeminiIcon,
  AzureIcon,
  BedrockIcon,
} from "../icons";
import Switch from "./Switch";

const providers = [
  { value: "openai", label: "OpenAI", icon: OpenAIIcon },
  { value: "anthropic", label: "Anthropic", icon: ClaudeIcon },
  { value: "gemini", label: "Gemini", icon: GeminiIcon },
  { value: "azure", label: "Azure", icon: AzureIcon },
  { value: "bedrock", label: "Bedrock", icon: BedrockIcon },
];

function SettingsPanel({ onClose }) {
  // Current active provider/model for chat
  const [selectedProvider, setSelectedProvider] = useState("openai");
  const [selectedModel, setSelectedModel] = useState("");
  const [useResponsesAPI, setUseResponsesAPI] = useState(false);

  // Which providers have saved keys
  const [keyStatus, setKeyStatus] = useState({
    openai: false,
    anthropic: false,
    gemini: false,
    azure: false,
    bedrock: false,
  });

  const [isSaving, setIsSaving] = useState(false);

  const vscode = useVSCodeMessage((message) => {
    if (message.type === "settingsLoaded") {
      setSelectedProvider(message.settings.provider || "openai");
      setSelectedModel(message.settings.model || "");
      setUseResponsesAPI(message.settings.useResponsesAPI || false);
    } else if (message.type === "providerKeysLoaded") {
      setKeyStatus(message.keyStatus || {});
    }
  });

  useEffect(() => {
    vscode.postMessage({ type: "loadSettings" });
    vscode.postMessage({ type: "loadAllProviderKeys" });
  }, []);

  const handleOpenConfigPanel = () => {
    vscode.postMessage({ type: "openConfigPanel" });
    onClose();
  };

  const handleSave = () => {
    setIsSaving(true);

    vscode.postMessage({
      type: "saveSettings",
      settings: {
        provider: selectedProvider,
        model: selectedModel,
        useResponsesAPI,
        rememberApiKey: true,
      },
    });

    setTimeout(() => {
      setIsSaving(false);
      onClose();
    }, 300);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div
        className="rounded-2xl border shadow-2xl max-w-md w-full"
        style={{
          borderColor: "var(--vscode-panel-border)",
          backgroundColor: "var(--vscode-editor-background)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--vscode-panel-border)" }}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-tinker-copper/20 flex items-center justify-center">
              <Settings size={16} className="text-tinker-copper" />
            </div>
            <h2
              className="text-base font-semibold"
              style={{ color: "var(--vscode-foreground)" }}
            >
              Quick Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            style={{ color: "var(--vscode-descriptionForeground)" }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Configure API Button */}
          <button
            onClick={handleOpenConfigPanel}
            className="w-full flex items-center gap-3 p-4 rounded-xl border transition-all group"
            style={{
              borderColor: "var(--vscode-panel-border)",
              backgroundColor: "var(--vscode-input-background)",
            }}
          >
            <div className="w-10 h-10 rounded-lg bg-tinker-copper/20 flex items-center justify-center">
              <Key size={18} className="text-tinker-copper" />
            </div>
            <div className="flex-1 text-left">
              <div
                className="text-sm font-medium"
                style={{ color: "var(--vscode-foreground)" }}
              >
                Configure API Keys & Models
              </div>
              <div
                className="text-xs"
                style={{ color: "var(--vscode-descriptionForeground)" }}
              >
                Add API keys and customize models per provider
              </div>
            </div>
            <ExternalLink
              size={14}
              style={{ color: "var(--vscode-descriptionForeground)" }}
            />
          </button>

          {/* Active Provider Selection */}
          <div>
            <label
              className="block text-xs font-medium mb-3 uppercase tracking-wider"
              style={{ color: "var(--vscode-descriptionForeground)" }}
            >
              Active Provider
            </label>
            <div className="grid grid-cols-2 gap-2">
              {providers.map((p) => {
                const Icon = p.icon;
                const isSelected = selectedProvider === p.value;
                const hasKey = keyStatus[p.value];
                return (
                  <button
                    key={p.value}
                    onClick={() => setSelectedProvider(p.value)}
                    disabled={!hasKey}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs transition-all border ${
                      isSelected
                        ? "bg-tinker-copper/20 border-tinker-copper/40"
                        : hasKey
                        ? "hover:bg-black/5 dark:hover:bg-white/10"
                        : "opacity-50 cursor-not-allowed"
                    }`}
                    style={{
                      color:
                        isSelected || hasKey
                          ? "var(--vscode-foreground)"
                          : "var(--vscode-descriptionForeground)",
                      borderColor: isSelected
                        ? undefined
                        : "var(--vscode-panel-border)",
                    }}
                  >
                    <Icon size={14} />
                    <span>{p.label}</span>
                    {!hasKey && (
                      <span
                        className="ml-auto text-[10px]"
                        style={{ color: "var(--vscode-descriptionForeground)" }}
                      >
                        No key
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Responses API Toggle (OpenAI/Azure only) */}
          {(selectedProvider === "openai" || selectedProvider === "azure") && (
            <div
              className="flex items-center gap-3 p-3 rounded-xl border"
              style={{
                borderColor: "var(--vscode-panel-border)",
                backgroundColor: "var(--vscode-input-background)",
              }}
            >
              <div className="flex-1">
                <div
                  className="text-sm"
                  style={{ color: "var(--vscode-foreground)" }}
                >
                  Use Responses API
                </div>
                <div
                  className="text-[10px]"
                  style={{ color: "var(--vscode-descriptionForeground)" }}
                >
                  For o1, gpt-5.1 models
                </div>
              </div>
              <Switch
                checked={useResponsesAPI}
                onChange={setUseResponsesAPI}
                size="sm"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex gap-2 px-5 py-4 border-t"
          style={{ borderColor: "var(--vscode-panel-border)" }}
        >
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-tinker-copper text-white text-sm font-medium hover:bg-tinker-copper/90 transition-colors disabled:opacity-50"
          >
            <Save size={14} />
            {isSaving ? "Saving..." : "Save & Close"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm transition-colors border"
            style={{
              borderColor: "var(--vscode-panel-border)",
              color: "var(--vscode-foreground)",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
