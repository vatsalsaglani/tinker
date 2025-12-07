// tinker/webview-ui/src/components/DiffViewer.jsx
import React, { useMemo } from "react";
import { Plus, Minus, FileCode, Check, Zap } from "lucide-react";
import hljs from "highlight.js";

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
  py: "text-green-300",
  rb: "text-rose-300",
  java: "text-orange-300",
  go: "text-cyan-300",
  rs: "text-orange-300",
  cpp: "text-blue-300",
  c: "text-blue-200",
  cs: "text-purple-300",
  php: "text-indigo-300",
  swift: "text-orange-300",
  kt: "text-orange-300",
  scala: "text-red-300",
  html: "text-orange-300",
  css: "text-blue-300",
  scss: "text-pink-300",
  json: "text-amber-300",
  yaml: "text-amber-200",
  yml: "text-amber-200",
  md: "text-emerald-300",
  sql: "text-sky-300",
  sh: "text-slate-200",
  bash: "text-slate-200",
  zsh: "text-slate-200",
  dockerfile: "text-blue-300",
  xml: "text-orange-300",
  vue: "text-emerald-300",
  svelte: "text-orange-300",
};

const getFileMeta = (filePath = "Diff Preview") => {
  const parts = filePath.split("/").filter(Boolean);
  const name = parts[parts.length - 1] || "Diff Preview";
  const ext = name.includes(".") ? name.split(".").pop() : "";
  return { name, ext, full: filePath || name };
};

const highlightLines = (text, language) => {
  if (!text) return [];
  const highlighted = (() => {
    try {
      if (language && hljs.getLanguage(language)) {
        return hljs.highlight(text, { language }).value;
      }
      return hljs.highlightAuto(text).value;
    } catch {
      return text;
    }
  })();
  return highlighted.split("\n");
};

function DiffViewer({ original, modified, filePath, onApply, applied }) {
  const { name, ext, full } = getFileMeta(filePath);
  const extClass = extensionColors[ext] || "text-white/80";
  const language = useMemo(
    () => (ext ? extensionToLanguage[ext.toLowerCase()] : null),
    [ext]
  );
  const isApplied = Boolean(applied);

  const originalLines = useMemo(
    () => highlightLines(original || "", language),
    [original, language]
  );
  const modifiedLines = useMemo(
    () => highlightLines(modified || "", language),
    [modified, language]
  );

  return (
    <div className="rounded-xl shadow-md overflow-hidden bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-[1px]">
      <div className="rounded-xl bg-[#0f172a] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-white/[0.03] border-b border-white/5">
          <div className="flex items-center gap-2 text-sm font-medium text-white/80">
            <FileCode size={14} className={extClass} />
            <span className="truncate max-w-xs text-xs">{full || name}</span>
            {ext && (
              <span className="text-white/30 text-[10px] uppercase tracking-wide bg-white/5 px-1.5 py-0.5 rounded">
                {ext}
              </span>
            )}
            {isApplied && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
                <Check size={10} />
                Applied
              </span>
            )}
          </div>
          <button
            type="button"
            className={`text-[10px] px-3 py-1 rounded-lg inline-flex items-center gap-1 transition-all ${
              isApplied
                ? "bg-white/5 text-white/30 cursor-not-allowed"
                : "bg-tinker-copper/20 text-tinker-copper border border-tinker-copper/30 hover:bg-tinker-copper/30"
            }`}
            onClick={onApply}
            disabled={!onApply || isApplied}
          >
            {isApplied ? <Check size={10} /> : <Zap size={10} />}
            {isApplied ? "Applied" : "Apply"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 text-xs font-mono">
          <div>
            <div className="mb-2 text-white/60 font-semibold text-[11px] tracking-wide">
              Original
            </div>
            <div className="space-y-[1px]">
              {originalLines.map((line, idx) => (
                <div
                  key={`del-${idx}`}
                  className="flex bg-red-500/10 hover:bg-red-500/20 rounded"
                >
                  <span className="select-none opacity-50 w-10 text-right mr-3 px-2 py-1 flex items-center justify-end gap-1">
                    <Minus size={10} />
                    {idx + 1}
                  </span>
                  <span
                    className="hljs flex-1 px-2 py-1"
                    dangerouslySetInnerHTML={{ __html: line || "&nbsp;" }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-white/60 font-semibold text-[11px] tracking-wide">
              Modified
            </div>
            <div className="space-y-[1px]">
              {modifiedLines.map((line, idx) => (
                <div
                  key={`add-${idx}`}
                  className="flex bg-green-500/10 hover:bg-green-500/20 rounded"
                >
                  <span className="select-none opacity-50 w-10 text-right mr-3 px-2 py-1 flex items-center justify-end gap-1">
                    <Plus size={10} />
                    {idx + 1}
                  </span>
                  <span
                    className="hljs flex-1 px-2 py-1"
                    dangerouslySetInnerHTML={{ __html: line || "&nbsp;" }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DiffViewer;
