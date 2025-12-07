import React from "react";
import { FileText, Code, TextSelect as Selection, X } from "lucide-react";
import clsx from "clsx";

const chipIcons = {
  file: FileText,
  symbol: Code,
  selection: Selection,
};

function ContextChip({ chip, onRemove, onClick }) {
  const Icon = chipIcons[chip.type] || FileText;

  return (
    <div
      className={clsx(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border",
        "transition-all",
        onClick && "cursor-pointer"
      )}
      style={{
        backgroundColor: "var(--vscode-badge-background)",
        borderColor: "var(--vscode-panel-border)",
      }}
      onClick={onClick}
    >
      <Icon size={12} className="text-tinker-copper/80" />
      <span
        className="max-w-[150px] truncate"
        style={{ color: "var(--vscode-badge-foreground)" }}
      >
        {chip.display}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="ml-0.5 hover:text-red-400 transition-colors"
        style={{ color: "var(--vscode-descriptionForeground)" }}
        aria-label="Remove"
      >
        <X size={11} />
      </button>
    </div>
  );
}

export default ContextChip;
