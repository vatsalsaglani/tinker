// @ts-nocheck
import React, { useState, useMemo } from "react";
import {
  ChevronRight,
  ChevronDown,
  Search,
  FileText,
  List,
  Terminal,
  Wrench,
  FolderTree,
  Info,
  FolderPlus,
  FilePlus,
  Package,
  GitBranch,
  Play,
  Settings,
} from "lucide-react";
import clsx from "clsx";
import hljs from "highlight.js";

const toolIcons = {
  grep_search: Search,
  read_file: FileText,
  read_multiple_files: FileText,
  list_files: List,
  get_file_tree: FolderTree,
  get_file_info: Info,
  run_command: Terminal,
  default: Wrench,
};

const toolColors = {
  grep_search: "text-blue-400",
  read_file: "text-green-400",
  read_multiple_files: "text-green-400",
  list_files: "text-purple-400",
  get_file_tree: "text-yellow-400",
  get_file_info: "text-cyan-400",
  run_command: "text-orange-400",
  default: "text-tinker-spark",
};

// Infer command type from command string
const inferCommandType = (command) => {
  if (!command)
    return {
      type: "command",
      icon: Terminal,
      color: "text-orange-400",
      label: "Shell Command",
    };
  const cmd = command.toLowerCase().trim();

  // Directory operations
  if (/^mkdir\s/.test(cmd)) {
    return {
      type: "mkdir",
      icon: FolderPlus,
      color: "text-yellow-400",
      label: "Create Directory",
    };
  }
  // File operations
  if (/^touch\s/.test(cmd)) {
    return {
      type: "touch",
      icon: FilePlus,
      color: "text-green-400",
      label: "Create File",
    };
  }
  // Package managers
  if (/^(npm|yarn|pnpm|bun)\s/.test(cmd)) {
    const action =
      /\s(install|add|remove|init|run|build|dev|start|test)/.exec(cmd)?.[1] ||
      "run";
    return {
      type: "npm",
      icon: Package,
      color: "text-red-400",
      label: `npm ${action}`,
    };
  }
  // Go
  if (/^go\s/.test(cmd)) {
    const action =
      /^go\s+(mod|build|run|test|get|install)/.exec(cmd)?.[1] || "run";
    return {
      type: "go",
      icon: Play,
      color: "text-cyan-400",
      label: `go ${action}`,
    };
  }
  // Git
  if (/^git\s/.test(cmd)) {
    const action =
      /^git\s+(init|clone|add|commit|push|pull|checkout|branch|merge|diff|log|status)/.exec(
        cmd
      )?.[1] || "command";
    return {
      type: "git",
      icon: GitBranch,
      color: "text-orange-500",
      label: `git ${action}`,
    };
  }
  // Python
  if (/^(python3?|pip3?|uv|poetry|conda)\s/.test(cmd)) {
    return {
      type: "python",
      icon: Play,
      color: "text-yellow-400",
      label: "Python",
    };
  }
  // Docker
  if (/^(docker|docker-compose|podman)\s/.test(cmd)) {
    return {
      type: "docker",
      icon: Package,
      color: "text-blue-400",
      label: "Docker",
    };
  }
  // Make/Build
  if (/^(make|cmake|cargo|gradle|mvn)\s/.test(cmd)) {
    return {
      type: "build",
      icon: Settings,
      color: "text-purple-400",
      label: "Build",
    };
  }
  // ls/cat/grep etc
  if (/^(ls|cat|grep|find|head|tail|wc|du|df)\s/.test(cmd)) {
    return {
      type: "inspect",
      icon: Search,
      color: "text-blue-400",
      label: "Inspect",
    };
  }

  return {
    type: "command",
    icon: Terminal,
    color: "text-orange-400",
    label: "Shell Command",
  };
};

// Highlighted code display component for tool input/output
function HighlightedCode({ content, language = "json", maxHeight }) {
  const highlighted = useMemo(() => {
    try {
      if (language && hljs.getLanguage(language)) {
        return hljs.highlight(content, { language }).value;
      }
      return hljs.highlightAuto(content).value;
    } catch {
      return content;
    }
  }, [content, language]);

  return (
    <div
      className="rounded-xl overflow-hidden border"
      style={{ borderColor: "var(--vscode-panel-border)" }}
    >
      <pre
        className={clsx(
          "p-3 rounded-xl overflow-x-auto font-mono text-xs",
          maxHeight && "overflow-y-auto"
        )}
        style={{
          maxHeight: maxHeight || undefined,
          backgroundColor: "var(--vscode-textCodeBlock-background)",
          color: "var(--vscode-editor-foreground)",
        }}
      >
        <code
          className="hljs"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  );
}

function ToolCall({ tool, result }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isCompleted = !!result;

  // Map LLM-provided type enum to icon/color/label
  const getInfoForLLMType = (type) => {
    const mapping = {
      create_directory: {
        icon: FolderPlus,
        color: "text-yellow-400",
        label: "Create Directory",
      },
      create_file: {
        icon: FilePlus,
        color: "text-green-400",
        label: "Create File",
      },
      package_manager: {
        icon: Package,
        color: "text-red-400",
        label: "Package Manager",
      },
      git: { icon: GitBranch, color: "text-orange-500", label: "Git" },
      build: { icon: Settings, color: "text-purple-400", label: "Build" },
      test: { icon: Play, color: "text-green-400", label: "Test" },
      inspect: { icon: Search, color: "text-blue-400", label: "Inspect" },
      shell: {
        icon: Terminal,
        color: "text-orange-400",
        label: "Shell Command",
      },
    };
    return mapping[type] || null;
  };

  // For run_command: use LLM-provided type first, fallback to inference
  const commandInfo = useMemo(() => {
    if (tool.name === "run_command") {
      // Try LLM-provided type first
      if (tool.args?.type) {
        const llmInfo = getInfoForLLMType(tool.args.type);
        if (llmInfo) return llmInfo;
      }
      // Fallback to inference from command string
      if (tool.args?.command) {
        return inferCommandType(tool.args.command);
      }
    }
    return null;
  }, [tool.name, tool.args?.type, tool.args?.command]);

  // Use inferred icon/color for run_command, otherwise use defaults
  const Icon = commandInfo?.icon || toolIcons[tool.name] || toolIcons.default;
  const iconColor =
    commandInfo?.color || toolColors[tool.name] || toolColors.default;

  // Get reason from tool args, or fallback to tool name
  const reason = tool.args?.reason || tool.name.replace(/_/g, " ");
  const displayName = commandInfo?.label || tool.name.replace(/_/g, " ");

  // Filter out reason from displayed args
  const filteredArgs = { ...tool.args };
  delete filteredArgs.reason;

  // Format content
  const inputContent = useMemo(
    () => JSON.stringify(filteredArgs, null, 2),
    [filteredArgs]
  );

  const outputContent = useMemo(() => {
    if (!result) return "";
    return typeof result === "string"
      ? result
      : JSON.stringify(result, null, 2);
  }, [result]);

  return (
    <div className="border-l-2 border-tinker-copper/50 pl-3 py-1 my-2">
      <div
        className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div
          className="flex-shrink-0"
          style={{ color: "var(--vscode-descriptionForeground)" }}
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </div>

        <div
          className={clsx("p-1 rounded", iconColor)}
          style={{ backgroundColor: "var(--vscode-badge-background)" }}
        >
          <Icon size={12} />
        </div>

        <span
          className="text-sm flex-1 truncate"
          style={{ color: "var(--vscode-foreground)" }}
        >
          {reason}
        </span>

        <span
          className={clsx(
            "text-[10px] px-2 py-0.5 rounded-full font-medium",
            isCompleted
              ? "bg-green-500/15 text-green-400 border border-green-500/20"
              : "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20"
          )}
        >
          {isCompleted ? "Completed" : "Running..."}
        </span>
      </div>

      {isExpanded && (
        <div className="mt-3 ml-6 space-y-3 text-xs">
          {/* Tool badge */}
          <div className="inline-flex items-center gap-1.5">
            <span
              className="text-[10px] px-2 py-0.5 rounded-lg border"
              style={{
                backgroundColor: "var(--vscode-badge-background)",
                color: "var(--vscode-badge-foreground)",
                borderColor: "var(--vscode-panel-border)",
              }}
            >
              {displayName}
            </span>
          </div>

          {/* Input Args */}
          {Object.keys(filteredArgs).length > 0 && (
            <div>
              <div
                className="text-[10px] font-medium mb-1.5 uppercase tracking-wider"
                style={{ color: "var(--vscode-descriptionForeground)" }}
              >
                Input
              </div>
              <HighlightedCode content={inputContent} language="json" />
            </div>
          )}

          {/* Result */}
          {result && (
            <div>
              <div
                className="text-[10px] font-medium mb-1.5 uppercase tracking-wider"
                style={{ color: "var(--vscode-descriptionForeground)" }}
              >
                Output
              </div>
              <HighlightedCode
                content={outputContent}
                language="json"
                maxHeight="200px"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ToolCall;
