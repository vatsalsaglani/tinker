const vscode = require("vscode");
const ChatViewProvider = require("./services/chat-provider");
const DiffContentProvider = require("./services/diff-content-provider");
const { getLogger } = require("./services/logger");

const rootLogger = getLogger();
const logger = rootLogger.child("Extension");

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const config = vscode.workspace.getConfiguration("tinkerAssistant");
  const outputChannel = vscode.window.createOutputChannel("Tinker");

  rootLogger.initialize({
    outputChannel,
    level: config.get("logLevel", "info"),
    revealOnError: config.get("revealLogsOnError", false),
  });
  context.subscriptions.push(outputChannel);

  logger.info("Tinker extension is activating...");

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
  context.subscriptions.push({
    dispose: () => {
      chatProvider.dispose?.();
    },
  });

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

  // Command: Open MCP panel
  context.subscriptions.push(
    vscode.commands.registerCommand("tinker.openMcpPanel", () => {
      chatProvider.openMcpPanel();
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

  // Command: Show logs
  context.subscriptions.push(
    vscode.commands.registerCommand("tinker.showLogs", () => {
      rootLogger.show(false);
    })
  );

  // Keep logger settings in sync with configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      const updatedConfig = vscode.workspace.getConfiguration("tinkerAssistant");
      if (event.affectsConfiguration("tinkerAssistant.logLevel")) {
        rootLogger.setLevel(updatedConfig.get("logLevel", "info"));
      }
      if (event.affectsConfiguration("tinkerAssistant.revealLogsOnError")) {
        rootLogger.setRevealOnError(
          updatedConfig.get("revealLogsOnError", false)
        );
      }
      if (
        event.affectsConfiguration("tinkerAssistant.mcp.enabled") ||
        event.affectsConfiguration("tinkerAssistant.mcp.servers")
      ) {
        chatProvider.handleLoadMcpConfig?.();
        chatProvider.handleRefreshMcpTools?.(true);
      }
    })
  );

  logger.info("Tinker extension activated successfully");
}

function deactivate() {
  logger.info("Tinker extension deactivated");
}

module.exports = {
  activate,
  deactivate,
};
