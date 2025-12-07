// @ts-nocheck
import React, { useState, useRef } from "react";
import { X, Plus } from "lucide-react";

/**
 * ModelManager - Tag chip input for managing custom models
 * Press Enter to add a model, click X to remove
 * Theme-aware styling using VS Code CSS variables
 */
function ModelManager({ models = [], onChange, placeholder = "Add model..." }) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      const newModel = inputValue.trim();
      // Avoid duplicates
      if (!models.includes(newModel)) {
        onChange([...models, newModel]);
      }
      setInputValue("");
    } else if (e.key === "Backspace" && !inputValue && models.length > 0) {
      // Remove last model on backspace when input is empty
      onChange(models.slice(0, -1));
    }
  };

  const removeModel = (index) => {
    onChange(models.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {/* Model chips */}
      {models.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {models.map((model, index) => (
            <div
              key={model}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border"
              style={{
                backgroundColor: "var(--vscode-badge-background)",
                borderColor: "var(--vscode-panel-border)",
                color: "var(--vscode-badge-foreground)",
              }}
            >
              <span className="max-w-[160px] truncate">{model}</span>
              <button
                onClick={() => removeModel(index)}
                className="hover:text-red-400 transition-colors"
                style={{ color: "var(--vscode-descriptionForeground)" }}
                aria-label={`Remove ${model}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add input */}
      <div
        className="relative rounded-xl border"
        style={{ borderColor: "var(--vscode-panel-border)" }}
      >
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-tinker-copper/50"
            style={{
              backgroundColor: "var(--vscode-input-background)",
              color: "var(--vscode-input-foreground)",
            }}
          />
          <button
            onClick={() => {
              if (inputValue.trim() && !models.includes(inputValue.trim())) {
                onChange([...models, inputValue.trim()]);
                setInputValue("");
              }
            }}
            disabled={!inputValue.trim()}
            className="absolute right-2 p-1.5 rounded-lg hover:text-tinker-copper transition-colors disabled:opacity-30"
            style={{ color: "var(--vscode-descriptionForeground)" }}
            aria-label="Add model"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
      <p
        className="text-[10px]"
        style={{ color: "var(--vscode-descriptionForeground)" }}
      >
        Press Enter to add
      </p>
    </div>
  );
}

export default ModelManager;
