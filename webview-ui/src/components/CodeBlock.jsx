// tinker/webview-ui/src/components/CodeBlock.jsx
import React, { useMemo, useState } from "react";
import { FileCode, Check, Zap, Loader2, Copy, CheckCheck } from "lucide-react";
import clsx from "clsx";
import hljs from "highlight.js";
import { useVSCodeMessage } from "../hooks/useVSCodeMessage";

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
  scala: "scala",
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
  dockerfile: "dockerfile",
  xml: "xml",
  vue: "vue",
  svelte: "svelte",
};

const extensionColors = {
  js: "text-yellow-300",
  jsx: "text-cyan-300",
  ts: "text-blue-300",
  tsx: "text-indigo-300",
  md: "text-emerald-300",
};

function getLanguageFromPath(filePath) {
  if (!filePath) return null;
  const ext = filePath.split(".").pop()?.toLowerCase();
  return extensionToLanguage[ext] || null;
}

function getFileMeta(filePath = "Code Block") {
  const parts = filePath.split("/").filter(Boolean);
  const name = parts[parts.length - 1] || "Code Block";
  const ext = name.includes(".") ? name.split(".").pop() : "";
  return { name, ext, full: filePath || name };
}

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

function CodeBlock({ block, appliedBlocks = new Set(), isStreaming = false }) {
  const vscode = useVSCodeMessage(() => {});
  const [copied, setCopied] = useState(false);

  const contentHash = (block.search || block.content || "").slice(0, 50);
  const blockKey = `${block.filePath}:${block.type}:${contentHash}`;
  const isApplied = appliedBlocks.has(blockKey);

  // Copy content to clipboard
  const handleCopy = () => {
    const content = block.content || block.replace || "";
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const language = useMemo(
    () => getLanguageFromPath(block.filePath),
    [block.filePath]
  );

  const highlightedSearch = useMemo(
    () => (block.search ? highlightCode(block.search, language) : ""),
    [block.search, language]
  );
  const highlightedReplace = useMemo(
    () => (block.replace ? highlightCode(block.replace, language) : ""),
    [block.replace, language]
  );
  const highlightedContent = useMemo(
    () => (block.content ? highlightCode(block.content, language) : ""),
    [block.content, language]
  );

  // Define block types BEFORE handleApply uses them
  const isNew = block.type === "new";
  const isEdit = block.type === "edit";
  const isRewrite = block.type === "rewrite";
  const { name, ext, full } = getFileMeta(block.filePath);
  const extClass = extensionColors[ext] || "text-white/80";

  const handleApply = () => {
    if (isApplied) return;

    if (isNew) {
      // Create new file
      vscode.postMessage({
        type: "createNewFile",
        filePath: block.filePath,
        content: block.content,
        block: block,
      });
    } else if (isRewrite) {
      // Rewrite entire file
      vscode.postMessage({
        type: "rewriteFile",
        filePath: block.filePath,
        content: block.content,
        block: block,
      });
    } else {
      // Edit with diff preview
      vscode.postMessage({
        type: "previewDiff",
        filePath: block.filePath,
        original: block.search,
        modified: block.replace,
        block: block,
        autoApply: false,
      });
    }
  };

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
        "rounded-xl shadow-md overflow-hidden border",
        isApplied && "opacity-70"
      )}
      style={{ borderColor: "var(--vscode-panel-border)" }}
    >
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: "var(--vscode-textCodeBlock-background)" }}
      >
        <div
          className="flex items-center justify-between px-3 py-2 border-b"
          style={{
            backgroundColor: "var(--vscode-editor-background)",
            borderColor: "var(--vscode-panel-border)",
          }}
        >
          <div
            className="flex items-center gap-2 text-sm font-medium min-w-0"
            style={{ color: "var(--vscode-foreground)" }}
          >
            <FileCode size={14} className={extClass} />
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
            {isStreaming && (
              <Loader2 size={12} className="text-yellow-300 animate-spin" />
            )}
            {isApplied && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
                <Check size={10} />
                Applied
              </span>
            )}
          </div>
          {!isStreaming && (
            <div className="flex items-center gap-1.5">
              {isApplied && (
                <button
                  onClick={handleCopy}
                  className="text-[10px] px-2 py-1 rounded-lg inline-flex items-center gap-1 transition-all bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                  title="Copy to clipboard"
                >
                  {copied ? <CheckCheck size={10} /> : <Copy size={10} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              )}
              <button
                onClick={handleApply}
                disabled={isApplied}
                className={clsx(
                  "text-[10px] px-3 py-1 rounded-lg inline-flex items-center gap-1 transition-all",
                  isApplied
                    ? "bg-green-500/15 text-green-400 cursor-default"
                    : "bg-tinker-copper/20 text-tinker-copper border border-tinker-copper/30 hover:bg-tinker-copper/30"
                )}
              >
                {isApplied ? <Check size={10} /> : <Zap size={10} />}
                {isApplied ? "Applied" : "Apply"}
              </button>
            </div>
          )}
        </div>

        <div className="tinker-code overflow-x-auto font-mono text-xs p-3">
          {isEdit && block.search && block.replace ? (
            <div className="flex flex-col gap-px">
              {splitHighlightedLines(highlightedSearch).map((line, idx) => (
                <div key={`del-${idx}`} className="flex bg-red-500/10 rounded">
                  <span className="select-none opacity-50 w-8 text-right mr-2 px-2 py-1 shrink-0">
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
                  <span className="select-none opacity-50 w-8 text-right mr-2 px-2 py-1 shrink-0">
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
      </div>
    </div>
  );
}

export default CodeBlock;
