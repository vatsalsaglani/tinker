// @ts-nocheck
import React, { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";

/**
 * Flexible Dropdown component with directional support
 *
 * Usage:
 * <Dropdown
 *   value={selectedValue}
 *   onChange={setValue}
 *   direction="top"
 *   triggerClassName="..."
 *   menuClassName="..."
 * >
 *   <Dropdown.Option value="opt1" icon={Icon} iconPosition="left">Label</Dropdown.Option>
 *   <Dropdown.Option value="opt2">Simple Label</Dropdown.Option>
 * </Dropdown>
 */

// Direction positioning map
const directionStyles = {
  top: "bottom-full left-0 mb-1",
  bottom: "top-full left-0 mt-1",
  left: "right-full top-0 mr-1",
  right: "left-full top-0 ml-1",
  "top-left": "bottom-full right-0 mb-1",
  "top-right": "bottom-full left-0 mb-1",
  "bottom-left": "top-full right-0 mt-1",
  "bottom-right": "top-full left-0 mt-1",
};

// Option sub-component
function DropdownOption({
  value,
  children,
  icon: Icon,
  iconPosition = "left",
  iconRight: IconRight,
  className,
  selected,
  onSelect,
  disabled,
}) {
  return (
    <div
      onClick={() => !disabled && onSelect?.(value)}
      className={clsx(
        "flex items-center gap-2 px-3 py-2 text-xs cursor-pointer transition-colors",
        disabled && "opacity-40 cursor-not-allowed",
        className
      )}
      style={{
        backgroundColor: selected
          ? "var(--vscode-list-activeSelectionBackground)"
          : "transparent",
        color: selected
          ? "var(--vscode-list-activeSelectionForeground)"
          : "var(--vscode-foreground)",
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.backgroundColor =
            "var(--vscode-list-hoverBackground)";
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.backgroundColor = "transparent";
        }
      }}
    >
      {Icon && iconPosition === "left" && (
        <Icon
          size={14}
          className="flex-shrink-0"
          style={{ color: "var(--vscode-descriptionForeground)" }}
        />
      )}
      <span className="flex-1 truncate">{children}</span>
      {IconRight && (
        <IconRight
          size={14}
          className="flex-shrink-0"
          style={{ color: "var(--vscode-descriptionForeground)" }}
        />
      )}
      {Icon && iconPosition === "right" && (
        <Icon
          size={14}
          className="flex-shrink-0"
          style={{ color: "var(--vscode-descriptionForeground)" }}
        />
      )}
    </div>
  );
}

// Main Dropdown component
function Dropdown({
  value,
  onChange,
  children,
  direction = "bottom",
  triggerClassName,
  menuClassName,
  placeholder = "Select...",
  disabled,
  showArrow = true,
  icon: TriggerIcon,
  iconPosition = "left",
  renderValue, // New prop: custom render function for display value
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  // Get currently selected option's label
  const getSelectedLabel = useCallback(() => {
    // Use custom renderValue if provided
    if (renderValue && value) {
      return renderValue(value);
    }

    const options = React.Children.toArray(children);
    const selected = options.find(
      (child) => React.isValidElement(child) && child.props.value === value
    );
    return selected ? selected.props.children : placeholder;
  }, [children, value, placeholder, renderValue]);

  // Get selected option's icon
  const getSelectedIcon = useCallback(() => {
    const options = React.Children.toArray(children);
    const selected = options.find(
      (child) => React.isValidElement(child) && child.props.value === value
    );
    return selected?.props?.icon || TriggerIcon || null;
  }, [children, value, TriggerIcon]);

  const handleSelect = (newValue) => {
    onChange?.(newValue);
    setIsOpen(false);
  };

  const SelectedIcon = getSelectedIcon();

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={clsx(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border",
          "transition-all focus:outline-none focus:ring-1 focus:ring-tinker-copper/30",
          disabled && "opacity-40 cursor-not-allowed",
          triggerClassName
        )}
        style={{
          backgroundColor: "var(--vscode-input-background)",
          borderColor: "var(--vscode-panel-border)",
          color: "var(--vscode-foreground)",
        }}
      >
        {SelectedIcon && iconPosition === "left" && (
          <SelectedIcon
            size={14}
            style={{ color: "var(--vscode-descriptionForeground)" }}
          />
        )}
        <span style={{ color: "var(--vscode-foreground)" }}>
          {getSelectedLabel()}
        </span>
        {SelectedIcon && iconPosition === "right" && (
          <SelectedIcon
            size={14}
            style={{ color: "var(--vscode-descriptionForeground)" }}
          />
        )}
        {showArrow && (
          <ChevronDown
            size={12}
            className={clsx("transition-transform", isOpen && "rotate-180")}
            style={{ color: "var(--vscode-descriptionForeground)" }}
          />
        )}
      </button>

      {/* Menu */}
      {isOpen && (
        <div
          className={clsx(
            "absolute z-[100] min-w-full rounded-lg overflow-hidden border shadow-xl",
            directionStyles[direction] || directionStyles.bottom,
            menuClassName
          )}
          style={{
            backgroundColor: "var(--vscode-dropdown-background)",
            borderColor: "var(--vscode-dropdown-border)",
          }}
        >
          {React.Children.map(children, (child) => {
            if (!React.isValidElement(child)) return null;

            return React.cloneElement(child, {
              selected: child.props.value === value,
              onSelect: handleSelect,
            });
          })}
        </div>
      )}
    </div>
  );
}

// Attach Option as static property
Dropdown.Option = DropdownOption;

export default Dropdown;
