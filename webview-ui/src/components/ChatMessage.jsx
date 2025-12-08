// @ts-nocheck
import React, { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import CodeBlock from "./CodeBlock";
import ToolCall from "./ToolCall";
import { User, Copy, Check, FileText, Zap, Scissors } from "lucide-react";
import TinkerIcon from "./TinkerIcon";

function ChatMessage({ message, appliedBlocks = new Set() }) {
  const parseContent = (content) => {
    if (!content) return [];

    const segments = [];
    let lastIndex = 0;

    // 1. Try fenced code blocks first
    const fencedRegex = /```(?:\w+)?\s*\n?([\s\S]*?)```/g;
    let match;
    let hasFencedBlocks = false;
    const fencedMatches = [];

    while ((match = fencedRegex.exec(content)) !== null) {
      const code = match[1];
      if (
        (code.includes("<<<<<<< SEARCH") &&
          code.includes("=======") &&
          code.includes(">>>>>>> REPLACE")) ||
        (code.includes("<<<<<<< NEW FILE") &&
          code.includes(">>>>>>> NEW FILE")) ||
        (code.includes("<<<<<<< REWRITE FILE") &&
          code.includes(">>>>>>> REWRITE FILE"))
      ) {
        hasFencedBlocks = true;
        fencedMatches.push(match);
      }
    }

    if (hasFencedBlocks) {
      for (const match of fencedMatches) {
        // Add text before block
        if (match.index > lastIndex) {
          segments.push({
            type: "text",
            content: content.substring(lastIndex, match.index),
          });
        }

        // Parse block - can return multiple blocks
        const blockContent = match[1];
        const parsedBlocks = parseBlockContent(blockContent);
        if (parsedBlocks && parsedBlocks.length > 0) {
          parsedBlocks.forEach((block) => {
            segments.push({ type: "block", block });
          });
        } else {
          // Fallback if parsing fails
          segments.push({ type: "text", content: match[0] });
        }

        lastIndex = match.index + match[0].length;
      }
    } else {
      // 2. Fallback to raw blocks without triple backticks
      // Handle all three block types: SEARCH/REPLACE, NEW FILE, REWRITE FILE

      // Pattern for raw blocks: filepath followed by block markers
      // This regex matches:
      // - SEARCH/REPLACE: filepath\n<<<<<<< SEARCH\n...\n=======\n...\n>>>>>>> REPLACE
      // - NEW FILE: filepath\n<<<<<<< NEW FILE\n...\n>>>>>>> NEW FILE
      // - REWRITE FILE: filepath\n<<<<<<< REWRITE FILE\n...\n>>>>>>> REWRITE FILE

      const rawPatterns = [
        // SEARCH/REPLACE blocks - flexible matching (3+ angle brackets, 3+ equals)
        /([^\n]+)\s*\n\s*<{3,}\s*SEARCH\s*\n[\s\S]*?={3,}\n[\s\S]*?>{3,}\s*REPLACE/gi,
        // NEW FILE blocks (closing can be NEW FILE or just NEW)
        /([^\n]+)\s*\n\s*<{3,}\s*NEW FILE\s*\n[\s\S]*?>{3,}\s*(?:NEW FILE|NEW)/gi,
        // REWRITE FILE blocks (closing can be REWRITE FILE or just REPLACE)
        /([^\n]+)\s*\n\s*<{3,}\s*REWRITE FILE\s*\n[\s\S]*?>{3,}\s*(?:REWRITE FILE|REPLACE)/gi,
      ];

      // Find all raw blocks of any type
      const allMatches = [];
      for (const pattern of rawPatterns) {
        let m;
        while ((m = pattern.exec(content)) !== null) {
          allMatches.push({ match: m[0], index: m.index, length: m[0].length });
        }
      }

      // Sort matches by their position in the content
      allMatches.sort((a, b) => a.index - b.index);

      // Remove overlapping matches (keep earliest)
      const filteredMatches = [];
      let lastEnd = 0;
      for (const m of allMatches) {
        if (m.index >= lastEnd) {
          filteredMatches.push(m);
          lastEnd = m.index + m.length;
        }
      }

      // Process matches
      for (const m of filteredMatches) {
        // Add text before block
        if (m.index > lastIndex) {
          segments.push({
            type: "text",
            content: content.substring(lastIndex, m.index),
          });
        }

        // Parse block
        const parsedBlocks = parseBlockContent(m.match);
        if (parsedBlocks && parsedBlocks.length > 0) {
          for (const block of parsedBlocks) {
            segments.push({ type: "block", block });
          }
        } else {
          segments.push({ type: "text", content: m.match });
        }

        lastIndex = m.index + m.length;
      }
    }

    // Add remaining text
    if (lastIndex < content.length) {
      segments.push({
        type: "text",
        content: content.substring(lastIndex),
      });
    }

    return segments;
  };

  const parseBlockContent = (content) => {
    const blocks = [];

    // Extract file path from first line (handles various formats)
    const lines = content.split("\n");
    let filePath = "";
    for (const line of lines) {
      const trimmed = line
        .trim()
        .replace(/^```\w*/, "")
        .trim();
      // Skip empty lines and block markers
      if (trimmed && !trimmed.match(/^<+\s*(SEARCH|NEW FILE|REWRITE FILE)/)) {
        filePath = trimmed;
        break;
      }
    }

    // Check for NEW FILE - more flexible regex
    if (
      content.match(/<{3,}\s*NEW FILE/i) &&
      content.match(/>{3,}\s*(NEW FILE|NEW)/i) // LLM sometimes uses just NEW for closing
    ) {
      // More flexible: match content between markers, allow for various whitespace
      const fileContentMatch = content.match(
        /<{3,}\s*NEW FILE\s*\n?([\s\S]*?)(?:\n\s*)?>{3,}\s*(?:NEW FILE|NEW)/i
      );

      if (fileContentMatch && filePath) {
        blocks.push({
          type: "new",
          filePath: filePath,
          content: fileContentMatch[1].trim(),
        });
      }
    }
    // Check for REWRITE FILE (full file replacement) - more flexible regex
    else if (
      content.match(/<{3,}\s*REWRITE FILE/i) &&
      content.match(/>{3,}\s*(REWRITE FILE|REPLACE)/i) // LLM sometimes uses REPLACE instead of REWRITE FILE for closing
    ) {
      // More flexible: match content between markers, allow for various whitespace and closing marker variations
      const rewriteMatch = content.match(
        /<{3,}\s*REWRITE FILE\s*\n?([\s\S]*?)(?:\n\s*)?>{3,}\s*(?:REWRITE FILE|REPLACE)/i
      );

      if (rewriteMatch && filePath) {
        blocks.push({
          type: "rewrite",
          filePath: filePath,
          content: rewriteMatch[1].trim(),
        });
      }
    }
    // Check for SEARCH/REPLACE - can have multiple pairs
    // More flexible: accepts 3+ angle brackets and 3+ equals signs
    else if (
      content.match(/<{3,}\s*SEARCH/i) &&
      content.match(/>{3,}\s*REPLACE/i)
    ) {
      // Match: <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE
      // Flexible: 3+ angle brackets, 3+ equals, case insensitive
      const searchReplaceRegex =
        /<{3,}\s*SEARCH\s*\n?([\s\S]*?)\n?={3,}\n?([\s\S]*?)\n?>{3,}\s*REPLACE/gi;

      let pairMatch;
      while ((pairMatch = searchReplaceRegex.exec(content)) !== null) {
        blocks.push({
          type: "edit",
          filePath: filePath,
          search: (pairMatch[1] || "").trim(),
          replace: (pairMatch[2] || "").trim(),
        });
      }
    }

    return blocks;
  };

  // Custom code block component with copy button for regular markdown code
  const CopyableCodeBlock = useCallback(
    ({ node, inline, className, children, ...props }) => {
      const [copied, setCopied] = useState(false);
      const codeRef = React.useRef(null);

      // Extract language from className (e.g., "language-javascript")
      const match = /language-(\w+)/.exec(className || "");
      const language = match ? match[1] : "";

      // If inline code, just render normally
      if (inline) {
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      }

      const handleCopy = async () => {
        try {
          // Get text content from the DOM element
          const textContent = codeRef.current?.textContent || "";
          await navigator.clipboard.writeText(textContent);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch (err) {
          console.error("Failed to copy:", err);
        }
      };

      return (
        <div className="rounded-lg overflow-hidden border border-white/10 bg-[#0f172a]">
          {/* Header bar with language and copy button */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-white/5 border-b border-white/10">
            <span className="text-xs text-white/50 uppercase tracking-wide">
              {language || "code"}
            </span>
            <button
              onClick={handleCopy}
              className="p-1 rounded hover:bg-white/10 transition-colors text-white/50 hover:text-white"
              title={copied ? "Copied!" : "Copy to clipboard"}
            >
              {copied ? (
                <Check size={14} className="text-green-400" />
              ) : (
                <Copy size={14} />
              )}
            </button>
          </div>
          {/* Code content */}
          <pre className="m-0 p-3 overflow-x-auto">
            <code ref={codeRef} className={className} {...props}>
              {children}
            </code>
          </pre>
        </div>
      );
    },
    []
  );

  // Markdown components with custom code renderer
  const markdownComponents = {
    code: CopyableCodeBlock,
  };

  const renderContent = () => {
    // Legacy: standalone tool messages (should not happen with new grouping)
    if (message.type === "tool") {
      return <ToolCall tool={message.tool} result={message.result} />;
    }

    if (message.role === "user") {
      // Context chips to display as badges
      const contextChips = message.contextChips || [];

      // Render context chip badges
      const renderChips = () => {
        if (contextChips.length === 0) return null;
        return (
          <div className="flex gap-1 flex-wrap mt-2">
            {contextChips.map((chip, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs"
                style={{
                  backgroundColor: "var(--vscode-button-secondaryBackground)",
                  color: "var(--vscode-button-secondaryForeground)",
                }}
              >
                {chip.type === "file" && (
                  <>
                    <FileText size={12} style={{ opacity: 0.7 }} />
                    {chip.display || chip.path}
                  </>
                )}
                {chip.type === "symbol" && (
                  <>
                    <Zap size={12} style={{ opacity: 0.7 }} />
                    {chip.display}
                  </>
                )}
                {chip.type === "selection" && (
                  <>
                    <Scissors size={12} style={{ opacity: 0.7 }} />
                    {chip.display}
                  </>
                )}
              </span>
            ))}
          </div>
        );
      };

      // Handle multi-modal content (array with text and images)
      if (Array.isArray(message.content)) {
        const textParts = message.content.filter(
          (p) => p.type === "text" || p.type === "input_text"
        );
        const imageParts = message.content.filter(
          (p) => p.type === "image_url" || p.type === "input_image"
        );

        const textContent = textParts.map((p) => p.text).join("\n");

        return (
          <div className="space-y-2">
            {textContent && (
              <div className="whitespace-pre-wrap">{textContent}</div>
            )}
            {imageParts.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {imageParts.map((img, idx) => {
                  // Handle both image_url format and input_image format
                  const imgUrl = img.image_url?.url || img.image_url;
                  return (
                    <div
                      key={idx}
                      className="relative w-20 h-20 rounded-lg overflow-hidden border border-white/20"
                    >
                      <img
                        src={imgUrl}
                        alt={`Attached ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  );
                })}
              </div>
            )}
            {renderChips()}
          </div>
        );
      }

      // Simple string content
      return (
        <div>
          <div className="whitespace-pre-wrap">{message.content}</div>
          {renderChips()}
        </div>
      );
    }

    // Render tool calls first (if any), then content
    const toolCalls = message.toolCalls || [];
    const hasToolCalls = toolCalls.length > 0;

    // If streaming, show tool calls + streaming content
    // Still parse content for proper code block formatting
    if (message.isStreaming) {
      const streamingSegments = parseContent(message.content || "");

      return (
        <div className="space-y-3">
          {/* Tool calls */}
          {hasToolCalls && (
            <div className="space-y-1">
              {toolCalls.map((tc, idx) => (
                <ToolCall
                  key={tc.id || idx}
                  tool={tc.tool}
                  result={tc.result}
                />
              ))}
            </div>
          )}

          {/* Streaming content - parsed for proper formatting */}
          {streamingSegments.length > 0 ? (
            <div className="space-y-4">
              {streamingSegments.map((segment, idx) => {
                if (segment.type === "block") {
                  // Render code block without Apply button during streaming
                  return (
                    <CodeBlock
                      key={idx}
                      block={segment.block}
                      appliedBlocks={appliedBlocks}
                      isStreaming={true}
                    />
                  );
                } else {
                  return (
                    <div key={idx} className="prose prose-invert max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                        components={markdownComponents}
                      >
                        {segment.content}
                      </ReactMarkdown>
                    </div>
                  );
                }
              })}
            </div>
          ) : (
            message.content && (
              <div className="prose prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={markdownComponents}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )
          )}
        </div>
      );
    }

    // If complete, parse and render inline blocks
    const segments = parseContent(message.content || "");

    return (
      <div className="space-y-3">
        {/* Tool calls */}
        {hasToolCalls && (
          <div className="space-y-1">
            {toolCalls.map((tc, idx) => (
              <ToolCall key={tc.id || idx} tool={tc.tool} result={tc.result} />
            ))}
          </div>
        )}

        {/* Content segments */}
        {segments.length > 0 && (
          <div className="space-y-4">
            {segments.map((segment, idx) => {
              if (segment.type === "block") {
                return (
                  <CodeBlock
                    key={idx}
                    block={segment.block}
                    appliedBlocks={appliedBlocks}
                  />
                );
              } else {
                return (
                  <div key={idx} className="prose prose-invert max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                      components={markdownComponents}
                    >
                      {segment.content}
                    </ReactMarkdown>
                  </div>
                );
              }
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`message mb-4 ${message.role}-message`}>
      {/* Header with avatar and name */}
      <div className="flex items-center gap-2 mb-2">
        {message.role === "user" ? (
          <div className="w-6 h-6 rounded-lg bg-tinker-spark/20 flex items-center justify-center">
            <User size={14} className="text-tinker-spark" />
          </div>
        ) : (
          <div className="w-6 h-6 rounded-lg bg-tinker-copper/20 flex items-center justify-center">
            <TinkerIcon size={16} className="text-tinker-copper" />
          </div>
        )}
        <span
          className="text-xs font-semibold"
          style={{ color: "var(--vscode-descriptionForeground)" }}
        >
          {message.role === "user" ? "You" : "Tinker"}
        </span>
      </div>

      {/* Message content */}
      <div
        className={`rounded-xl ${message.role === "user" ? "border" : ""}`}
        style={
          message.role === "user"
            ? { borderColor: "var(--vscode-panel-border)" }
            : {}
        }
      >
        <div
          className="p-3 rounded-xl"
          style={{
            backgroundColor:
              message.role === "user"
                ? "var(--vscode-input-background)"
                : "transparent",
            color: "var(--vscode-foreground)",
          }}
        >
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

export default ChatMessage;
