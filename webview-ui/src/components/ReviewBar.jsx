// @ts-nocheck
import React, { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  FilePlus,
  FileEdit,
  Eye,
} from "lucide-react";

/**
 * Get file icon and color based on extension
 */
const getFileInfo = (filePath) => {
  const ext = filePath?.split(".").pop()?.toLowerCase() || "";
  const name = filePath?.split("/").pop() || filePath;

  const iconColors = {
    go: "text-cyan-400",
    js: "text-yellow-400",
    jsx: "text-yellow-400",
    ts: "text-blue-400",
    tsx: "text-blue-400",
    py: "text-blue-400",
    sql: "text-orange-400",
    yaml: "text-pink-400",
    yml: "text-pink-400",
    json: "text-yellow-400",
    md: "text-gray-400",
    css: "text-purple-400",
    html: "text-orange-400",
  };

  return {
    name,
    color: iconColors[ext] || "text-gray-400",
    ext,
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
 * ReviewBar - Collapsible bar showing pending file changes
 */
const ReviewBar = ({
  pendingBlocks = [],
  onReviewClick,
  appliedBlocks = new Set(),
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Filter out already applied blocks
  const unappliedBlocks = pendingBlocks.filter((block) => {
    const derivedContentHash = (
      block.search ||
      block.content ||
      block.replace ||
      ""
    ).substring(0, 50);
    const blockKey = `${block.filePath}:${block.type}:${
      block.contentHash || derivedContentHash
    }`;
    return !appliedBlocks.has(blockKey);
  });

  if (unappliedBlocks.length === 0) return null;

  // Group by file path and aggregate
  const fileMap = new Map();
  unappliedBlocks.forEach((block) => {
    const existing = fileMap.get(block.filePath);
    if (existing) {
      existing.blocks.push(block);
      existing.lineCount += getLineCount(block.content || block.replace);
    } else {
      fileMap.set(block.filePath, {
        filePath: block.filePath,
        blocks: [block],
        lineCount: getLineCount(block.content || block.replace),
        type: block.type, // 'new', 'rewrite', or 'edit'
      });
    }
  });

  const files = Array.from(fileMap.values());

  return (
    <div
      className="mb-2 rounded-lg border overflow-hidden"
      style={{
        backgroundColor: "var(--vscode-input-background)",
        borderColor: "var(--vscode-panel-border)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown size={14} className="text-gray-400" />
          ) : (
            <ChevronRight size={14} className="text-gray-400" />
          )}
          <span
            className="text-sm font-medium"
            style={{ color: "var(--vscode-foreground)" }}
          >
            {files.length} {files.length === 1 ? "File" : "Files"}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onReviewClick?.();
          }}
          className="px-3 py-1 text-xs font-medium rounded-md transition-all bg-tinker-copper text-white hover:bg-tinker-copper-light shadow-lg shadow-tinker-copper/20"
        >
          <span className="flex items-center gap-1.5">
            <Eye size={12} />
            Review
          </span>
        </button>
      </div>

      {/* Expanded file list */}
      {isExpanded && (
        <div
          className="border-t max-h-48 overflow-y-auto"
          style={{ borderColor: "var(--vscode-panel-border)" }}
        >
          {files.map((file, idx) => {
            const fileInfo = getFileInfo(file.filePath);
            const isNew = file.type === "new";
            const isRewrite = file.type === "rewrite";

            return (
              <div
                key={idx}
                className="flex items-center justify-between px-3 py-1.5 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isNew ? (
                    <FilePlus
                      size={14}
                      className="text-green-400 flex-shrink-0"
                    />
                  ) : isRewrite ? (
                    <FileEdit
                      size={14}
                      className="text-orange-400 flex-shrink-0"
                    />
                  ) : (
                    <FileText
                      size={14}
                      className={`${fileInfo.color} flex-shrink-0`}
                    />
                  )}
                  <span
                    className="text-xs truncate"
                    style={{ color: "var(--vscode-foreground)" }}
                    title={file.filePath}
                  >
                    {fileInfo.name}
                  </span>
                </div>
                <span className="text-xs text-green-400 flex-shrink-0 ml-2">
                  +{file.lineCount}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ReviewBar;
