import React, { useRef, useEffect } from "react";

/**
 * ChipInput - Modern textarea with auto-resize up to 25% viewport height
 */
function ChipInput({
  value,
  onChange,
  onKeyDown,
  placeholder,
  disabled,
  inputRef: externalRef,
}) {
  const internalRef = useRef(null);
  const ref = externalRef || internalRef;

  // Auto-resize textarea up to 25% of viewport height
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      const maxHeight = Math.min(window.innerHeight * 0.25, 300);
      ref.current.style.height =
        Math.min(ref.current.scrollHeight, maxHeight) + "px";
    }
  }, [value, ref]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      rows={1}
      className="w-full bg-transparent text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-input-placeholderForeground)] resize-none focus:outline-none text-sm leading-relaxed"
      style={{ minHeight: "24px" }}
    />
  );
}

export default ChipInput;
