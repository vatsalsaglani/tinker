// @ts-nocheck
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import ChatMessage from "./components/ChatMessage";
import ContextChip from "./components/ContextChip";
import Autocomplete from "./components/Autocomplete";
import SettingsPanel from "./components/SettingsPanel";
import ConversationPopup from "./components/ConversationPopup";
import ChipInput from "./components/ChipInput";
import ImageAttachments from "./components/ImageAttachments";
import Dropdown from "./components/Dropdown";
import ContextGauge from "./components/ContextGauge";
import { useVSCodeMessage } from "./hooks/useVSCodeMessage";
import { useChat } from "./hooks/useChat";
import { useAutocomplete } from "./hooks/useAutocomplete";
import {
  Send,
  Settings,
  StopCircle,
  ImagePlus,
  Loader2,
  Square,
  MessageSquare,
  ArrowDown,
} from "lucide-react";
import {
  OpenAIIcon,
  ClaudeIcon,
  GeminiIcon,
  AzureIcon,
  BedrockIcon,
} from "./icons";
import Switch from "./components/Switch";

function Sidebar() {
  const [showSettings, setShowSettings] = useState(false);
  const [showConversations, setShowConversations] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("openai");
  const [selectedModel, setSelectedModel] = useState("");
  const [useResponsesAPI, setUseResponsesAPI] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);

  // Smart scroll state
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);

  // Message windowing - only render last N messages for performance
  const VISIBLE_MESSAGE_COUNT = 5;
  const [visibleStartIndex, setVisibleStartIndex] = useState(0);

  // Custom models per provider (for non-Bedrock providers)
  const [customModels, setCustomModels] = useState({
    openai: ["gpt-4o", "gpt-4", "o1"],
    anthropic: ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022"],
    gemini: ["gemini-2.0-flash-exp", "gemini-1.5-pro"],
    azure: ["gpt-4", "gpt-35-turbo"],
  });

  // Bedrock models with display name → model ID mapping
  const [bedrockModels, setBedrockModels] = useState([
    {
      displayName: "Claude Sonnet 4",
      modelId: "anthropic.claude-sonnet-4-20250514-v1:0",
    },
    {
      displayName: "Claude 3.5 Sonnet",
      modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    },
  ]);

  const {
    messages,
    isGenerating,
    isThinking,
    contextStatus,
    sendMessage,
    stopGeneration,
  } = useChat();

  const {
    contextChips,
    removeContextChip,
    clearContextChips,
    autocompleteItems,
    showAutocomplete,
    autocompleteType,
    selectedIndex,
    handleInputChange,
    selectItem,
    navigateAutocomplete,
    selectCurrentItem,
    triggerIndex,
  } = useAutocomplete();

  const [inputValue, setInputValue] = useState("");
  const [appliedBlocks, setAppliedBlocks] = useState(new Set());
  const [attachedImages, setAttachedImages] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const vscode = useVSCodeMessage((message) => {
    if (message.type === "openContext") {
      // Context chip was clicked - handled by extension
    } else if (message.type === "settingsLoaded") {
      setSelectedProvider(message.settings.provider || "openai");
      setSelectedModel(message.settings.model || "");
      setUseResponsesAPI(message.settings.useResponsesAPI || false);
    } else if (message.type === "customModelsLoaded") {
      setCustomModels(message.models || {});
    } else if (message.type === "bedrockModelsLoaded") {
      setBedrockModels(message.models || []);
    } else if (message.type === "bedrockModelsSaved") {
      setBedrockModels(message.models || []);
    } else if (message.type === "blockApplied") {
      // Mark block as applied - handle both formats:
      // 1. Direct blockKey (from NEW FILE and REWRITE FILE)
      // 2. Components: filePath, blockType, contentHash (from SEARCH/REPLACE)
      let blockKey;
      if (message.blockKey) {
        blockKey = message.blockKey;
      } else {
        const contentHash = message.contentHash || "";
        blockKey = `${message.filePath}:${message.blockType}:${contentHash}`;
      }
      setAppliedBlocks((prev) => new Set(prev).add(blockKey));
    }
  });

  // Load settings on mount
  useEffect(() => {
    vscode.postMessage({ type: "loadSettings" });
    vscode.postMessage({ type: "loadCustomModels" });
  }, []);

  // Update handlers
  const updateProvider = (provider) => {
    setSelectedProvider(provider);
    // Reset to first model of the new provider
    let newModel = "";
    if (provider === "bedrock") {
      // For Bedrock, use modelId from the first model
      newModel = bedrockModels[0]?.modelId || "";
    } else {
      const newProviderModels = customModels[provider] || [];
      newModel = newProviderModels[0] || "";
    }
    setSelectedModel(newModel);
    vscode.postMessage({
      type: "saveSettings",
      settings: { provider, apiKey: "", model: newModel, useResponsesAPI },
    });
  };

  const updateModel = (model) => {
    setSelectedModel(model);
    vscode.postMessage({
      type: "saveSettings",
      settings: {
        provider: selectedProvider,
        apiKey: "",
        model,
        useResponsesAPI,
      },
    });
  };

  const updateResponsesAPI = (value) => {
    setUseResponsesAPI(value);
    vscode.postMessage({
      type: "saveSettings",
      settings: {
        provider: selectedProvider,
        apiKey: "",
        model: selectedModel,
        useResponsesAPI: value,
      },
    });
  };

  // Smart auto-scroll - only scroll if user hasn't scrolled up
  useEffect(() => {
    if (autoScrollEnabled && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, autoScrollEnabled]);

  // Handle scroll to detect if user scrolled up
  const handleMessagesScroll = (e) => {
    const container = e.target;
    const isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      50;

    if (isAtBottom) {
      setIsUserScrolledUp(false);
      setAutoScrollEnabled(true);
    } else {
      setIsUserScrolledUp(true);
      setAutoScrollEnabled(false);
    }
  };

  // Scroll to bottom and resume auto-scroll
  const scrollToBottom = () => {
    setAutoScrollEnabled(true);
    setIsUserScrolledUp(false);
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Calculate visible messages
  const totalMessages = messages.length;
  // visibleStartIndex tracks how many extra messages beyond the default window to show
  const messagesToShow = VISIBLE_MESSAGE_COUNT + visibleStartIndex;
  const effectiveStartIndex = Math.max(0, totalMessages - messagesToShow);
  const visibleMessages = messages.slice(effectiveStartIndex);
  const hasMoreMessages = effectiveStartIndex > 0;

  // Load more messages when clicking button
  const loadMoreMessages = () => {
    setVisibleStartIndex((prev) => prev + VISIBLE_MESSAGE_COUNT);
  };

  const handleSend = () => {
    if (
      !inputValue.trim() &&
      contextChips.length === 0 &&
      attachedImages.length === 0
    )
      return;
    if (isGenerating) return;

    // Reset visible window to show latest messages
    setVisibleStartIndex(0);

    sendMessage(inputValue, contextChips, attachedImages);
    setInputValue("");
    clearContextChips();
    setAttachedImages([]);

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };

  // Image handling functions
  const MAX_IMAGES = 4;

  const addImages = (files) => {
    const remaining = MAX_IMAGES - attachedImages.length;
    if (remaining <= 0) return;

    const imageFiles = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, remaining);

    imageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target.result.split(",")[1];
        setAttachedImages((prev) => [
          ...prev,
          {
            id: `img_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            base64,
            mimeType: file.type,
            name: file.name,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (id) => {
    setAttachedImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleImagePreview = (img) => {
    // Open in VS Code
    vscode.postMessage({
      type: "previewImage",
      image: img,
    });
  };

  // Drag and drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files?.length > 0) {
      addImages(e.dataTransfer.files);
    }
  };

  // Paste handler for images
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems = Array.from(items).filter((item) =>
      item.type.startsWith("image/")
    );

    if (imageItems.length > 0) {
      e.preventDefault();
      const files = imageItems.map((item) => item.getAsFile()).filter(Boolean);
      addImages(files);
    }
  };

  const handleKeyDown = (e) => {
    // Handle autocomplete navigation
    if (showAutocomplete) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        navigateAutocomplete("down");
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        navigateAutocomplete("up");
        return;
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        // Use the same inline replacement as mouse click
        if (selectedIndex >= 0 && autocompleteItems[selectedIndex]) {
          handleAutocompleteSelect(autocompleteItems[selectedIndex]);
        }
        return;
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleInputChange(""); // Clear autocomplete
        return;
      }
    }

    // Send message
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e) => {
    const value = e.target.value;
    const cursorPosition = e.target.selectionStart;
    setInputValue(value);
    handleInputChange(value, cursorPosition);

    // Auto-expand textarea
    e.target.style.height = "auto";
    e.target.style.height = e.target.scrollHeight + "px";
  };

  const handleContextChipClick = (chip) => {
    vscode.postMessage({ type: "openContext", chip });
  };

  // Handle autocomplete selection - replace inline instead of clearing
  const handleAutocompleteSelect = (item) => {
    const hashIndex = inputValue.lastIndexOf("#");
    const atIndex = inputValue.lastIndexOf("@");
    const triggerIndex = Math.max(hashIndex, atIndex);

    if (triggerIndex !== -1) {
      // Find end of the word being typed (space or end of string)
      const afterTrigger = inputValue.substring(triggerIndex);
      const spaceIndex = afterTrigger.indexOf(" ");
      const endIndex =
        spaceIndex === -1 ? inputValue.length : triggerIndex + spaceIndex;

      const before = inputValue.substring(0, triggerIndex);
      const after = inputValue.substring(endIndex);

      // Insert the selected item as a reference
      const newValue = `${before}${item.label} ${after}`;
      setInputValue(newValue);

      // Also add to chips for backend context
      selectItem(item);

      // Focus back on input
      if (inputRef.current) {
        inputRef.current.focus();
        // Ideally set cursor position after inserted item, but React might handle it
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)]">
      {/* Settings Panel */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* Conversation Popup */}
      <ConversationPopup
        isOpen={showConversations}
        onClose={() => setShowConversations(false)}
      />

      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--vscode-panel-border)]">
        <h3 className="font-semibold">Tinker Agent</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowConversations(!showConversations)}
            className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-colors"
            title="Conversations"
          >
            <MessageSquare size={16} />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-colors"
            title="Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 relative"
        onScroll={handleMessagesScroll}
      >
        {/* Load more button */}
        {hasMoreMessages && (
          <button
            onClick={loadMoreMessages}
            className="w-full mb-3 py-1.5 text-xs text-center rounded-lg transition-colors"
            style={{
              backgroundColor: "var(--vscode-input-background)",
              color: "var(--vscode-descriptionForeground)",
              border: "1px solid var(--vscode-panel-border)",
            }}
          >
            Load earlier messages ({effectiveStartIndex} more)
          </button>
        )}

        {visibleMessages.map((msg, idx) => {
          const actualIndex = effectiveStartIndex + idx;
          return (
            <ChatMessage
              key={actualIndex}
              message={msg}
              appliedBlocks={appliedBlocks}
              isLatest={actualIndex === messages.length - 1}
              isGenerating={
                isThinking &&
                actualIndex === messages.length - 1 &&
                msg.role === "assistant"
              }
            />
          );
        })}
        <div ref={messagesEndRef} />

        {/* Floating scroll-to-bottom button */}
        {isUserScrolledUp && isGenerating && (
          <button
            onClick={scrollToBottom}
            className="fixed bottom-28 right-6 z-50 p-2 rounded-full shadow-lg transition-all hover:scale-110"
            style={{
              backgroundColor: "var(--vscode-button-background)",
              color: "var(--vscode-button-foreground)",
            }}
            title="Scroll to bottom"
          >
            <ArrowDown size={18} />
          </button>
        )}
      </div>

      {/* Input Area - Modern Redesigned */}
      <div
        className="p-3 relative"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-tinker-copper rounded-2xl m-2"
            style={{
              backgroundColor: "var(--vscode-editor-background)",
              opacity: 0.98,
            }}
          >
            <div className="text-center">
              <ImagePlus
                size={32}
                className="mx-auto mb-2 text-tinker-copper"
              />
              <p
                className="text-sm"
                style={{ color: "var(--vscode-foreground)" }}
              >
                Drop images here
              </p>
              <p
                className="text-xs"
                style={{ color: "var(--vscode-descriptionForeground)" }}
              >
                Max {MAX_IMAGES} images
              </p>
            </div>
          </div>
        )}

        {/* Main Input Container - Theme-aware design */}
        <div
          className="relative rounded-2xl border tinker-border p-[1px] shadow-lg"
          style={{ backgroundColor: "var(--vscode-input-background)" }}
        >
          {/* Autocomplete - positioned OUTSIDE the clipped container */}
          {showAutocomplete && (
            <div className="absolute bottom-full left-0 right-0 mb-1 z-[100]">
              <Autocomplete
                items={autocompleteItems}
                type={autocompleteType}
                selectedIndex={selectedIndex}
                onSelect={handleAutocompleteSelect}
              />
            </div>
          )}
          <div
            className="rounded-2xl"
            style={{ backgroundColor: "var(--vscode-input-background)" }}
          >
            {/* Attachments Section - Images */}
            {attachedImages.length > 0 && (
              <div className="px-3 pt-3 pb-1 border-b tinker-border">
                <ImageAttachments
                  images={attachedImages}
                  onRemove={removeImage}
                  onPreview={handleImagePreview}
                />
              </div>
            )}

            {/* Context Chips Section */}
            {contextChips.length > 0 && (
              <div className="px-3 pt-2 pb-1 flex flex-wrap gap-1.5 border-b border-white/5">
                {contextChips.map((chip, idx) => (
                  <ContextChip
                    key={idx}
                    chip={chip}
                    onRemove={() => removeContextChip(idx)}
                    onClick={() => handleContextChipClick(chip)}
                  />
                ))}
              </div>
            )}

            {/* Textarea Section */}
            <div className="px-3 py-3">
              <ChipInput
                inputRef={inputRef}
                value={inputValue}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything... (Type # for files, @ for symbols)"
                disabled={isGenerating}
              />
            </div>

            {/* Bottom Toolbar - higher z-index for dropdown */}
            <div
              className="px-3 py-2 flex items-center justify-between border-t tinker-border relative z-[60] rounded-b-2xl"
              style={{ backgroundColor: "var(--vscode-input-background)" }}
            >
              {/* Left side - Add buttons */}
              <div className="flex items-center gap-1">
                {/* Add Image Button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachedImages.length >= MAX_IMAGES}
                  className="h-8 w-8 rounded-lg flex items-center justify-center tinker-text-muted hover:tinker-text transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ color: "var(--vscode-descriptionForeground)" }}
                  title="Attach images (max 4)"
                >
                  <ImagePlus size={16} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) addImages(e.target.files);
                    e.target.value = "";
                  }}
                />

                {/* Divider */}
                <div className="w-px h-5 bg-white/10 mx-1" />

                {/* Provider Select - Custom Dropdown, opens upward */}
                <Dropdown
                  value={selectedProvider}
                  onChange={updateProvider}
                  direction="top"
                  triggerClassName="bg-white/5 border-white/10"
                >
                  <Dropdown.Option value="openai" icon={OpenAIIcon}>
                    OpenAI
                  </Dropdown.Option>
                  <Dropdown.Option value="anthropic" icon={ClaudeIcon}>
                    Anthropic
                  </Dropdown.Option>
                  <Dropdown.Option value="gemini" icon={GeminiIcon}>
                    Gemini
                  </Dropdown.Option>
                  <Dropdown.Option value="azure" icon={AzureIcon}>
                    Azure
                  </Dropdown.Option>
                  <Dropdown.Option value="bedrock" icon={BedrockIcon}>
                    Bedrock
                  </Dropdown.Option>
                </Dropdown>

                {/* Model Dropdown - populated from custom models */}
                <Dropdown
                  value={selectedModel}
                  onChange={updateModel}
                  direction="top"
                  triggerClassName="bg-white/5 border-white/10 min-w-[100px]"
                  placeholder="model"
                  renderValue={(value) => {
                    // For Bedrock, find and display the friendly name
                    if (selectedProvider === "bedrock") {
                      const model = bedrockModels.find(
                        (m) => m.modelId === value
                      );
                      return model?.displayName || value;
                    }
                    return value;
                  }}
                >
                  {selectedProvider === "bedrock"
                    ? bedrockModels.map((model) => (
                        <Dropdown.Option
                          key={model.modelId}
                          value={model.modelId}
                        >
                          {model.displayName}
                        </Dropdown.Option>
                      ))
                    : (customModels[selectedProvider] || []).map((model) => (
                        <Dropdown.Option key={model} value={model}>
                          {model}
                        </Dropdown.Option>
                      ))}
                </Dropdown>

                {/* Responses API Toggle */}
                {(selectedProvider === "openai" ||
                  selectedProvider === "azure") && (
                  <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-2 py-1">
                    <span className="text-[10px] text-white/50">
                      Responses API
                    </span>
                    <Switch
                      checked={useResponsesAPI}
                      onChange={updateResponsesAPI}
                      size="sm"
                    />
                  </div>
                )}
              </div>

              {/* Right side - Send button */}
              <button
                onClick={isGenerating ? stopGeneration : handleSend}
                disabled={
                  !isGenerating &&
                  !inputValue.trim() &&
                  contextChips.length === 0 &&
                  attachedImages.length === 0
                }
                className={`group relative h-9 w-9 rounded-xl flex items-center justify-center transition-all overflow-hidden ${
                  isGenerating
                    ? "bg-gradient-to-br from-red-500/20 to-red-600/10 hover:from-red-500/30 hover:to-red-600/20 border border-red-500/30"
                    : "bg-gradient-to-br from-tinker-copper to-tinker-copper-dark hover:from-tinker-copper-light hover:to-tinker-copper disabled:opacity-30 disabled:cursor-not-allowed disabled:from-gray-500 disabled:to-gray-600"
                }`}
                title={isGenerating ? "Stop generating" : "Send message"}
              >
                {isGenerating ? (
                  <>
                    {/* Animated loader - shows by default */}
                    <div className="absolute inset-0 flex items-center justify-center transition-opacity group-hover:opacity-0">
                      <Loader2
                        size={16}
                        className="text-red-400 animate-spin"
                      />
                      {/* Pulse ring */}
                      <div className="absolute inset-1 rounded-lg border border-red-500/30 animate-pulse-ring" />
                    </div>
                    {/* Stop icon - shows on hover */}
                    <Square
                      size={12}
                      className="text-red-400 fill-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </>
                ) : (
                  <Send size={16} className="text-white" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Help text */}
        <div
          className="text-[10px] mt-2 flex justify-between px-1"
          style={{ color: "var(--vscode-descriptionForeground)" }}
        >
          <span>Use # to add file, @ to add symbol</span>
          <span>Cmd+L to add selection</span>
        </div>

        {/* Context Gauge - bottom progress bar */}
        {contextStatus && (
          <div className="mt-2 px-1">
            <ContextGauge contextStatus={contextStatus} />
          </div>
        )}
      </div>
    </div>
  );
}

// Mount app
const container = document.getElementById("root");
const root = createRoot(container);
root.render(<Sidebar />);
