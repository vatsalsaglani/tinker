// @ts-nocheck
import React, { useState, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import {
  X,
  Check,
  CheckCheck,
  FileCode,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Expand,
  Shrink,
  Zap,
} from "lucide-react";
import clsx from "clsx";
import hljs from "highlight.js";

// Acquire VS Code API once at module level (singleton)
const vscode =
  typeof acquireVsCodeApi !== "undefined" ? acquireVsCodeApi() : null;

const extensionToLanguage = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  java: "java",
  go: "go",
  rs: "rust",
  cpp: "cpp",
  c: "c",
  cs: "csharp",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  html: "html",
  css: "css",
  scss: "scss",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
};

const extensionColors = {
  js: "text-yellow-300",
  jsx: "text-cyan-300",
  ts: "text-blue-300",
  tsx: "text-indigo-300",
  md: "text-emerald-300",
  go: "text-cyan-400",
  py: "text-blue-400",
  sql: "text-orange-400",
};

/**
 * Get file icon and color based on extension
 */
const getFileInfo = (filePath) => {
  const parts = (filePath || "").split("/").filter(Boolean);
  const name = parts[parts.length - 1] || "Code Block";
  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() : "";
  const dir = filePath?.substring(0, filePath.lastIndexOf("/")) || "";

  return {
    name,
    dir,
    ext,
    full: filePath || name,
    color: extensionColors[ext] || "text-white/80",
  };
};

/**
 * Calculate line count from content
 */
const getLineCount = (content) => {
  if (!content) return 0;
  return content.split("\n").length;
};

/**
 * Get language for syntax highlighting based on extension
 */
const getLanguageFromPath = (filePath) => {
  if (!filePath) return null;
  const ext = filePath.split(".").pop()?.toLowerCase();
  return extensionToLanguage[ext] || null;
};

/**
 * Highlight code with hljs
 */
function highlightCode(code, language) {
  if (!code) return "";
  try {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language }).value;
    }
    return hljs.highlightAuto(code).value;
  } catch {
    return code;
  }
}

/**
 * Safely extract content as a string
 */
const getContent = (val) => {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val.join("\n");
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
};

/**
 * FileSection - A single file in the review panel (styled like CodeBlock.jsx)
 */
const FileSection = ({ file, onApply, isApplied, isExpanded, onToggle }) => {
  const { name, ext, full, color } = getFileInfo(file.filePath);
  const isNew = file.type === "new";
  const isEdit = file.type === "edit";
  const isRewrite = file.type === "rewrite";

  // Get content safely
  const content = getContent(file.content);
  const searchContent = getContent(file.search);
  const replaceContent = getContent(file.replace);

  const lineCount = getLineCount(content || replaceContent);
  const language = getLanguageFromPath(file.filePath);

  // Memoized highlighting
  const highlightedContent = useMemo(
    () => highlightCode(content, language),
    [content, language]
  );
  const highlightedSearch = useMemo(
    () => highlightCode(searchContent, language),
    [searchContent, language]
  );
  const highlightedReplace = useMemo(
    () => highlightCode(replaceContent, language),
    [replaceContent, language]
  );

  const splitHighlightedLines = (html) => {
    if (!html) return [];
    return html.split("\n");
  };

  // Get badge styles based on block type
  const getBadgeStyle = () => {
    if (isNew) return "bg-green-500/10 text-green-300 border-green-500/20";
    if (isRewrite)
      return "bg-purple-500/10 text-purple-300 border-purple-500/20";
    return "bg-blue-500/10 text-blue-300 border-blue-500/20";
  };

  const getBadgeText = () => {
    if (isNew) return "New File";
    if (isRewrite) return "Rewrite";
    return "Edit";
  };

  return (
    <div
      className={clsx(
        "rounded-xl shadow-md overflow-hidden border mb-4",
        isApplied && "opacity-70"
      )}
      style={{ borderColor: "var(--vscode-panel-border)" }}
    >
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: "var(--vscode-textCodeBlock-background)" }}
      >
        {/* Header - same as CodeBlock.jsx */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b cursor-pointer hover:bg-white/5 transition-colors"
          style={{
            backgroundColor: "var(--vscode-editor-background)",
            borderColor: "var(--vscode-panel-border)",
          }}
          onClick={onToggle}
        >
          <div
            className="flex items-center gap-2 text-sm font-medium min-w-0"
            style={{ color: "var(--vscode-foreground)" }}
          >
            {isExpanded ? (
              <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
            )}
            <FileCode size={14} className={color} />
            <span className="truncate max-w-xs text-xs">{full || name}</span>
            {ext && (
              <span
                className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: "var(--vscode-badge-background)",
                  color: "var(--vscode-badge-foreground)",
                }}
              >
                {ext}
              </span>
            )}
            <span
              className={clsx(
                "text-[10px] px-2 py-0.5 rounded-full border",
                getBadgeStyle()
              )}
            >
              {getBadgeText()}
            </span>
            <span className="text-xs text-green-400 font-mono">
              +{lineCount}
            </span>
            {isApplied && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
                <Check size={10} />
                Applied
              </span>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!isApplied) onApply?.();
            }}
            disabled={isApplied}
            className={clsx(
              "text-xs px-4 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-all font-medium",
              isApplied
                ? "bg-white/5 text-white/30 cursor-not-allowed"
                : "bg-tinker-copper/20 text-tinker-copper border border-tinker-copper/30 hover:bg-tinker-copper/30"
            )}
          >
            {isApplied ? <Check size={12} /> : <Zap size={12} />}
            {isApplied ? "Applied" : "Apply"}
          </button>
        </div>

        {/* Code content */}
        {isExpanded && (
          <div
            className="tinker-code overflow-x-auto font-mono text-xs p-3"
            style={{ maxHeight: "500px" }}
          >
            {isEdit && searchContent && replaceContent ? (
              // Diff view for edits - red for removed, green for added
              <div className="flex flex-col gap-px">
                {splitHighlightedLines(highlightedSearch).map((line, idx) => (
                  <div
                    key={`del-${idx}`}
                    className="flex bg-red-500/10 rounded"
                  >
                    <span className="select-none opacity-50 w-8 text-right mr-2 px-2 py-1 shrink-0 text-red-400">
                      -
                    </span>
                    <span
                      className="hljs flex-1 px-2 py-1"
                      dangerouslySetInnerHTML={{ __html: line || "&nbsp;" }}
                    />
                  </div>
                ))}
                {splitHighlightedLines(highlightedReplace).map((line, idx) => (
                  <div
                    key={`add-${idx}`}
                    className="flex bg-green-500/10 rounded"
                  >
                    <span className="select-none opacity-50 w-8 text-right mr-2 px-2 py-1 shrink-0 text-green-400">
                      +
                    </span>
                    <span
                      className="hljs flex-1 px-2 py-1"
                      dangerouslySetInnerHTML={{ __html: line || "&nbsp;" }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              // Content view for new files and rewrites
              <pre className="m-0">
                <code
                  className="hljs"
                  dangerouslySetInnerHTML={{
                    __html: highlightedContent || highlightedReplace || "",
                  }}
                />
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * ReviewPanel - Full-page panel for reviewing all pending file changes
 */
function ReviewPanel() {
  const [pendingBlocks, setPendingBlocks] = useState([]);
  const [appliedBlocks, setAppliedBlocks] = useState(new Set());
  const [expandedFiles, setExpandedFiles] = useState(new Set());

  // Listen for messages from extension
  useEffect(() => {
    const handleMessage = (event) => {
      const message = event.data;

      if (message.type === "loadBlocks") {
        setPendingBlocks(message.blocks || []);
        setAppliedBlocks(new Set(message.appliedBlocks || []));
        // Auto-expand first file
        if (message.blocks?.length > 0) {
          setExpandedFiles(new Set([`${message.blocks[0].filePath}:0`]));
        }
      } else if (message.type === "blockApplied") {
        setAppliedBlocks((prev) => new Set([...prev, message.blockKey]));
      }
    };

    window.addEventListener("message", handleMessage);

    // Request initial data
    vscode?.postMessage({ type: "loadBlocks" });

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Create keyed files
  const files = pendingBlocks.map((block, idx) => ({
    ...block,
    key: `${block.filePath}:${idx}`,
    blockKey: `${block.filePath}:${block.type}:${
      getContent(block.content)?.substring(0, 50) ||
      getContent(block.replace)?.substring(0, 50) ||
      ""
    }`,
  }));

  const unappliedCount = files.filter(
    (f) => !appliedBlocks.has(f.blockKey)
  ).length;

  const toggleFile = (key) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedFiles(new Set(files.map((f) => f.key)));
  };

  const collapseAll = () => {
    setExpandedFiles(new Set());
  };

  const handleApply = (file) => {
    vscode?.postMessage({
      type: "applyCodeBlock",
      block: file,
    });
  };

  const handleApplyAll = () => {
    files
      .filter((file) => !appliedBlocks.has(file.blockKey))
      .forEach((file) => {
        vscode?.postMessage({
          type: "applyCodeBlock",
          block: file,
        });
      });
  };

  const handleClose = () => {
    vscode?.postMessage({ type: "closePanel" });
  };

  return (
    <div
      className="h-screen flex flex-col"
      style={{ backgroundColor: "var(--vscode-editor-background)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: "var(--vscode-panel-border)" }}
      >
        <div className="flex items-center gap-4">
          <span
            className="text-xl font-semibold"
            style={{ color: "var(--vscode-foreground)" }}
          >
            All Changes
          </span>
          <span
            className="text-sm px-2 py-0.5 rounded"
            style={{
              backgroundColor: "var(--vscode-badge-background)",
              color: "var(--vscode-badge-foreground)",
            }}
          >
            {files.length} {files.length === 1 ? "file" : "files"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={expandAll}
            className="px-3 py-1.5 text-sm rounded transition-colors hover:bg-white/10 flex items-center gap-2"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            <Expand size={14} />
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="px-3 py-1.5 text-sm rounded transition-colors hover:bg-white/10 flex items-center gap-2"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            <Shrink size={14} />
            Collapse All
          </button>
          {unappliedCount > 0 && (
            <button
              onClick={handleApplyAll}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 bg-tinker-copper text-white hover:bg-tinker-copper-light shadow-lg shadow-tinker-copper/20"
            >
              <CheckCheck size={16} />
              Apply All ({unappliedCount})
            </button>
          )}
          <button
            onClick={handleClose}
            className="p-2 rounded-md transition-colors hover:bg-white/10"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto p-6">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <AlertCircle size={56} className="text-gray-500" />
            <span
              className="text-xl"
              style={{ color: "var(--vscode-descriptionForeground)" }}
            >
              No pending changes
            </span>
            <span
              className="text-sm"
              style={{ color: "var(--vscode-descriptionForeground)" }}
            >
              Changes from the chat will appear here for review
            </span>
          </div>
        ) : (
          files.map((file) => (
            <FileSection
              key={file.key}
              file={file}
              isApplied={appliedBlocks.has(file.blockKey)}
              isExpanded={expandedFiles.has(file.key)}
              onToggle={() => toggleFile(file.key)}
              onApply={() => handleApply(file)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Mount the app
const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<ReviewPanel />);
}

export default ReviewPanel;
