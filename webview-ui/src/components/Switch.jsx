import React from "react";
import clsx from "clsx";

/**
 * Modern toggle switch component - theme-aware
 */
function Switch({ checked, onChange, disabled, size = "md" }) {
  const sizes = {
    sm: { track: "w-8 h-4", thumb: "w-3 h-3", translate: "translate-x-4" },
    md: { track: "w-10 h-5", thumb: "w-4 h-4", translate: "translate-x-5" },
    lg: { track: "w-12 h-6", thumb: "w-5 h-5", translate: "translate-x-6" },
  };

  const s = sizes[size] || sizes.md;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange?.(!checked)}
      disabled={disabled}
      className={clsx(
        "relative inline-flex flex-shrink-0 rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-tinker-copper/50",
        s.track,
        checked ? "bg-tinker-copper" : "",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      style={{
        backgroundColor: checked ? undefined : "var(--vscode-input-background)",
        border: checked ? "none" : "1px solid var(--vscode-panel-border)",
      }}
    >
      <span
        className={clsx(
          "pointer-events-none inline-block rounded-full shadow-lg transform transition-transform duration-200 ease-in-out",
          s.thumb,
          "absolute top-1/2 -translate-y-1/2 left-0.5",
          checked && s.translate
        )}
        style={{
          backgroundColor: checked ? "white" : "var(--vscode-foreground)",
        }}
      />
    </button>
  );
}

export default Switch;
