// @ts-nocheck
import React, { useState, useCallback, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import CodeBlock from "./CodeBlock";
import ToolCall from "./ToolCall";
import {
  User,
  Copy,
  Check,
  FileText,
  Zap,
  Scissors,
  Sparkles,
  Brain,
  Code,
  Search,
  BookOpen,
} from "lucide-react";
import TinkerIcon from "./TinkerIcon";

const thinkingPhrases = [
  { text: "Analyzing...", icon: Search },
  { text: "Thinking...", icon: Brain },
  { text: "Processing...", icon: Zap },
  { text: "Crafting...", icon: Code },
  { text: "Generating...", icon: Sparkles },
];

function ChatMessage({
  message,
  appliedBlocks = new Set(),
  isLatest = false,
  isGenerating = false,
}) {
  // Rolodex animation state for thinking indicator
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);

  useEffect(() => {
    if (!isLatest || !isGenerating || message.role !== "assistant") return;

    const interval = setInterval(() => {
      setIsFlipping(true);
      setTimeout(() => {
        setPhraseIndex((prev) => (prev + 1) % thinkingPhrases.length);
        setIsFlipping(false);
      }, 400);
    }, 2500);

    return () => clearInterval(interval);
  }, [isLatest, isGenerating, message.role]);

  const CurrentThinkingIcon = thinkingPhrases[phraseIndex].icon;
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

    // Add remaining text - but check for incomplete/streaming blocks first
    if (lastIndex < content.length) {
      let remainingContent = content.substring(lastIndex);

      // Check for incomplete block markers (streaming in progress)
      const incompleteBlockPatterns = [
        {
          pattern: /([^\n]+)\s*\n\s*<{3,}\s*REWRITE FILE\s*\n/i,
          type: "rewrite",
        },
        { pattern: /([^\n]+)\s*\n\s*<{3,}\s*NEW FILE\s*\n/i, type: "new" },
        { pattern: /([^\n]+)\s*\n\s*<{3,}\s*SEARCH\s*\n/i, type: "search" },
      ];

      for (const { pattern, type } of incompleteBlockPatterns) {
        const match = remainingContent.match(pattern);
        if (match) {
          // Found an incomplete block - check if it lacks closing marker
          const hasCloseMarker =
            (type === "rewrite" &&
              remainingContent.match(/>{3,}\s*(REWRITE FILE|REPLACE)/i)) ||
            (type === "new" &&
              remainingContent.match(/>{3,}\s*(NEW FILE|NEW)/i)) ||
            (type === "search" && remainingContent.match(/>{3,}\s*REPLACE/i));

          if (!hasCloseMarker) {
            // Split: text before the block, then the incomplete block as raw code
            const blockStartIndex = match.index;

            // Add text before the incomplete block
            if (blockStartIndex > 0) {
              segments.push({
                type: "text",
                content: remainingContent.substring(0, blockStartIndex),
              });
            }

            // Add the incomplete block as a streaming code block
            const incompleteBlockContent =
              remainingContent.substring(blockStartIndex);
            const filePath = match[1]?.trim() || "Unknown File";

            segments.push({
              type: "block",
              block: {
                type: type === "search" ? "edit" : type,
                filePath: filePath,
                content: incompleteBlockContent.replace(match[0], "").trim(),
                isIncomplete: true,
              },
            });

            remainingContent = ""; // All remaining content handled
            break;
          }
        }
      }

      // If there's still remaining content (no incomplete block found), add as text
      if (remainingContent) {
        segments.push({
          type: "text",
          content: remainingContent,
        });
      }
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

      // Language display name mapping
      const languageNames = {
        js: "JavaScript",
        jsx: "JavaScript",
        ts: "TypeScript",
        tsx: "TypeScript",
        py: "Python",
        rb: "Ruby",
        java: "Java",
        go: "Go",
        rs: "Rust",
        cpp: "C++",
        c: "C",
        cs: "C#",
        php: "PHP",
        swift: "Swift",
        kt: "Kotlin",
        html: "HTML",
        css: "CSS",
        scss: "SCSS",
        json: "JSON",
        yaml: "YAML",
        yml: "YAML",
        md: "Markdown",
        sql: "SQL",
        sh: "Shell",
        bash: "Bash",
        zsh: "Shell",
        xml: "XML",
        vue: "Vue",
        svelte: "Svelte",
        javascript: "JavaScript",
        typescript: "TypeScript",
        python: "Python",
        ruby: "Ruby",
        rust: "Rust",
        csharp: "C#",
        kotlin: "Kotlin",
        markdown: "Markdown",
      };

      const displayLang =
        languageNames[language?.toLowerCase()] ||
        language?.toUpperCase() ||
        "CODE";

      // Determine if this is inline code:
      // 1. Check the explicit inline prop
      // 2. Check if parent is not 'pre' (react-markdown way)
      // 3. Single-line code without language is likely inline
      const codeContent = String(children).replace(/\n$/, "");
      const isSingleLine = !codeContent.includes("\n");
      const hasNoLanguage = !language;

      // If inline prop is explicitly true, or if it's a short single-line code without explicit language class
      const isInlineCode =
        inline === true ||
        (node?.tagName === "code" &&
          !node?.properties?.className &&
          isSingleLine);

      // If inline code, render with a modern inline style
      if (isInlineCode) {
        return (
          <code
            className="px-1.5 py-0.5 rounded-md text-[13px] font-mono"
            style={{
              backgroundColor: "var(--vscode-textCodeBlock-background)",
              color: "#e5c07b",
              border: "1px solid var(--vscode-panel-border)",
            }}
            {...props}
          >
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
        <div
          className="rounded-xl shadow-md overflow-hidden border"
          style={{ borderColor: "var(--vscode-panel-border)" }}
        >
          <div
            className="rounded-xl overflow-hidden"
            style={{
              backgroundColor: "var(--vscode-textCodeBlock-background)",
            }}
          >
            {/* Header bar matching CodeBlock style */}
            <div
              className="flex items-center justify-between px-3 py-2 border-b"
              style={{
                backgroundColor: "var(--vscode-editor-background)",
                borderColor: "var(--vscode-panel-border)",
              }}
            >
              <div
                className="flex items-center gap-2 text-sm font-medium"
                style={{ color: "var(--vscode-foreground)" }}
              >
                {/* Language badge */}
                <span
                  className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: "var(--vscode-badge-background)",
                    color: "var(--vscode-badge-foreground)",
                  }}
                >
                  {displayLang}
                </span>
              </div>

              {/* Copy button */}
              <button
                onClick={handleCopy}
                className="text-[10px] px-3 py-1 rounded-lg inline-flex items-center gap-1 transition-all bg-white/5 hover:bg-white/10"
                style={{ color: "var(--vscode-foreground)" }}
                title={copied ? "Copied!" : "Copy to clipboard"}
              >
                {copied ? (
                  <>
                    <Check size={10} className="text-green-400" />
                    <span className="text-green-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={10} />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            {/* Code content */}
            <div className="tinker-code overflow-x-auto font-mono text-xs p-3">
              <pre className="m-0">
                <code
                  ref={codeRef}
                  className={`hljs ${className || ""}`}
                  {...props}
                >
                  {children}
                </code>
              </pre>
            </div>
          </div>
        </div>
      );
    },
    []
  );

  // Markdown components with custom code renderer
  const markdownComponents = {
    code: CopyableCodeBlock,
    // Custom pre to avoid double styling - code blocks handle their own pre
    pre: ({ children }) => <>{children}</>,
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

        {/* Rolodex thinking animation - only on latest assistant message while generating */}
        {message.role === "assistant" && isLatest && isGenerating && (
          <>
            <span className="text-white/30 text-xs">•</span>
            <div className="flex items-center gap-1.5">
              <BookOpen size={12} className="text-tinker-copper/40" />
              <div
                className="h-4 overflow-hidden"
                style={{ perspective: "120px", minWidth: "75px" }}
              >
                <div
                  className="transition-all duration-400 ease-in-out"
                  style={{
                    transformStyle: "preserve-3d",
                    transform: isFlipping ? "rotateX(-90deg)" : "rotateX(0deg)",
                    transformOrigin: "center bottom",
                  }}
                >
                  <div className="flex items-center gap-1">
                    <CurrentThinkingIcon
                      size={10}
                      className="text-tinker-copper/60"
                    />
                    <span className="text-xs text-white/50">
                      {thinkingPhrases[phraseIndex].text}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
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
