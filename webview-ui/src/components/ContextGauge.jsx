// @ts-nocheck
import React, { useState, useRef, useEffect } from "react";

/**
 * Get color for context gauge based on percentage
 */
const getGaugeColor = (percentage, status) => {
  if (status === "critical") return "#ef4444"; // red-500
  if (status === "warning") return "#f97316"; // orange-500
  if (percentage >= 50) return "#eab308"; // yellow-500
  return "#22c55e"; // green-500
};

/**
 * Format token counts
 */
const formatTokens = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toLocaleString();
};

/**
 * Context Gauge as Bottom Progress Bar
 * Full-width thin progress bar with hover tooltip
 */
const ContextGauge = ({ contextStatus }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  if (!contextStatus) return null;

  const {
    usedPercentage = 0,
    currentTokens = 0,
    maxTokens = 128000,
    remainingTokens = 0,
    status = "normal",
  } = contextStatus;

  const percentage = Math.min(100, Math.max(0, usedPercentage));
  const color = getGaugeColor(percentage, status);

  const handleMouseEnter = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setTooltipPos({
        x: rect.left + rect.width / 2,
        y: rect.top - 10, // 10px above the gauge
      });
    }
    setShowTooltip(true);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full cursor-help"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Progress bar container */}
      <div
        className="w-full h-1.5 rounded-full overflow-hidden"
        style={{ backgroundColor: "var(--vscode-panel-border)" }}
      >
        {/* Progress fill */}
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
          }}
        />
      </div>

      {/* Percentage label on the right */}
      <div
        className="absolute right-0 top-2 text-[9px] font-medium"
        style={{ color }}
      >
        {Math.round(percentage)}%
      </div>

      {/* Hover tooltip - fixed position to escape stacking context */}
      {showTooltip && (
        <div
          className="fixed z-[9999] px-3 py-2 text-xs rounded-lg shadow-lg whitespace-nowrap"
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
            transform: "translate(-50%, -100%)",
            backgroundColor: "var(--vscode-editorHoverWidget-background)",
            color: "var(--vscode-editorHoverWidget-foreground)",
            border: "1px solid var(--vscode-editorHoverWidget-border)",
          }}
        >
          <div className="font-semibold mb-1" style={{ color }}>
            Context: {Math.round(percentage)}% used
          </div>
          <div
            className="space-y-0.5 text-[10px]"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            <div>Used: {formatTokens(currentTokens)} tokens</div>
            <div>Max: {formatTokens(maxTokens)} tokens</div>
            <div>Remaining: {formatTokens(remainingTokens)} tokens</div>
          </div>
          {status === "warning" && (
            <div className="mt-1.5 text-[10px] text-orange-400">
              ⚠️ Approaching context limit
            </div>
          )}
          {status === "critical" && (
            <div className="mt-1.5 text-[10px] text-red-400">
              🔴 Context almost full!
            </div>
          )}
          {/* Arrow */}
          <div
            className="absolute w-2 h-2 transform rotate-45"
            style={{
              left: "50%",
              bottom: "-5px",
              marginLeft: "-4px",
              backgroundColor: "var(--vscode-editorHoverWidget-background)",
              borderRight: "1px solid var(--vscode-editorHoverWidget-border)",
              borderBottom: "1px solid var(--vscode-editorHoverWidget-border)",
            }}
          />
        </div>
      )}
    </div>
  );
};

export default ContextGauge;
