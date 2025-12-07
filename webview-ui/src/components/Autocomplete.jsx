import React, { useEffect, useRef } from "react";
import { FileText, Code, Search } from "lucide-react";
import clsx from "clsx";

/**
 * Autocomplete dropdown for file/symbol search - theme-aware
 * Parent component handles positioning
 */
function Autocomplete({ items, type, onSelect, selectedIndex = -1 }) {
  const listRef = useRef(null);
  const Icon = type === "file" ? FileText : Code;

  useEffect(() => {
    // Scroll selected item into view
    if (selectedIndex >= 0 && listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex + 1]; // +1 for header
      selectedElement?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!items || items.length === 0) {
    return (
      <div
        className="rounded-lg border shadow-xl overflow-hidden"
        style={{
          backgroundColor: "var(--vscode-dropdown-background)",
          borderColor: "var(--vscode-dropdown-border)",
        }}
      >
        <div
          className="flex items-center gap-2 px-3 py-3 text-xs"
          style={{ color: "var(--vscode-descriptionForeground)" }}
        >
          <Search size={14} />
          <span>No results found</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="rounded-lg border shadow-xl overflow-hidden max-h-60 overflow-y-auto"
      style={{
        backgroundColor: "var(--vscode-dropdown-background)",
        borderColor: "var(--vscode-dropdown-border)",
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-1.5 text-[10px] uppercase tracking-wider border-b sticky top-0"
        style={{
          color: "var(--vscode-descriptionForeground)",
          borderColor: "var(--vscode-panel-border)",
          backgroundColor: "var(--vscode-dropdown-background)",
        }}
      >
        {type === "file" ? "Files" : "Symbols"}
      </div>

      {items.map((item, index) => (
        <div
          key={index}
          onClick={() => onSelect(item)}
          className={clsx(
            "flex items-center gap-2 px-3 py-2 text-xs cursor-pointer transition-colors"
          )}
          style={{
            backgroundColor:
              selectedIndex === index
                ? "var(--vscode-list-activeSelectionBackground)"
                : "transparent",
            color:
              selectedIndex === index
                ? "var(--vscode-list-activeSelectionForeground)"
                : "var(--vscode-foreground)",
          }}
          onMouseEnter={(e) => {
            if (selectedIndex !== index) {
              e.currentTarget.style.backgroundColor =
                "var(--vscode-list-hoverBackground)";
            }
          }}
          onMouseLeave={(e) => {
            if (selectedIndex !== index) {
              e.currentTarget.style.backgroundColor = "transparent";
            }
          }}
        >
          <Icon size={14} className="text-tinker-copper/70 flex-shrink-0" />
          <span className="truncate" style={{ color: "inherit" }}>
            {item.label}
          </span>
          {item.detail && (
            <span
              className="text-[10px] ml-auto truncate max-w-[120px]"
              style={{ color: "var(--vscode-descriptionForeground)" }}
            >
              {item.detail}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default Autocomplete;
