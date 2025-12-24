const vscode = require("vscode");
const fs = require("fs").promises;
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");
const { toolDefinitions, toolSchemas } = require("./tool-schemas");

const execAsync = promisify(exec);

/**
 * Workspace Tools - File operations and code search
 */
class WorkspaceTools {
  constructor() {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  /**
   * Get tool definitions (from Zod schemas)
   */
  getToolDefinitions() {
    return toolDefinitions;
  }

  /**
   * Execute a tool by name (with Zod validation)
   * Returns { validationError: true, ... } if validation fails - caller can retry
   */
  async executeTool(toolName, args) {
    // Validate args with Zod
    const schema = toolSchemas[toolName];
    if (schema) {
      try {
        const validatedArgs = schema.parse(args);
        return await this._executeValidatedTool(toolName, validatedArgs);
      } catch (error) {
        // Return structured validation error for retry logic
        const zodErrors = error.errors || [];
        const errorDetails = zodErrors.map((e) => ({
          path: e.path.join("."),
          message: e.message,
          code: e.code,
        }));

        return {
          validationError: true,
          toolName,
          providedArgs: args,
          error: `Invalid arguments for ${toolName}: ${error.message}`,
          details: errorDetails,
          hint: this._getValidationHint(toolName, errorDetails),
        };
      }
    }

    return await this._executeValidatedTool(toolName, args);
  }

  /**
   * Get a helpful hint for fixing validation errors
   */
  _getValidationHint(toolName, errors) {
    const hints = [];
    for (const err of errors) {
      if (err.code === "invalid_type") {
        hints.push(`Field "${err.path}" has wrong type. ${err.message}`);
      } else if (err.code === "invalid_enum_value") {
        hints.push(`Field "${err.path}" has invalid value. ${err.message}`);
      } else {
        hints.push(`${err.path}: ${err.message}`);
      }
    }
    return hints.join("; ");
  }

  async _executeValidatedTool(toolName, args) {
    switch (toolName) {
      case "grep_search":
        return await this.grepSearch(args);
      case "read_file":
        return await this.readFile(args);
      case "read_multiple_files":
        return await this.readMultipleFiles(args);
      case "get_file_tree":
        return await this.getFileTree(args);
      case "list_files":
        return await this.listFiles(args);
      case "get_file_info":
        return await this.getFileInfo(args);
      case "run_command":
        return await this.runCommand(args);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Grep search
   */
  async grepSearch({
    pattern,
    file_pattern = "",
    case_insensitive = false,
    max_results = 50,
  }) {
    if (!this.workspaceRoot) {
      return { error: "No workspace folder open" };
    }

    try {
      const caseFlag = case_insensitive ? "-i" : "";
      const excludeDirs = [
        "node_modules",
        ".git",
        "dist",
        "build",
        ".next",
        "out",
        "coverage",
        ".vscode",
        "__pycache__",
        "venv",
        ".cache",
      ]
        .map((d) => `--exclude-dir=${d}`)
        .join(" ");

      const excludeFiles = [
        "*.pyc",
        "*.min.js",
        "*.min.css",
        "*.map",
        "*.lock",
        "package-lock.json",
        "yarn.lock",
      ]
        .map((p) => `--exclude="${p}"`)
        .join(" ");

      const fileGlob = file_pattern ? `--include="${file_pattern}"` : "";
      const command = `timeout 5s grep -rn ${caseFlag} ${excludeDirs} ${excludeFiles} ${fileGlob} "${pattern}" . 2>/dev/null | head -n ${max_results}`;

      const { stdout } = await execAsync(command, {
        cwd: this.workspaceRoot,
        maxBuffer: 1024 * 1024 * 5,
        timeout: 6000,
      });

      if (!stdout) {
        return { results: [], message: "No matches found" };
      }

      const lines = stdout.trim().split("\n").filter(Boolean);
      const results = lines
        .slice(0, max_results)
        .map((line) => {
          const match = line.match(/^(.+?):(\d+):(.*)$/);
          if (match) {
            return {
              file: match[1].replace(/^\.\//, ""),
              line: parseInt(match[2]),
              content: match[3],
            };
          }
          return null;
        })
        .filter(Boolean);

      return {
        results,
        total: results.length,
        truncated: lines.length > max_results,
      };
    } catch (error) {
      if (error.code === 1) {
        return { results: [], message: "No matches found" };
      }
      return { error: error.message };
    }
  }

  /**
   * Read file
   */
  async readFile({ file_path, start_line, end_line }) {
    if (!this.workspaceRoot) {
      return { error: "No workspace folder open" };
    }

    try {
      const fullPath = path.join(this.workspaceRoot, file_path);
      const content = await fs.readFile(fullPath, "utf-8");
      const lines = content.split("\n");

      let startIdx = start_line ? start_line - 1 : 0;
      let endIdx = end_line ? end_line : lines.length;

      startIdx = Math.max(0, Math.min(startIdx, lines.length - 1));
      endIdx = Math.max(startIdx, Math.min(endIdx, lines.length));

      const selectedLines = lines.slice(startIdx, endIdx);
      const numberedContent = selectedLines
        .map((line, idx) => `${startIdx + idx + 1}:${line}`)
        .join("\n");

      return {
        file_path,
        total_lines: lines.length,
        start_line: startIdx + 1,
        end_line: endIdx,
        content: numberedContent,
      };
    } catch (error) {
      return { error: `Failed to read file: ${error.message}` };
    }
  }

  /**
   * Read multiple files
   */
  async readMultipleFiles({ file_paths }) {
    if (!this.workspaceRoot) {
      return { error: "No workspace folder open" };
    }

    const results = [];
    const errors = [];

    for (const filePath of file_paths) {
      try {
        const result = await this.readFile({ file_path: filePath });
        if (result.error) {
          errors.push(`${filePath}: ${result.error}`);
        } else {
          results.push(result);
        }
      } catch (error) {
        errors.push(`${filePath}: ${error.message}`);
      }
    }

    return {
      files: results,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Get file tree
   */
  async getFileTree({ max_depth = 5, include_files = true }) {
    if (!this.workspaceRoot) {
      return { error: "No workspace folder open" };
    }

    const shouldIgnore = (name) => {
      const ignorePatterns = [
        "node_modules",
        ".git",
        "dist",
        "build",
        ".next",
        "out",
        "coverage",
        ".vscode",
        "__pycache__",
        "venv",
        ".cache",
      ];
      const ignoreExtensions = [".pyc", ".so", ".dll", ".exe"];
      return (
        ignorePatterns.some((p) => name.includes(p)) ||
        ignoreExtensions.some((e) => name.endsWith(e))
      );
    };

    const buildTree = async (dirPath, depth = 0, prefix = "") => {
      if (depth > max_depth) return "";

      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        let output = "";

        const filtered = entries
          .filter((entry) => !shouldIgnore(entry.name))
          .sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
          });

        for (let i = 0; i < filtered.length; i++) {
          const entry = filtered[i];
          const isLast = i === filtered.length - 1;
          const connector = isLast ? "└── " : "├── ";
          const childPrefix = prefix + (isLast ? "    " : "│   ");

          if (entry.isDirectory()) {
            output += `${prefix}${connector}📁 ${entry.name}/\n`;
            const childPath = path.join(dirPath, entry.name);
            output += await buildTree(childPath, depth + 1, childPrefix);
          } else if (include_files) {
            output += `${prefix}${connector}${entry.name}\n`;
          }
        }

        return output;
      } catch (error) {
        return `${prefix}[Error: ${error.message}]\n`;
      }
    };

    const tree = await buildTree(this.workspaceRoot);
    return {
      root: path.basename(this.workspaceRoot),
      tree: `📁 ${path.basename(this.workspaceRoot)}/\n${tree}`,
    };
  }

  /**
   * List files
   */
  async listFiles({ pattern, max_results = 100 }) {
    if (!this.workspaceRoot) {
      return { error: "No workspace folder open" };
    }

    try {
      const files = await vscode.workspace.findFiles(
        pattern,
        "**/node_modules/**",
        max_results
      );

      const relativePaths = files.map((uri) =>
        path.relative(this.workspaceRoot, uri.fsPath)
      );

      return {
        files: relativePaths,
        total: relativePaths.length,
        truncated: relativePaths.length >= max_results,
      };
    } catch (error) {
      return { error: `Failed to list files: ${error.message}` };
    }
  }

  /**
   * Get file info
   */
  async getFileInfo({ file_path }) {
    if (!this.workspaceRoot) {
      return { error: "No workspace folder open" };
    }

    try {
      const fullPath = path.join(this.workspaceRoot, file_path);
      const stats = await fs.stat(fullPath);
      const content = await fs.readFile(fullPath, "utf-8");
      const lines = content.split("\n");

      return {
        file_path,
        size_bytes: stats.size,
        size_kb: (stats.size / 1024).toFixed(2),
        last_modified: stats.mtime.toISOString(),
        total_lines: lines.length,
        is_binary: this.isBinary(content),
      };
    } catch (error) {
      return { error: `Failed to get file info: ${error.message}` };
    }
  }

  /**
   * Run a shell command
   */
  async runCommand({ command, cwd, timeout = 30000 }) {
    if (!this.workspaceRoot) {
      return { error: "No workspace folder open" };
    }

    // Block dangerous commands
    const dangerousPatterns = [
      /\brm\s+-rf\b/i,
      /\brmdir\s+\/s\b/i,
      /\bdel\s+\/f\s+\/s\b/i,
      /\bformat\b/i,
      /\bmkfs\b/i,
      /\bdd\s+if=/i,
      />\s*\/dev\//i,
      /\bchmod\s+777\b/i,
      /\bsudo\b/i,
      /\b:\(\)\s*{\s*:\|:\s*&\s*}\s*;/i, // Fork bomb
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        return {
          error: "Potentially dangerous command blocked for safety",
          command,
        };
      }
    }

    // Block file write commands - agent must use SEARCH/REPLACE blocks instead
    const writePatterns = [
      { pattern: /\bapply_patch\b/i, name: "apply_patch" },
      { pattern: /\bpatch\s+-p/i, name: "patch" },
      { pattern: /cat\s*<<\s*['"]?EOF/i, name: "heredoc (cat <<EOF)" },
      { pattern: /cat\s*<<\s*['"]?PATCH/i, name: "heredoc (cat <<PATCH)" },
      {
        pattern: /cat\s*<<\s*['"]?\w+['"]?\s*>/i,
        name: "heredoc with redirect",
      },
      { pattern: /\bcat\s+.*>\s*\S+/i, name: "cat redirect" },
      { pattern: /\becho\s+.*>\s*\S+/i, name: "echo redirect" },
      { pattern: /\bprintf\s+.*>\s*\S+/i, name: "printf redirect" },
      { pattern: /\bsed\s+-i\b/i, name: "sed -i (in-place edit)" },
      { pattern: /\bawk\s+-i\b/i, name: "awk -i (in-place edit)" },
      { pattern: /\bperl\s+-i\b/i, name: "perl -i (in-place edit)" },
      { pattern: /\btee\s+\S+/i, name: "tee" },
      {
        pattern:
          /\b>\s*\S+\.(js|ts|jsx|tsx|json|py|css|html|md|txt|yaml|yml)\b/i,
        name: "redirect to file",
      },
      { pattern: /\b>>\s*\S+/i, name: "append redirect" },
    ];

    for (const { pattern, name } of writePatterns) {
      if (pattern.test(command)) {
        return {
          error: `WRITE COMMAND BLOCKED: '${name}' is not allowed. run_command is READ-ONLY.`,
          message:
            "To modify files, you must use SEARCH/REPLACE, REWRITE FILE, or NEW FILE blocks in your response text. Do NOT use run_command to write files.",
          blocked_command: command,
          suggestion:
            "Please output your changes using the proper code block format in your next response.",
        };
      }
    }

    try {
      const workingDir = cwd
        ? path.resolve(this.workspaceRoot, cwd)
        : this.workspaceRoot;

      // Verify working directory is within workspace
      if (!workingDir.startsWith(this.workspaceRoot)) {
        return { error: "Working directory must be within workspace" };
      }

      const { stdout, stderr } = await execAsync(command, {
        cwd: workingDir,
        timeout,
        maxBuffer: 1024 * 1024, // 1MB buffer
        shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
      });

      return {
        success: true,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        command,
        cwd: workingDir,
      };
    } catch (error) {
      // Command failed but may have partial output
      return {
        error: error.message,
        stdout: error.stdout?.trim() || "",
        stderr: error.stderr?.trim() || "",
        exitCode: error.code,
        command,
      };
    }
  }

  isBinary(content) {
    const sample = content.slice(0, 8000);
    for (let i = 0; i < sample.length; i++) {
      const code = sample.charCodeAt(i);
      if (
        code === 0 ||
        (code < 32 && code !== 9 && code !== 10 && code !== 13)
      ) {
        return true;
      }
    }
    return false;
  }
}

module.exports = { WorkspaceTools };
