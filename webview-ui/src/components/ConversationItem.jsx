// @ts-nocheck
import React from "react";
import { Pin, PinOff, Trash2 } from "lucide-react";

/**
 * Individual conversation item in the popup list
 */
function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onTogglePin,
  onDelete,
}) {
  const { id, title, isPinned, updatedAt, messageCount } = conversation;

  // Format relative date
  const getRelativeDate = (timestamp) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "Just now";
  };

  return (
    <div
      className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 ${
        isActive
          ? "bg-tinker-copper/15 border-l-2 border-tinker-copper"
          : "hover:bg-black/5 dark:hover:bg-white/5"
      }`}
      onClick={() => onSelect(id)}
      style={{
        backgroundColor: isActive ? undefined : undefined,
      }}
    >
      {/* Pin indicator */}
      {isPinned && (
        <div className="absolute -left-0.5 top-1/2 -translate-y-1/2 w-1 h-4 bg-tinker-copper rounded-r" />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="font-medium text-sm truncate"
            style={{ color: "var(--vscode-foreground)" }}
          >
            {title || "New Chat"}
          </span>
          {isPinned && (
            <Pin size={12} className="text-tinker-copper flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className="text-xs"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            {getRelativeDate(updatedAt)}
          </span>
          {messageCount > 0 && (
            <span
              className="text-xs"
              style={{ color: "var(--vscode-descriptionForeground)" }}
            >
              · {messageCount} msg{messageCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Actions - show on hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(id);
          }}
          className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          style={{ color: "var(--vscode-descriptionForeground)" }}
          title={isPinned ? "Unpin" : "Pin"}
        >
          {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(id);
          }}
          className="p-1 rounded hover:bg-red-500/20 text-red-500 transition-colors"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default ConversationItem;
