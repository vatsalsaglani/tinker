// @ts-nocheck
import React, { useState, useRef } from "react";
import { X, Plus, ChevronDown, ChevronUp, HelpCircle } from "lucide-react";

/**
 * BedrockModelManager - Manages Bedrock models with display name → model ID mapping
 * Allows users to add friendly names for long AWS ARNs or Inference Profile IDs
 */
function BedrockModelManager({ models = [], onChange, onSave }) {
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newModelId, setNewModelId] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const displayNameRef = useRef(null);

  const handleAdd = () => {
    if (newDisplayName.trim() && newModelId.trim()) {
      const newModel = {
        displayName: newDisplayName.trim(),
        modelId: newModelId.trim(),
      };
      // Avoid duplicates by display name
      if (!models.some((m) => m.displayName === newModel.displayName)) {
        onChange([...models, newModel]);
        setNewDisplayName("");
        setNewModelId("");
        displayNameRef.current?.focus();
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && newDisplayName.trim() && newModelId.trim()) {
      e.preventDefault();
      handleAdd();
    }
  };

  const removeModel = (index) => {
    onChange(models.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {/* Help Toggle */}
      <button
        onClick={() => setShowHelp(!showHelp)}
        className="flex items-center gap-1 text-xs transition-colors"
        style={{ color: "var(--vscode-descriptionForeground)" }}
      >
        <HelpCircle size={12} />
        <span>What's a Model ID, ARN, or Inference Profile?</span>
        {showHelp ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {/* Help Content */}
      {showHelp && (
        <div
          className="p-3 rounded-lg text-xs space-y-2"
          style={{
            backgroundColor: "var(--vscode-editor-background)",
            border: "1px solid var(--vscode-panel-border)",
          }}
        >
          <p>
            <strong>Model ID:</strong> Standard Bedrock model identifier
          </p>
          <code
            className="block px-2 py-1 rounded text-[10px]"
            style={{ backgroundColor: "var(--vscode-input-background)" }}
          >
            anthropic.claude-sonnet-4-20250514-v1:0
          </code>

          <p className="mt-2">
            <strong>ARN:</strong> Amazon Resource Name for cross-region
            inference
          </p>
          <code
            className="block px-2 py-1 rounded text-[10px] break-all"
            style={{ backgroundColor: "var(--vscode-input-background)" }}
          >
            arn:aws:bedrock:us-east-1:123456789012:inference-profile/...
          </code>

          <p className="mt-2">
            <strong>Inference Profile:</strong> Cross-region inference profile
            ID
          </p>
          <code
            className="block px-2 py-1 rounded text-[10px] break-all"
            style={{ backgroundColor: "var(--vscode-input-background)" }}
          >
            us.anthropic.claude-3-5-sonnet-20241022-v2:0
          </code>
        </div>
      )}

      {/* Existing Models */}
      {models.length > 0 && (
        <div className="space-y-2">
          {models.map((model, index) => (
            <div
              key={model.displayName}
              className="flex items-start gap-2 p-3 rounded-lg border"
              style={{
                backgroundColor: "var(--vscode-editor-background)",
                borderColor: "var(--vscode-panel-border)",
              }}
            >
              <div className="flex-1 min-w-0">
                <div
                  className="font-medium text-sm"
                  style={{ color: "var(--vscode-foreground)" }}
                >
                  {model.displayName}
                </div>
                <div
                  className="text-xs truncate mt-0.5"
                  style={{ color: "var(--vscode-descriptionForeground)" }}
                  title={model.modelId}
                >
                  {model.modelId}
                </div>
              </div>
              <button
                onClick={() => removeModel(index)}
                className="p-1 rounded hover:bg-red-500/10 transition-colors"
                style={{ color: "var(--vscode-descriptionForeground)" }}
                aria-label={`Remove ${model.displayName}`}
              >
                <X size={14} className="hover:text-red-400" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add New Model Form */}
      <div
        className="p-3 rounded-xl border space-y-2"
        style={{
          backgroundColor: "var(--vscode-input-background)",
          borderColor: "var(--vscode-panel-border)",
        }}
      >
        {/* Display Name Input */}
        <div>
          <label
            className="text-xs mb-1 block"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            Display Name
          </label>
          <input
            ref={displayNameRef}
            type="text"
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., Sonnet 4.5"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-tinker-copper/50"
            style={{
              backgroundColor: "var(--vscode-editor-background)",
              color: "var(--vscode-input-foreground)",
              border: "1px solid var(--vscode-panel-border)",
            }}
          />
        </div>

        {/* Model ID / ARN Input */}
        <div>
          <label
            className="text-xs mb-1 block"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            Model ID / ARN / Inference Profile
          </label>
          <input
            type="text"
            value={newModelId}
            onChange={(e) => setNewModelId(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., anthropic.claude-sonnet-4-20250514-v1:0"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-tinker-copper/50"
            style={{
              backgroundColor: "var(--vscode-editor-background)",
              color: "var(--vscode-input-foreground)",
              border: "1px solid var(--vscode-panel-border)",
            }}
          />
        </div>

        {/* Add Button */}
        <button
          onClick={handleAdd}
          disabled={!newDisplayName.trim() || !newModelId.trim()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: "rgba(217, 119, 6, 0.2)",
            color: "#d97706",
          }}
        >
          <Plus size={14} />
          Add Model
        </button>
      </div>

      <p
        className="text-[10px]"
        style={{ color: "var(--vscode-descriptionForeground)" }}
      >
        Enter a friendly display name and the AWS model identifier
      </p>
    </div>
  );
}

export default BedrockModelManager;
