const vscode = require("vscode");
const ChatViewProvider = require("./services/chat-provider");
const DiffContentProvider = require("./services/diff-content-provider");

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log("🔧 Tinker extension is activating...");

  // Register diff content provider for preview
  const diffProvider = new DiffContentProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      "tinker-diff",
      diffProvider
    )
  );

  // Create and register chat view provider
  const chatProvider = new ChatViewProvider(context.extensionUri, diffProvider);
  chatProvider.setContext(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("tinker-sidebar", chatProvider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    })
  );

  // Command: Add selection to chat context
  context.subscriptions.push(
    vscode.commands.registerCommand("tinker.addSelection", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage("No active editor");
        return;
      }

      const selection = editor.document.getText(editor.selection);
      if (!selection) {
        vscode.window.showInformationMessage("No text selected");
        return;
      }

      // Get file path relative to workspace
      const filePath = vscode.workspace.asRelativePath(editor.document.uri);
      const lineStart = editor.selection.start.line + 1;
      const lineEnd = editor.selection.end.line + 1;

      chatProvider.addSelectionContext({
        text: selection,
        filePath,
        lineStart,
        lineEnd,
      });

      vscode.window.showInformationMessage(
        "✓ Selection added to Tinker context"
      );
    })
  );

  // Command: Open settings
  context.subscriptions.push(
    vscode.commands.registerCommand("tinker.openSettings", () => {
      chatProvider.openSettings();
    })
  );

  // Command: Clear chat
  context.subscriptions.push(
    vscode.commands.registerCommand("tinker.clearChat", () => {
      chatProvider.clearChat();
    })
  );

  // Command: Accept change from diff preview
  context.subscriptions.push(
    vscode.commands.registerCommand("tinker.acceptChange", async () => {
      await chatProvider.acceptPendingChange();
    })
  );

  // Command: Reject change from diff preview
  context.subscriptions.push(
    vscode.commands.registerCommand("tinker.rejectChange", async () => {
      await chatProvider.rejectPendingChange();
    })
  );

  // Command: Accept all changes
  context.subscriptions.push(
    vscode.commands.registerCommand("tinker.acceptAllChanges", async () => {
      await chatProvider.acceptPendingChange(true);
    })
  );

  // Command: Open configuration panel
  context.subscriptions.push(
    vscode.commands.registerCommand("tinker.openConfigPanel", () => {
      chatProvider.openConfigPanel();
    })
  );

  // Command: New conversation
  context.subscriptions.push(
    vscode.commands.registerCommand("tinker.newConversation", async () => {
      await chatProvider.createNewConversation();
    })
  );

  // Command: Show conversations
  context.subscriptions.push(
    vscode.commands.registerCommand("tinker.showConversations", () => {
      chatProvider.showConversations();
    })
  );

  // Command: Show settings
  context.subscriptions.push(
    vscode.commands.registerCommand("tinker.showSettings", () => {
      chatProvider.showSettings();
    })
  );

  console.log("✅ Tinker extension activated successfully");
}

function deactivate() {
  console.log("Tinker extension deactivated");
}

module.exports = {
  activate,
  deactivate,
};
