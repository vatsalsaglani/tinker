const vscode = require("vscode");

/**
 * Diff Content Provider - Provides content for diff previews
 */
class DiffContentProvider {
  constructor() {
    this._onDidChange = new vscode.EventEmitter();
    this.diffs = new Map();
  }

  get onDidChange() {
    return this._onDidChange.event;
  }

  provideTextDocumentContent(uri) {
    return this.diffs.get(uri.toString()) || "";
  }

  update(uri, content) {
    this.diffs.set(uri.toString(), content);
    this._onDidChange.fire(uri);
  }

  clear(uri) {
    this.diffs.delete(uri.toString());
    this._onDidChange.fire(uri);
  }

  clearAll() {
    this.diffs.clear();
  }
}

module.exports = DiffContentProvider;
