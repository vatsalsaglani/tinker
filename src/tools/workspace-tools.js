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
      case "get_diagnostics":
        return await this.getDiagnostics(args);
      case "find_symbols":
        return await this.findSymbols(args);
      case "get_file_outline":
        return await this.getFileOutline(args);
      case "go_to_definition":
        return await this.goToDefinition(args);
      case "find_references":
        return await this.findReferences(args);
      case "get_git_status":
        return await this.getGitStatus(args);
      case "run_command":
        return await this.runCommand(args);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Resolve a path safely inside the workspace root.
   * Prevents directory traversal and cross-drive escapes.
   */
  _resolveWorkspacePath(targetPath, { allowEmpty = false } = {}) {
    if (!this.workspaceRoot) {
      return { error: "No workspace folder open" };
    }

    if (targetPath === undefined || targetPath === null) {
      if (allowEmpty) {
        return { fullPath: this.workspaceRoot, relativePath: "" };
      }
      return { error: "Path is required" };
    }

    if (typeof targetPath !== "string") {
      return { error: "Path must be a string" };
    }

    const trimmed = targetPath.trim();
    if (!allowEmpty && trimmed.length === 0) {
      return { error: "Path cannot be empty" };
    }

    if (trimmed.includes("\0")) {
      return { error: "Invalid path" };
    }

    const fullPath =
      trimmed.length === 0
        ? this.workspaceRoot
        : path.resolve(this.workspaceRoot, trimmed);
    const relativePath = path.relative(this.workspaceRoot, fullPath);
    const outsideWorkspace =
      relativePath.startsWith("..") || path.isAbsolute(relativePath);

    if (outsideWorkspace) {
      return { error: "Path must be within workspace root" };
    }

    return { fullPath, relativePath };
  }

  _uriDisplayPath(uri) {
    if (!uri) return "";
    if (!this.workspaceRoot) return uri.fsPath || uri.toString();
    const relative = path.relative(this.workspaceRoot, uri.fsPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return uri.fsPath || uri.toString();
    }
    return relative;
  }

  _severityToNumber(severity) {
    const map = {
      error: vscode.DiagnosticSeverity.Error,
      warning: vscode.DiagnosticSeverity.Warning,
      info: vscode.DiagnosticSeverity.Information,
      hint: vscode.DiagnosticSeverity.Hint,
    };
    return map[severity];
  }

  _severityToLabel(severity) {
    const map = {
      [vscode.DiagnosticSeverity.Error]: "error",
      [vscode.DiagnosticSeverity.Warning]: "warning",
      [vscode.DiagnosticSeverity.Information]: "info",
      [vscode.DiagnosticSeverity.Hint]: "hint",
    };
    return map[severity] || "unknown";
  }

  _symbolKindToLabel(kind) {
    const map = {
      [vscode.SymbolKind.File]: "file",
      [vscode.SymbolKind.Module]: "module",
      [vscode.SymbolKind.Namespace]: "namespace",
      [vscode.SymbolKind.Package]: "package",
      [vscode.SymbolKind.Class]: "class",
      [vscode.SymbolKind.Method]: "method",
      [vscode.SymbolKind.Property]: "property",
      [vscode.SymbolKind.Field]: "field",
      [vscode.SymbolKind.Constructor]: "constructor",
      [vscode.SymbolKind.Enum]: "enum",
      [vscode.SymbolKind.Interface]: "interface",
      [vscode.SymbolKind.Function]: "function",
      [vscode.SymbolKind.Variable]: "variable",
      [vscode.SymbolKind.Constant]: "constant",
      [vscode.SymbolKind.String]: "string",
      [vscode.SymbolKind.Number]: "number",
      [vscode.SymbolKind.Boolean]: "boolean",
      [vscode.SymbolKind.Array]: "array",
      [vscode.SymbolKind.Object]: "object",
      [vscode.SymbolKind.Key]: "key",
      [vscode.SymbolKind.Null]: "null",
      [vscode.SymbolKind.EnumMember]: "enumMember",
      [vscode.SymbolKind.Struct]: "struct",
      [vscode.SymbolKind.Event]: "event",
      [vscode.SymbolKind.Operator]: "operator",
      [vscode.SymbolKind.TypeParameter]: "typeParameter",
    };
    return map[kind] || "symbol";
  }

  async _resolveDocumentPosition(filePath, line, character = 1) {
    const resolved = this._resolveWorkspacePath(filePath);
    if (resolved.error) {
      return { error: resolved.error };
    }

    const uri = vscode.Uri.file(resolved.fullPath);
    const document = await vscode.workspace.openTextDocument(uri);
    const zeroLine = Math.max(0, Math.min((line || 1) - 1, document.lineCount - 1));
    const lineLength = document.lineAt(zeroLine).text.length;
    const zeroCharacter = Math.max(
      0,
      Math.min((character || 1) - 1, lineLength)
    );

    return {
      uri,
      document,
      position: new vscode.Position(zeroLine, zeroCharacter),
      filePath: resolved.relativePath,
    };
  }

  _normalizeDefinitionLocation(location) {
    // LocationLink
    if (location?.targetUri && location?.targetRange) {
      return {
        uri: location.targetUri,
        range: location.targetSelectionRange || location.targetRange,
      };
    }

    // Location
    if (location?.uri && location?.range) {
      return {
        uri: location.uri,
        range: location.range,
      };
    }

    return null;
  }

  _parseGitBranchLine(line) {
    const defaultResult = {
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      detached: false,
      raw: line || "",
    };

    if (!line || !line.startsWith("##")) {
      return defaultResult;
    }

    const text = line.slice(2).trim();
    if (text.startsWith("No commits yet on ")) {
      return {
        ...defaultResult,
        branch: text.replace("No commits yet on ", "").trim(),
      };
    }

    if (text.startsWith("HEAD (")) {
      return {
        ...defaultResult,
        branch: "HEAD",
        detached: true,
      };
    }

    const countMatch = text.match(/\[(.*?)\]\s*$/);
    let ahead = 0;
    let behind = 0;
    if (countMatch?.[1]) {
      const aheadMatch = countMatch[1].match(/ahead (\d+)/);
      const behindMatch = countMatch[1].match(/behind (\d+)/);
      ahead = aheadMatch ? parseInt(aheadMatch[1], 10) : 0;
      behind = behindMatch ? parseInt(behindMatch[1], 10) : 0;
    }

    const noCounts = text.replace(/\s*\[.*\]\s*$/, "");
    if (noCounts.includes("...")) {
      const [branch, upstream] = noCounts.split("...");
      return {
        ...defaultResult,
        branch: branch?.trim() || null,
        upstream: upstream?.trim() || null,
        ahead,
        behind,
      };
    }

    return {
      ...defaultResult,
      branch: noCounts.trim() || null,
      ahead,
      behind,
    };
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
      const results = [];
      const query = {
        pattern,
        isRegExp: true, // Keep parity with previous grep behavior
        isCaseSensitive: !case_insensitive,
      };
      const options = {
        include: file_pattern || undefined,
        exclude:
          "**/{node_modules,.git,dist,build,.next,out,coverage,.vscode,__pycache__,venv,.cache}/**",
        maxResults: Math.max(max_results * 2, max_results), // let us control truncation ourselves
      };

      const cts = new vscode.CancellationTokenSource();

      await vscode.workspace.findTextInFiles(
        query,
        options,
        (match) => {
          if (results.length >= max_results) {
            cts.cancel();
            return;
          }

          const ranges = Array.isArray(match.ranges)
            ? match.ranges
            : [match.ranges];
          const firstRange = ranges[0];
          if (!firstRange) return;

          results.push({
            file: vscode.workspace.asRelativePath(match.uri),
            line: firstRange.start.line + 1,
            content: match.preview?.text || "",
          });
        },
        cts.token
      );

      if (results.length === 0) {
        return { results: [], message: "No matches found" };
      }

      return {
        results,
        total: results.length,
        truncated: results.length >= max_results,
      };
    } catch (error) {
      return { error: `Search failed: ${error.message}` };
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
      const resolved = this._resolveWorkspacePath(file_path);
      if (resolved.error) {
        return { error: resolved.error };
      }

      const fullPath = resolved.fullPath;
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
      const resolved = this._resolveWorkspacePath(file_path);
      if (resolved.error) {
        return { error: resolved.error };
      }

      const fullPath = resolved.fullPath;
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
   * Get diagnostics from VS Code language services
   */
  async getDiagnostics({ file_path, severity, max_results = 100 }) {
    if (!this.workspaceRoot) {
      return { error: "No workspace folder open" };
    }

    try {
      const severityFilter =
        severity !== undefined ? this._severityToNumber(severity) : undefined;
      const results = [];
      let truncated = false;

      const pushDiagnostic = (uri, diagnostic) => {
        if (results.length >= max_results) {
          truncated = true;
          return;
        }

        if (
          severityFilter !== undefined &&
          diagnostic.severity !== severityFilter
        ) {
          return;
        }

        const codeValue =
          typeof diagnostic.code === "object"
            ? diagnostic.code?.value
            : diagnostic.code;

        results.push({
          file: this._uriDisplayPath(uri),
          line: diagnostic.range.start.line + 1,
          character: diagnostic.range.start.character + 1,
          end_line: diagnostic.range.end.line + 1,
          end_character: diagnostic.range.end.character + 1,
          severity: this._severityToLabel(diagnostic.severity),
          source: diagnostic.source || "",
          code: codeValue !== undefined ? String(codeValue) : "",
          message: diagnostic.message || "",
        });
      };

      if (file_path) {
        const resolved = this._resolveWorkspacePath(file_path);
        if (resolved.error) {
          return { error: resolved.error };
        }
        const uri = vscode.Uri.file(resolved.fullPath);
        const diagnostics = vscode.languages.getDiagnostics(uri) || [];
        for (const diagnostic of diagnostics) {
          pushDiagnostic(uri, diagnostic);
          if (truncated) break;
        }
      } else {
        const allDiagnostics = vscode.languages.getDiagnostics();
        for (const [uri, diagnostics] of allDiagnostics) {
          if (!uri?.fsPath) continue;
          const rel = path.relative(this.workspaceRoot, uri.fsPath);
          if (rel.startsWith("..") || path.isAbsolute(rel)) continue;

          for (const diagnostic of diagnostics) {
            pushDiagnostic(uri, diagnostic);
            if (truncated) break;
          }
          if (truncated) break;
        }
      }

      if (results.length === 0) {
        return { results: [], message: "No diagnostics found" };
      }

      return {
        results,
        total: results.length,
        truncated,
      };
    } catch (error) {
      return { error: `Failed to get diagnostics: ${error.message}` };
    }
  }

  /**
   * Find workspace symbols
   */
  async findSymbols({ query, max_results = 50 }) {
    if (!this.workspaceRoot) {
      return { error: "No workspace folder open" };
    }

    try {
      const symbols =
        (await vscode.commands.executeCommand(
          "vscode.executeWorkspaceSymbolProvider",
          query
        )) || [];

      if (!Array.isArray(symbols) || symbols.length === 0) {
        return { results: [], message: "No symbols found" };
      }

      const results = symbols.slice(0, max_results).map((symbol) => ({
        name: symbol.name,
        kind: this._symbolKindToLabel(symbol.kind),
        container_name: symbol.containerName || "",
        file: this._uriDisplayPath(symbol.location?.uri),
        line: (symbol.location?.range?.start?.line || 0) + 1,
        character: (symbol.location?.range?.start?.character || 0) + 1,
      }));

      return {
        results,
        total: symbols.length,
        truncated: symbols.length > max_results,
      };
    } catch (error) {
      return { error: `Symbol search failed: ${error.message}` };
    }
  }

  /**
   * Get document symbol outline for a file
   */
  async getFileOutline({ file_path, max_depth = 8 }) {
    if (!this.workspaceRoot) {
      return { error: "No workspace folder open" };
    }

    try {
      const resolved = this._resolveWorkspacePath(file_path);
      if (resolved.error) {
        return { error: resolved.error };
      }

      const uri = vscode.Uri.file(resolved.fullPath);
      const symbols =
        (await vscode.commands.executeCommand(
          "vscode.executeDocumentSymbolProvider",
          uri
        )) || [];

      if (!Array.isArray(symbols) || symbols.length === 0) {
        return { file_path, symbols: [], message: "No symbols found" };
      }

      const MAX_ITEMS = 1000;
      const flattened = [];
      let truncated = false;

      const pushItem = (item) => {
        if (flattened.length >= MAX_ITEMS) {
          truncated = true;
          return;
        }
        flattened.push(item);
      };

      const visit = (symbol, depth = 0, parent = null) => {
        if (depth > max_depth || truncated) return;

        if (symbol.location && symbol.kind !== undefined) {
          // SymbolInformation
          pushItem({
            name: symbol.name,
            kind: this._symbolKindToLabel(symbol.kind),
            detail: "",
            parent: symbol.containerName || parent || "",
            depth,
            line: symbol.location.range.start.line + 1,
            character: symbol.location.range.start.character + 1,
            end_line: symbol.location.range.end.line + 1,
            end_character: symbol.location.range.end.character + 1,
          });
          return;
        }

        // DocumentSymbol
        pushItem({
          name: symbol.name,
          kind: this._symbolKindToLabel(symbol.kind),
          detail: symbol.detail || "",
          parent: parent || "",
          depth,
          line: symbol.range.start.line + 1,
          character: symbol.range.start.character + 1,
          end_line: symbol.range.end.line + 1,
          end_character: symbol.range.end.character + 1,
        });

        if (Array.isArray(symbol.children)) {
          for (const child of symbol.children) {
            visit(child, depth + 1, symbol.name);
            if (truncated) break;
          }
        }
      };

      for (const symbol of symbols) {
        visit(symbol, 0, null);
        if (truncated) break;
      }

      return {
        file_path,
        symbols: flattened,
        total: flattened.length,
        truncated,
      };
    } catch (error) {
      return { error: `Failed to get file outline: ${error.message}` };
    }
  }

  /**
   * Go to definition for symbol at file position
   */
  async goToDefinition({
    file_path,
    line,
    character = 1,
    max_results = 20,
  }) {
    if (!this.workspaceRoot) {
      return { error: "No workspace folder open" };
    }

    try {
      const resolved = await this._resolveDocumentPosition(
        file_path,
        line,
        character
      );
      if (resolved.error) {
        return { error: resolved.error };
      }

      const rawLocations = await vscode.commands.executeCommand(
        "vscode.executeDefinitionProvider",
        resolved.uri,
        resolved.position
      );
      const locations = Array.isArray(rawLocations)
        ? rawLocations
        : rawLocations
        ? [rawLocations]
        : [];

      if (locations.length === 0) {
        return { results: [], message: "No definitions found" };
      }

      const results = [];
      for (const location of locations) {
        if (results.length >= max_results) break;
        const normalized = this._normalizeDefinitionLocation(location);
        if (!normalized) continue;

        results.push({
          file: this._uriDisplayPath(normalized.uri),
          line: normalized.range.start.line + 1,
          character: normalized.range.start.character + 1,
          end_line: normalized.range.end.line + 1,
          end_character: normalized.range.end.character + 1,
        });
      }

      return {
        results,
        total: locations.length,
        truncated: locations.length > max_results,
      };
    } catch (error) {
      return { error: `Definition lookup failed: ${error.message}` };
    }
  }

  /**
   * Find references for symbol at file position
   */
  async findReferences({
    file_path,
    line,
    character = 1,
    include_declaration = false,
    max_results = 100,
  }) {
    if (!this.workspaceRoot) {
      return { error: "No workspace folder open" };
    }

    try {
      const resolved = await this._resolveDocumentPosition(
        file_path,
        line,
        character
      );
      if (resolved.error) {
        return { error: resolved.error };
      }

      const locations =
        (await vscode.commands.executeCommand(
          "vscode.executeReferenceProvider",
          resolved.uri,
          resolved.position,
          { includeDeclaration: include_declaration }
        )) || [];

      if (!Array.isArray(locations) || locations.length === 0) {
        return { results: [], message: "No references found" };
      }

      const results = locations.slice(0, max_results).map((location) => ({
        file: this._uriDisplayPath(location.uri),
        line: location.range.start.line + 1,
        character: location.range.start.character + 1,
        end_line: location.range.end.line + 1,
        end_character: location.range.end.character + 1,
      }));

      return {
        results,
        total: locations.length,
        truncated: locations.length > max_results,
      };
    } catch (error) {
      return { error: `Reference lookup failed: ${error.message}` };
    }
  }

  /**
   * Get git status summary for current workspace
   */
  async getGitStatus({ include_diff_stat = false }) {
    if (!this.workspaceRoot) {
      return { error: "No workspace folder open" };
    }

    try {
      const { stdout } = await execAsync("git status --porcelain=1 --branch", {
        cwd: this.workspaceRoot,
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      });

      const lines = stdout.split("\n").filter(Boolean);
      const branchInfo = this._parseGitBranchLine(lines[0] || "");
      const entries = [];
      let staged = 0;
      let unstaged = 0;
      let untracked = 0;
      let conflicts = 0;

      const conflictCodes = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

      for (const line of lines.slice(1)) {
        if (line.length < 3) continue;

        const indexStatus = line[0];
        const worktreeStatus = line[1];
        const rawPath = line.slice(3).trim();
        const isUntracked = indexStatus === "?" && worktreeStatus === "?";
        const statusCode = `${indexStatus}${worktreeStatus}`;
        const isConflicted =
          conflictCodes.has(statusCode) ||
          indexStatus === "U" ||
          worktreeStatus === "U";

        if (indexStatus !== " " && !isUntracked) staged++;
        if (worktreeStatus !== " " && !isUntracked) unstaged++;
        if (isUntracked) untracked++;
        if (isConflicted) conflicts++;

        entries.push({
          index_status: indexStatus,
          worktree_status: worktreeStatus,
          status_code: statusCode,
          path: rawPath,
          conflicted: isConflicted,
          untracked: isUntracked,
        });
      }

      const result = {
        branch: branchInfo.branch,
        upstream: branchInfo.upstream,
        ahead: branchInfo.ahead,
        behind: branchInfo.behind,
        detached: branchInfo.detached,
        clean: entries.length === 0,
        counts: {
          staged,
          unstaged,
          untracked,
          conflicts,
          total: entries.length,
        },
        entries,
      };

      if (include_diff_stat) {
        let workingTreeStat = "";
        let stagedStat = "";

        try {
          const wt = await execAsync("git diff --stat", {
            cwd: this.workspaceRoot,
            timeout: 10000,
            maxBuffer: 1024 * 1024,
          });
          workingTreeStat = wt.stdout.trim();
        } catch (_error) {
          workingTreeStat = "";
        }

        try {
          const stagedDiff = await execAsync("git diff --cached --stat", {
            cwd: this.workspaceRoot,
            timeout: 10000,
            maxBuffer: 1024 * 1024,
          });
          stagedStat = stagedDiff.stdout.trim();
        } catch (_error) {
          stagedStat = "";
        }

        result.diff_stat = {
          working_tree: workingTreeStat,
          staged: stagedStat,
        };
      }

      return result;
    } catch (error) {
      const msg = error.message || "";
      if (msg.includes("not a git repository")) {
        return { error: "Workspace is not a git repository" };
      }
      return { error: `Failed to get git status: ${msg}` };
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
      const cwdResolution = this._resolveWorkspacePath(cwd || "", {
        allowEmpty: true,
      });
      if (cwdResolution.error) {
        return { error: "Working directory must be within workspace" };
      }
      const workingDir = cwdResolution.fullPath;

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
