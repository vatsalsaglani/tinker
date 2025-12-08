import { useState, useCallback, useRef } from "react";
import { useVSCodeMessage } from "./useVSCodeMessage";

/**
 * Hook to manage chat state and interactions
 */
export function useChat() {
  const [messages, setMessages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [currentAssistantMessage, setCurrentAssistantMessage] = useState(null);

  // Use ref to track tool calls that belong to current assistant turn
  const currentToolCallsRef = useRef([]);

  /**
   * Format persisted messages for UI display
   * Converts array content back to simpler format if needed
   */
  const formatMessages = (msgs) => {
    if (!msgs || !Array.isArray(msgs)) return [];
    return msgs.map((msg) => {
      let content = msg.content;

      // If content is an array, extract text for display
      if (Array.isArray(content)) {
        const textParts = content
          .filter((p) => p.type === "text")
          .map((p) => p.text);
        const hasImages = content.some((p) => p.type === "image_url");

        // Keep as array if has images, otherwise flatten to string
        if (!hasImages && textParts.length === 1) {
          content = textParts[0];
        }
      }

      return {
        role: msg.role,
        content,
        codeBlocks: msg.codeBlocks || [],
        contextChips: msg.contextChips || null, // Include context chips for display
        toolCalls: [],
      };
    });
  };

  const vscode = useVSCodeMessage((message) => {
    switch (message.type) {
      case "userMessage":
        setMessages((prev) => [
          ...prev,
          {
            role: "user",
            content: message.message,
          },
        ]);
        // Reset tool calls for new user message
        currentToolCallsRef.current = [];
        break;

      case "thinking":
        setIsThinking(message.thinking);
        break;

      case "assistantChunk":
        setCurrentAssistantMessage((prev) => {
          if (!prev) {
            return {
              role: "assistant",
              content: message.chunk,
              isStreaming: true,
              toolCalls: currentToolCallsRef.current,
            };
          }
          return {
            ...prev,
            content: prev.content + message.chunk,
            toolCalls: currentToolCallsRef.current,
          };
        });
        break;

      case "assistantComplete":
        // Finalize assistant message with all tool calls and content
        const finalContent =
          currentAssistantMessage?.content || message.message || "";
        const finalToolCalls = [...currentToolCallsRef.current];

        if (finalContent || finalToolCalls.length > 0) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: finalContent,
              codeBlocks: message.blocks || [],
              toolCalls: finalToolCalls,
            },
          ]);
        }
        setCurrentAssistantMessage(null);
        currentToolCallsRef.current = [];
        setIsGenerating(false);
        break;

      case "toolCall":
        // Add tool call to current ref (will be included in assistant message)
        const newToolCall = {
          id: message.tool.id,
          tool: message.tool,
          result: null,
        };
        currentToolCallsRef.current = [
          ...currentToolCallsRef.current,
          newToolCall,
        ];

        // Update current assistant message to show tool call immediately
        setCurrentAssistantMessage((prev) => ({
          role: "assistant",
          content: prev?.content || "",
          isStreaming: true,
          toolCalls: currentToolCallsRef.current,
        }));
        break;

      case "toolResult":
        // Update current tool call with result
        currentToolCallsRef.current = currentToolCallsRef.current.map((tc) =>
          tc.id === message.tool.id
            ? { ...tc, result: message.tool.result }
            : tc
        );

        // Update current assistant message to show result
        setCurrentAssistantMessage((prev) => ({
          ...prev,
          toolCalls: currentToolCallsRef.current,
        }));
        break;

      case "error":
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Error: ${message.error}`,
            isError: true,
          },
        ]);
        setIsGenerating(false);
        setIsThinking(false);
        currentToolCallsRef.current = [];
        break;

      case "generationStopped":
        setIsGenerating(false);
        setIsThinking(false);
        setCurrentAssistantMessage(null);
        currentToolCallsRef.current = [];
        break;

      case "messagesLoaded":
        // Load messages from persisted storage
        if (message.isAppend) {
          // Prepend older messages
          setMessages((prev) => [...formatMessages(message.messages), ...prev]);
        } else {
          // Replace all messages (conversation switch)
          setMessages(formatMessages(message.messages));
        }
        break;

      case "clearChat":
        setMessages([]);
        setCurrentAssistantMessage(null);
        currentToolCallsRef.current = [];
        break;
    }
  });

  const sendMessage = useCallback(
    (text, contextChips = [], images = []) => {
      setIsGenerating(true);
      currentToolCallsRef.current = [];
      vscode.postMessage({
        type: "sendMessage",
        text,
        contextChips,
        images,
      });
    },
    [vscode]
  );

  const stopGeneration = useCallback(() => {
    vscode.postMessage({ type: "stopGeneration" });
  }, [vscode]);

  return {
    messages: currentAssistantMessage
      ? [...messages, currentAssistantMessage]
      : messages,
    isGenerating,
    isThinking,
    sendMessage,
    stopGeneration,
  };
}

export default useChat;
