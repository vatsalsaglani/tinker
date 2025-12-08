// @ts-nocheck
import React, { useState, useEffect, useCallback } from "react";
import { X, Plus, MessageSquare, Search } from "lucide-react";
import { useVSCodeMessage } from "../hooks/useVSCodeMessage";
import ConversationItem from "./ConversationItem";

/**
 * Popup overlay showing conversation list
 */
function ConversationPopup({ isOpen, onClose }) {
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

  const vscode = useVSCodeMessage((message) => {
    switch (message.type) {
      case "conversationsLoaded":
        setConversations(message.conversations || []);
        setCurrentConversationId(message.currentConversationId);
        break;
      case "conversationCreated":
        setConversations((prev) => [message.conversation, ...prev]);
        setCurrentConversationId(message.conversation.id);
        break;
      case "conversationSwitched":
        setCurrentConversationId(message.conversationId);
        break;
      case "conversationPinToggled":
        setConversations((prev) =>
          prev.map((c) =>
            c.id === message.conversationId
              ? { ...c, isPinned: message.isPinned }
              : c
          )
        );
        break;
      case "conversationTitleUpdated":
        setConversations((prev) =>
          prev.map((c) =>
            c.id === message.conversationId ? { ...c, title: message.title } : c
          )
        );
        break;
    }
  });

  // Load conversations when popup opens
  useEffect(() => {
    if (isOpen) {
      vscode.postMessage({ type: "loadConversations" });
    }
  }, [isOpen]);

  const handleNewConversation = useCallback(() => {
    vscode.postMessage({ type: "createConversation" });
    onClose();
  }, [vscode, onClose]);

  const handleSelectConversation = useCallback(
    (conversationId) => {
      if (conversationId !== currentConversationId) {
        vscode.postMessage({ type: "switchConversation", conversationId });
      }
      onClose();
    },
    [vscode, currentConversationId, onClose]
  );

  const handleTogglePin = useCallback(
    (conversationId) => {
      vscode.postMessage({ type: "togglePinConversation", conversationId });
    },
    [vscode]
  );

  const handleDeleteConfirm = useCallback(
    (conversationId) => {
      vscode.postMessage({ type: "deleteConversation", conversationId });
      setShowDeleteConfirm(null);
    },
    [vscode]
  );

  // Filter conversations by search query
  const filteredConversations = searchQuery
    ? conversations.filter((c) =>
        (c.title || "New Chat")
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      )
    : conversations;

  // Separate pinned and unpinned
  const pinnedConversations = filteredConversations.filter((c) => c.isPinned);
  const unpinnedConversations = filteredConversations.filter(
    (c) => !c.isPinned
  );

  if (!isOpen) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col"
      style={{ backgroundColor: "var(--vscode-editor-background)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: "var(--vscode-panel-border)" }}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-tinker-copper/20 flex items-center justify-center">
            <MessageSquare size={14} className="text-tinker-copper" />
          </div>
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--vscode-foreground)" }}
          >
            Conversations
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

      {/* Search */}
      <div
        className="px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: "var(--vscode-panel-border)" }}
      >
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{ backgroundColor: "var(--vscode-input-background)" }}
        >
          <Search
            size={14}
            style={{ color: "var(--vscode-descriptionForeground)" }}
          />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-sm"
            style={{ color: "var(--vscode-foreground)" }}
          />
        </div>
      </div>

      {/* New Conversation Button */}
      <div className="px-3 py-2 flex-shrink-0">
        <button
          onClick={handleNewConversation}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition-all duration-150 bg-tinker-copper hover:bg-tinker-copper/90 text-white"
        >
          <Plus size={16} />
          New Conversation
        </button>
      </div>

      {/* Conversation List - flex-1 to fill remaining space */}
      <div className="px-2 pb-3 flex-1 overflow-y-auto">
        {pinnedConversations.length > 0 && (
          <>
            <div
              className="px-2 py-1.5 text-xs font-medium"
              style={{ color: "var(--vscode-descriptionForeground)" }}
            >
              Pinned
            </div>
            {pinnedConversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === currentConversationId}
                onSelect={handleSelectConversation}
                onTogglePin={handleTogglePin}
                onDelete={setShowDeleteConfirm}
              />
            ))}
          </>
        )}

        {unpinnedConversations.length > 0 && (
          <>
            {pinnedConversations.length > 0 && (
              <div
                className="px-2 py-1.5 text-xs font-medium mt-2"
                style={{ color: "var(--vscode-descriptionForeground)" }}
              >
                Recent
              </div>
            )}
            {unpinnedConversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === currentConversationId}
                onSelect={handleSelectConversation}
                onTogglePin={handleTogglePin}
                onDelete={setShowDeleteConfirm}
              />
            ))}
          </>
        )}

        {filteredConversations.length === 0 && (
          <div
            className="text-center py-8 text-sm"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            {searchQuery ? "No matching conversations" : "No conversations yet"}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          className="absolute inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
          onClick={() => setShowDeleteConfirm(null)}
        >
          <div
            className="rounded-xl border p-4 w-full max-w-xs"
            style={{
              borderColor: "var(--vscode-panel-border)",
              backgroundColor: "var(--vscode-editor-background)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              className="font-semibold mb-2"
              style={{ color: "var(--vscode-foreground)" }}
            >
              Delete Conversation?
            </h3>
            <p
              className="text-sm mb-4"
              style={{ color: "var(--vscode-descriptionForeground)" }}
            >
              This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: "var(--vscode-button-secondaryBackground)",
                  color: "var(--vscode-button-secondaryForeground)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteConfirm(showDeleteConfirm)}
                className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConversationPopup;
