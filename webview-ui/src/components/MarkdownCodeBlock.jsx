import React from "react";
import { FileText } from "lucide-react";

/**
 * Custom code block component for ReactMarkdown
 * Handles file paths in code blocks and applies syntax highlighting
 */
function MarkdownCodeBlock({ node, inline, className, children, ...props }) {
  // Inline code (like `code`)
  if (inline) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  // Block code (like ```language\ncode```)
  const codeString = String(children).replace(/\n$/, "");

  // Extract language from className (e.g., "language-javascript")
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";

  // Check if first line looks like a file path
  const lines = codeString.split("\n");
  const firstLine = lines[0];
  const isFilePath =
    firstLine &&
    (firstLine.includes("/") ||
      firstLine.includes("\\") ||
      /\.\w+$/.test(firstLine)); // has file extension

  const filePath = isFilePath ? firstLine : null;
  const code = isFilePath ? lines.slice(1).join("\n") : codeString;

  return (
    <div className="my-4 rounded-lg overflow-hidden border border-[var(--vscode-panel-border)]">
      {/* Header with file path or language */}
      {(filePath || language) && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--vscode-textCodeBlock-background)] border-b border-[var(--vscode-panel-border)] text-xs">
          <FileText size={12} className="text-tinker-copper opacity-70" />
          <span className="text-[var(--vscode-descriptionForeground)] font-mono">
            {filePath || language}
          </span>
        </div>
      )}

      {/* Code block */}
      <pre className="m-0 p-3 bg-[var(--vscode-textCodeBlock-background)] overflow-x-auto">
        <code className={className} {...props}>
          {code}
        </code>
      </pre>
    </div>
  );
}

export default MarkdownCodeBlock;
