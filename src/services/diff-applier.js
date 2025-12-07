const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

/**
 * Diff Applier - Parses and applies Aider-style code blocks
 */
class DiffApplier {
  /**
   * Parse Aider blocks from LLM response
   */
  static parseAiderBlocks(response) {
    const blocks = [];

    // 1. Try fenced code blocks first
    const fencedRegex = /```(?:\w+)?\s*\n?([\s\S]*?)```/g;
    let match;
    let hasFencedBlocks = false;

    while ((match = fencedRegex.exec(response)) !== null) {
      const content = match[1];
      if (this._parseBlockContent(content, blocks)) {
        hasFencedBlocks = true;
      }
    }

    // 2. Fallback to raw blocks if no fenced blocks found
    if (!hasFencedBlocks) {
      const rawBlockRegex =
        /([^\n]+)\s*\n?<{3,}\s*(?:SEARCH|NEW FILE)(?:[\s\S]*?)>{3,}\s*(?:REPLACE|NEW FILE)/g;
      while ((match = rawBlockRegex.exec(response)) !== null) {
        this._parseBlockContent(match[0], blocks);
      }
    }

    return blocks;
  }

  static _parseBlockContent(content, blocks) {
    let found = false;

    // Extract file path from first line
    const lines = content.split("\n");
    const filePath = (lines[0].trim() || lines[1]?.trim() || "")
      .replace(/^```\w*/, "")
      .trim();

    // Check for NEW FILE
    if (
      content.match(/<{3,}\s*NEW FILE/) &&
      content.match(/>{3,}\s*NEW FILE/)
    ) {
      const fileContentMatch = content.match(
        /<{3,}\s*NEW FILE\s*\n([\s\S]*?)\n\s*>{3,}\s*NEW FILE/
      );

      if (fileContentMatch && filePath) {
        blocks.push({
          type: "new",
          filePath: filePath,
          content: fileContentMatch[1],
        });
        found = true;
      }
    }
    // Check for REWRITE FILE (full file replacement)
    else if (
      content.match(/<{7}\s*REWRITE FILE/) &&
      content.match(/>{7}\s*REWRITE FILE/)
    ) {
      const rewriteMatch = content.match(
        /<{7}\s*REWRITE FILE\s*\n([\s\S]*?)\n>{7}\s*REWRITE FILE/
      );

      if (rewriteMatch && filePath) {
        blocks.push({
          type: "rewrite",
          filePath: filePath,
          content: rewriteMatch[1],
        });
        found = true;
      }
    }
    // Check for SEARCH/REPLACE
    else if (content.match(/SEARCH/i) && content.match(/REPLACE/i)) {
      // IMPORTANT: Match exactly 7 equals signs to avoid matching === in code
      // Pattern: <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE
      const searchReplaceRegex =
        /<{7}\s*SEARCH\s*\n([\s\S]*?)\n={7}\n([\s\S]*?)\n>{7}\s*REPLACE/gi;
      let pairMatch;

      while ((pairMatch = searchReplaceRegex.exec(content)) !== null) {
        blocks.push({
          type: "edit",
          filePath: filePath,
          search: pairMatch[1] || "",
          replace: pairMatch[2] || "",
        });
        found = true;
      }
    }

    return found;
  }

  /**
   * Apply a single block
   */
  static async applyBlock(block, workspacePath) {
    const fullPath = path.join(workspacePath, block.filePath);

    if (block.type === "new") {
      return await this.createNewFile(fullPath, block.content);
    } else if (block.type === "rewrite") {
      return await this.rewriteFile(fullPath, block.content);
    } else if (block.type === "edit") {
      return await this.editFile(fullPath, block.search, block.replace);
    }

    return {
      success: false,
      error: "Unknown block type",
    };
  }

  /**
   * Rewrite an entire file with new content
   */
  static async rewriteFile(fullPath, content) {
    try {
      if (!fs.existsSync(fullPath)) {
        return {
          success: false,
          error: `File not found: ${path.basename(fullPath)}`,
        };
      }

      const uri = vscode.Uri.file(fullPath);

      // Write new content to file
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));

      // Open the file
      await vscode.window.showTextDocument(uri);

      return {
        success: true,
        message: `Rewrote file: ${path.basename(fullPath)}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to rewrite file: ${error.message}`,
      };
    }
  }

  /**
   * Create a new file
   */
  static async createNewFile(fullPath, content) {
    try {
      if (fs.existsSync(fullPath)) {
        return {
          success: false,
          error: `File already exists: ${path.basename(fullPath)}`,
        };
      }

      // Create directory if needed
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Create file
      const uri = vscode.Uri.file(fullPath);
      const edit = new vscode.WorkspaceEdit();
      edit.createFile(uri, { ignoreIfExists: false });
      await vscode.workspace.applyEdit(edit);

      // Write content
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));

      // Open the file
      await vscode.window.showTextDocument(uri);

      return {
        success: true,
        message: `Created new file: ${path.basename(fullPath)}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create file: ${error.message}`,
      };
    }
  }

  /**
   * Edit an existing file
   */
  static async editFile(fullPath, searchBlock, replaceBlock) {
    try {
      if (!fs.existsSync(fullPath)) {
        return {
          success: false,
          error: `File not found: ${path.basename(fullPath)}`,
        };
      }

      const uri = vscode.Uri.file(fullPath);
      const document = await vscode.workspace.openTextDocument(uri);
      const fileContent = document.getText();

      // Try exact match first
      const exactMatchIndex = fileContent.indexOf(searchBlock);

      if (exactMatchIndex !== -1) {
        // Calculate positions
        const beforeSearch = fileContent.substring(0, exactMatchIndex);
        const startLine = beforeSearch.split("\n").length - 1;
        const startChar = exactMatchIndex - beforeSearch.lastIndexOf("\n") - 1;

        const endPos = exactMatchIndex + searchBlock.length;
        const beforeEnd = fileContent.substring(0, endPos);
        const endLine = beforeEnd.split("\n").length - 1;
        const endChar = endPos - beforeEnd.lastIndexOf("\n") - 1;

        // Apply edit
        const edit = new vscode.WorkspaceEdit();
        const range = new vscode.Range(
          new vscode.Position(startLine, Math.max(0, startChar)),
          new vscode.Position(endLine, endChar)
        );
        edit.replace(uri, range, replaceBlock);
        await vscode.workspace.applyEdit(edit);

        // Open the file
        await vscode.window.showTextDocument(uri);

        return {
          success: true,
          message: `Applied changes to ${path.basename(fullPath)}`,
        };
      } else {
        // Try fuzzy match
        return await this.fuzzyMatchAndReplace(
          uri,
          document,
          searchBlock,
          replaceBlock
        );
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to edit file: ${error.message}`,
      };
    }
  }

  /**
   * Fuzzy matching for whitespace differences
   */
  static async fuzzyMatchAndReplace(uri, document, searchBlock, replaceBlock) {
    const searchLines = searchBlock.split("\n");
    const contentLines = document.getText().split("\n");

    // Find matching lines (ignore whitespace differences)
    let foundIndex = -1;
    for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
      let match = true;
      for (let j = 0; j < searchLines.length; j++) {
        if (contentLines[i + j].trim() !== searchLines[j].trim()) {
          match = false;
          break;
        }
      }
      if (match) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex !== -1) {
      const edit = new vscode.WorkspaceEdit();
      const range = new vscode.Range(
        new vscode.Position(foundIndex, 0),
        new vscode.Position(foundIndex + searchLines.length, 0)
      );
      edit.replace(uri, range, replaceBlock + "\n");
      await vscode.workspace.applyEdit(edit);

      // Open the file
      await vscode.window.showTextDocument(uri);

      return {
        success: true,
        message: `Applied changes to ${path.basename(
          uri.fsPath
        )} (fuzzy match)`,
      };
    } else {
      return {
        success: false,
        error: `Could not find matching code in ${path.basename(uri.fsPath)}`,
      };
    }
  }

  /**
   * Show a diff preview
   */
  static async showDiffPreview(block, workspacePath, diffProvider) {
    if (block.type === "new") {
      // For new files, just show content
      const content = block.content;
      const doc = await vscode.workspace.openTextDocument({
        content,
        language: this.getLanguageFromPath(block.filePath),
      });
      await vscode.window.showTextDocument(doc, { preview: true });
      return;
    }

    // For edits, show diff
    const fullPath = path.join(workspacePath, block.filePath);
    if (!fs.existsSync(fullPath)) {
      vscode.window.showWarningMessage(`File not found: ${block.filePath}`);
      return;
    }

    const uri = vscode.Uri.file(fullPath);
    const document = await vscode.workspace.openTextDocument(uri);
    const originalContent = document.getText();

    // Create modified version
    let modifiedContent = originalContent;
    if (originalContent.includes(block.search)) {
      modifiedContent = originalContent.replace(block.search, block.replace);
    }

    // Use diff provider
    const modifiedUri = uri.with({
      scheme: "tinker-diff",
      path: uri.path,
      query: `t=${Date.now()}`,
    });

    if (diffProvider) {
      diffProvider.update(modifiedUri, modifiedContent);
    }

    await vscode.commands.executeCommand(
      "vscode.diff",
      uri,
      modifiedUri,
      `${block.filePath} (Preview)`
    );
  }

  /**
   * Get language ID from file path
   */
  static getLanguageFromPath(filePath) {
    const ext = path.extname(filePath);
    const langMap = {
      ".js": "javascript",
      ".jsx": "javascriptreact",
      ".ts": "typescript",
      ".tsx": "typescriptreact",
      ".py": "python",
      ".html": "html",
      ".css": "css",
      ".scss": "scss",
      ".json": "json",
      ".md": "markdown",
      ".txt": "plaintext",
    };
    return langMap[ext] || "plaintext";
  }
}

module.exports = DiffApplier;
