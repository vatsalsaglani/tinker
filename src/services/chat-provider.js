const vscode = require("vscode");
const LLMConnector = require("./llm-connector");
const DiffApplier = require("./diff-applier");
const ConversationStore = require("./conversation-store");
const TitleGenerator = require("./title-generator");
const TokenContextManager = require("./token-context-manager");
const { WorkspaceTools } = require("../tools/workspace-tools");

class ChatViewProvider {
  constructor(extensionUri, diffProvider) {
    this._extensionUri = extensionUri;
    this._diffProvider = diffProvider;
    this._view = undefined;
    this._context = undefined;
    this.workspaceTools = new WorkspaceTools();
    this.llmConnector = new LLMConnector();
    this.conversationHistory = [];
    this.abortController = null;
    this.outputChannel = vscode.window.createOutputChannel("Tinker Assistant");

    // Conversation persistence (initialized in setContext)
    this.storage = null;
    this.titleGenerator = new TitleGenerator(this.llmConnector);
    this.currentConversationId = null;

    // Token tracking
    this.tokenManager = new TokenContextManager();
  }

  setContext(context) {
    this._context = context;
    // Initialize storage with context (for globalState access)
    this.storage = new ConversationStore(context);
  }

  /**
   * Get a secret value with fallback to globalState for VS Code forks
   * that may not fully implement the secrets API (e.g., Cursor, Kiro)
   */
  async getSecret(key) {
    try {
      // First try the secrets API
      if (this._context?.secrets) {
        const value = await this._context.secrets.get(key);
        if (value) {
          this.log(`[Secrets] Retrieved '${key}' from secrets API`);
          return value;
        }
      }
    } catch (error) {
      this.log(`[Secrets] Error reading from secrets API: ${error.message}`);
    }

    // Fallback to globalState (less secure but more compatible)
    try {
      if (this._context?.globalState) {
        const value = this._context.globalState.get(`secret_${key}`);
        if (value) {
          this.log(`[Secrets] Retrieved '${key}' from globalState fallback`);
          return value;
        }
      }
    } catch (error) {
      this.log(`[Secrets] Error reading from globalState: ${error.message}`);
    }

    this.log(`[Secrets] No value found for '${key}' in secrets or globalState`);
    return null;
  }

  /**
   * Store a secret value - tries secrets API first, falls back to globalState
   */
  async setSecret(key, value) {
    let storedInSecrets = false;

    // Try secrets API first
    try {
      if (this._context?.secrets) {
        await this._context.secrets.store(key, value);
        storedInSecrets = true;
        this.log(`[Secrets] Stored '${key}' in secrets API`);
      }
    } catch (error) {
      this.log(`[Secrets] Error storing in secrets API: ${error.message}`);
    }

    // Also store in globalState as fallback (for forks that lose secrets)
    try {
      if (this._context?.globalState) {
        await this._context.globalState.update(`secret_${key}`, value);
        if (!storedInSecrets) {
          this.log(`[Secrets] Stored '${key}' in globalState fallback`);
        }
      }
    } catch (error) {
      this.log(`[Secrets] Error storing in globalState: ${error.message}`);
    }

    return storedInSecrets;
  }

  /**
   * Delete a secret value from both storage locations
   */
  async deleteSecret(key) {
    // Delete from secrets API
    try {
      if (this._context?.secrets) {
        await this._context.secrets.delete(key);
        this.log(`[Secrets] Deleted '${key}' from secrets API`);
      }
    } catch (error) {
      this.log(`[Secrets] Error deleting from secrets API: ${error.message}`);
    }

    // Also delete from globalState
    try {
      if (this._context?.globalState) {
        await this._context.globalState.update(`secret_${key}`, undefined);
        this.log(`[Secrets] Deleted '${key}' from globalState`);
      }
    } catch (error) {
      this.log(`[Secrets] Error deleting from globalState: ${error.message}`);
    }
  }

  log(message, ...args) {
    const timestamp = new Date().toISOString().substring(11, 23);
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage, ...args);
    this.outputChannel.appendLine(
      logMessage + (args.length > 0 ? " " + JSON.stringify(args) : "")
    );
  }

  resolveWebviewView(webviewView, context, _token) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this._extensionUri,
        vscode.Uri.joinPath(this._extensionUri, "webview-ui"),
      ],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "sendMessage":
          await this.handleUserMessage(
            data.text,
            data.contextChips || [],
            data.images || []
          );
          break;
        case "stopGeneration":
          this.stopGeneration();
          break;
        case "saveSettings":
          await this.saveSettings(data.settings);
          break;
        case "loadSettings":
          await this.loadSettings();
          break;
        case "applyCode":
          await this.applyCodeBlock(data.block);
          break;
        case "previewDiff":
          await this.previewDiff(
            data.filePath,
            data.original,
            data.modified,
            data.block
          );
          break;
        case "createNewFile":
          await this.handleCreateNewFile(
            data.filePath,
            data.content,
            data.block
          );
          break;
        case "rewriteFile":
          await this.handleRewriteFile(data.filePath, data.content, data.block);
          break;
        case "previewImage":
          // Save image to temp file and open in VS Code
          try {
            const os = require("os");
            const fs = require("fs");
            const path = require("path");
            const img = data.image;
            const ext = img.mimeType.split("/")[1] || "png";
            const tempPath = path.join(
              os.tmpdir(),
              `tinker-preview-${img.id}.${ext}`
            );
            fs.writeFileSync(tempPath, Buffer.from(img.base64, "base64"));
            const doc = await vscode.workspace.openTextDocument(
              vscode.Uri.file(tempPath)
            );
            await vscode.window.showTextDocument(doc, { preview: true });
          } catch (e) {
            this.log("Error previewing image:", e);
          }
          break;
        case "searchFiles":
          await this.handleFileSearch(data.query);
          break;
        case "searchSymbols":
          await this.handleSymbolSearch(data.query);
          break;
        case "openContext":
          await this.handleOpenContext(data.chip);
          break;
        case "saveCustomModels":
          await this.saveCustomModels(data.models);
          break;
        case "loadCustomModels":
          await this.loadCustomModels();
          break;
        case "saveBedrockModels":
          await this.saveBedrockModels(data.models);
          break;
        case "loadBedrockModels":
          await this.loadBedrockModels();
          break;
        case "saveProviderApiKey":
          await this.saveProviderApiKey(data.provider, data.apiKey);
          break;
        case "loadAllProviderKeys":
          await this.loadAllProviderKeys();
          break;
        case "openConfigPanel":
          this.openConfigPanel();
          break;

        // Conversation management
        case "loadConversations":
          await this.handleLoadConversations();
          break;
        case "switchConversation":
          await this.handleSwitchConversation(data.conversationId);
          break;
        case "createConversation":
          await this.handleCreateConversation();
          break;
        case "deleteConversation":
          await this.handleDeleteConversation(data.conversationId);
          break;
        case "togglePinConversation":
          await this.handleTogglePin(data.conversationId);
          break;
        case "loadMoreMessages":
          await this.handleLoadMoreMessages(data.beforeId);
          break;
      }
    });

    // Load settings on startup
    this.loadSettings();
  }

  /**
   * Handle file search (# trigger)
   */
  async handleFileSearch(query) {
    if (!this._view) return;

    try {
      // Use VS Code's file search API
      const searchPattern = query ? `**/*${query}*` : "**/*";
      const files = await vscode.workspace.findFiles(
        searchPattern,
        "**/node_modules/**",
        50 // Limit results
      );

      const results = files.map((file) => ({
        label: vscode.workspace.asRelativePath(file),
        value: file.fsPath,
        type: "file",
      }));

      this._view.webview.postMessage({
        type: "searchResults",
        searchType: "file",
        results: results,
      });
    } catch (error) {
      this.log("File search error:", error);
      this._view.webview.postMessage({
        type: "searchResults",
        searchType: "file",
        results: [],
      });
    }
  }

  /**
   * Handle symbol search (@ trigger)
   */
  async handleSymbolSearch(query) {
    if (!this._view) return;

    try {
      let results = [];

      console.log(`[Symbol Search] Query: "${query}"`);

      // Strategy 1: Workspace symbols (best for functions, classes, methods)
      if (query.length >= 1) {
        console.log("[Symbol Search] Executing workspace symbol provider...");
        const symbols = await vscode.commands.executeCommand(
          "vscode.executeWorkspaceSymbolProvider",
          query
        );

        console.log(
          `[Symbol Search] Workspace symbols found: ${symbols?.length || 0}`
        );

        if (symbols && symbols.length > 0) {
          results = symbols.slice(0, 20).map((s) => ({
            label: `${this.getSymbolIcon(s.kind)} ${
              s.name
            } - ${vscode.workspace.asRelativePath(s.location.uri)}`,
            value: `${s.location.uri.fsPath}:${s.location.range.start.line}`,
            type: "symbol",
          }));
        }
      }

      // Strategy 2: Document symbols from active file (fallback)
      if (results.length === 0 && vscode.window.activeTextEditor) {
        console.log("[Symbol Search] Falling back to document symbols...");
        const docSymbols = await vscode.commands.executeCommand(
          "vscode.executeDocumentSymbolProvider",
          vscode.window.activeTextEditor.document.uri
        );

        if (docSymbols) {
          const flatSymbols = this.flattenSymbols(docSymbols, query);
          console.log(
            `[Symbol Search] Document symbols found: ${flatSymbols.length}`
          );
          results = flatSymbols.slice(0, 20).map((s) => ({
            label: `${this.getSymbolIcon(s.kind)} ${s.name} (Current File)`,
            value: `${vscode.window.activeTextEditor.document.uri.fsPath}:${s.range.start.line}`,
            type: "symbol",
          }));
        }
      }

      console.log(`[Symbol Search] Total results: ${results.length}`);

      this._view.webview.postMessage({
        type: "searchResults",
        searchType: "symbol",
        results: results,
      });
    } catch (error) {
      console.error("[Symbol Search] Error:", error);
      this.log("Symbol search error:", error);
      this._view.webview.postMessage({
        type: "searchResults",
        searchType: "symbol",
        results: [],
      });
    }
  }

  /**
   * Flatten document symbols recursively
   */
  flattenSymbols(symbols, query) {
    const results = [];
    const lowerQuery = query.toLowerCase();

    const traverse = (nodes) => {
      for (const node of nodes) {
        if (node.name.toLowerCase().includes(lowerQuery)) {
          results.push(node);
        }
        if (node.children) {
          traverse(node.children);
        }
      }
    };

    traverse(symbols);
    return results;
  }

  /**
   * Get icon for symbol kind
   */
  getSymbolIcon(kind) {
    const icons = {
      [vscode.SymbolKind.Function]: "𝑓",
      [vscode.SymbolKind.Method]: "𝑚",
      [vscode.SymbolKind.Class]: "𝐶",
      [vscode.SymbolKind.Interface]: "𝐼",
      [vscode.SymbolKind.Variable]: "𝑣",
      [vscode.SymbolKind.Constant]: "𝑐",
      [vscode.SymbolKind.Property]: "𝑝",
      [vscode.SymbolKind.Module]: "𝑀",
    };
    return icons[kind] || "●";
  }

  /**
   * Handle opening context (file or symbol)
   */
  async handleOpenContext(chip) {
    try {
      // Handle both chip object and legacy (value, type) format
      const value = chip?.value || chip;
      const type = chip?.type || "file";

      if (!value) {
        console.error("[OpenContext] No value provided:", chip);
        return;
      }

      let filePath = value;
      let line = 0;

      // For selection chips, use the stored filePath and lineStart
      if (type === "selection" && chip?.filePath) {
        filePath = chip.filePath;
        line = chip.lineStart || 0;
      }
      // Parse line number if present (for symbols: "path:line")
      else if (type === "symbol") {
        const lastColon = value.lastIndexOf(":");
        if (lastColon > 0) {
          filePath = value.substring(0, lastColon);
          line = parseInt(value.substring(lastColon + 1)) || 0;
        }
      }

      // Resolve relative paths against workspace root
      if (
        filePath &&
        !filePath.startsWith("/") &&
        !filePath.match(/^[a-zA-Z]:/)
      ) {
        const workspaceRoot =
          vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
        if (workspaceRoot) {
          const path = require("path");
          filePath = path.join(workspaceRoot, filePath);
        }
      }

      console.log(`[OpenContext] Opening: ${filePath}, line: ${line}`);

      const doc = await vscode.workspace.openTextDocument(filePath);
      const editor = await vscode.window.showTextDocument(doc);

      if (line > 0) {
        const range = new vscode.Range(line, 0, line, 0);
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      }
    } catch (error) {
      console.error("[OpenContext] Error:", error);
      vscode.window.showErrorMessage(`Could not open file: ${error.message}`);
    }
  }

  /**
   * Add selection to context
   */
  addSelectionContext(selection) {
    if (this._view) {
      this._view.webview.postMessage({
        type: "addContextChip",
        chip: {
          type: "selection",
          value: selection.text,
          display: `${selection.filePath}:${selection.lineStart}-${selection.lineEnd}`,
          filePath: selection.filePath,
          lineStart: selection.lineStart,
          lineEnd: selection.lineEnd,
        },
      });
      // Focus the webview
      this._view.show?.(true);
    }
  }

  /**
   * Open settings panel
   */
  openSettings() {
    if (this._view) {
      this._view.webview.postMessage({
        type: "openSettings",
      });
      this._view.show?.(true);
    }
  }

  /**
   * Clear chat history
   */
  clearChat() {
    this.conversationHistory = [];
    if (this._view) {
      this._view.webview.postMessage({
        type: "clearChat",
      });
    }
    vscode.window.showInformationMessage("Chat history cleared");
  }

  /**
   * Stop generation
   */
  stopGeneration() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;

      this._view?.webview.postMessage({
        type: "generationStopped",
      });

      this._view?.webview.postMessage({
        type: "thinking",
        thinking: false,
      });
    }
  }

  /**
   * Handle user message
   */
  async handleUserMessage(text, contextChips, images = []) {
    if (!this._view) return;

    // Ensure we have a current conversation
    if (!this.currentConversationId && this.storage) {
      const workspaceId = this.getWorkspaceId();
      const conversation = await this.storage.getOrCreateDefault(workspaceId);
      this.currentConversationId = conversation.id;
    }

    // Create abort controller
    this.abortController = new AbortController();

    // Build context from chips (for LLM)
    let contextText = "";
    // Build chip metadata for storage (just paths/references, not full content)
    const chipMetadata = [];

    for (const chip of contextChips) {
      try {
        if (chip.type === "file") {
          const doc = await vscode.workspace.openTextDocument(chip.value);
          const relativePath = vscode.workspace.asRelativePath(doc.uri);
          contextText += `\n\nFile: ${relativePath}\n\`\`\`\n${doc.getText()}\n\`\`\``;
          chipMetadata.push({
            type: "file",
            path: relativePath,
            display: chip.display || relativePath,
          });
        } else if (chip.type === "symbol") {
          const [path, line] = chip.value.split(":");
          const doc = await vscode.workspace.openTextDocument(path);
          const lineNum = parseInt(line);
          const start = Math.max(0, lineNum - 10);
          const end = Math.min(doc.lineCount - 1, lineNum + 20);
          const range = new vscode.Range(start, 0, end, 1000);
          const content = doc.getText(range);
          const relativePath = vscode.workspace.asRelativePath(doc.uri);
          contextText += `\n\nSymbol: ${chip.display}\n\`\`\`\n${content}\n\`\`\``;
          chipMetadata.push({
            type: "symbol",
            path: relativePath,
            line: lineNum,
            display: chip.display,
          });
        } else if (chip.type === "selection") {
          contextText += `\n\nSelection from ${chip.display}:\n\`\`\`\n${chip.value}\n\`\`\``;
          chipMetadata.push({ type: "selection", display: chip.display });
        }
      } catch (e) {
        this.log("Error reading context chip:", e);
      }
    }

    const fullMessage = text + contextText;

    // Format user message - with images if any (for LLM with full context)
    let userMessage;
    if (images && images.length > 0) {
      // Multi-modal message with images
      const contentParts = [{ type: "text", text: fullMessage }];

      // Add images (limit to 4 per message)
      images.slice(0, 4).forEach((img) => {
        contentParts.push({
          type: "image_url",
          image_url: {
            url: `data:${img.mimeType};base64,${img.base64}`,
          },
        });
      });

      userMessage = { role: "user", content: contentParts };
    } else {
      userMessage = { role: "user", content: fullMessage };
    }

    this.conversationHistory.push(userMessage);

    // Persist user message to storage - store ONLY original text + chip metadata (not full file content)
    if (this.storage && this.currentConversationId) {
      try {
        const workspaceId = this.getWorkspaceId();

        // Build display content for storage (text only, no file contents)
        let displayContent;
        if (images && images.length > 0) {
          displayContent = [
            { type: "text", text: text }, // Original text only
            ...images.slice(0, 4).map((img) => ({
              type: "image_url",
              image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
            })),
          ];
        } else {
          displayContent = text; // Original text only
        }

        await this.storage.addMessage(workspaceId, this.currentConversationId, {
          role: "user",
          content: displayContent,
          provider: this.llmConnector.getCurrentProvider()?.name || null,
          model: this.llmConnector.getCurrentProvider()?.model || null,
          contextChips: chipMetadata.length > 0 ? chipMetadata : null,
        });
      } catch (err) {
        this.log("Error persisting user message:", err);
      }
    }

    // Send to webview - only show original text + images (not the augmented context)
    // The LLM gets the full context, but the UI should just show what the user typed
    let displayContent;
    if (images && images.length > 0) {
      displayContent = [
        { type: "text", text: text }, // Original text only
        ...images.slice(0, 4).map((img) => ({
          type: "image_url",
          image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
        })),
      ];
    } else {
      displayContent = text; // Original text only
    }

    this._view.webview.postMessage({
      type: "userMessage",
      message: displayContent,
    });

    // Show thinking
    this._view.webview.postMessage({
      type: "thinking",
      thinking: true,
    });

    try {
      // Get file tree for context
      const fileTree = await this.workspaceTools.getFileTree({
        max_depth: 3,
        include_files: true,
      });

      // System prompt with workspace context
      const systemPrompt = LLMConnector.getSystemPrompt({
        workspaceRoot: this.workspaceTools.workspaceRoot || "",
        fileTree: fileTree.tree || "",
      });

      // Get tools
      const tools = this.workspaceTools.getToolDefinitions();

      // Multi-turn conversation with tools
      // Progressive budgeting: inject warnings as we approach limit
      const MAX_TURNS = 25;
      const WARN_AT_50 = Math.floor(MAX_TURNS * 0.5); // 12 turns
      const WARN_AT_75 = Math.floor(MAX_TURNS * 0.75); // 18 turns
      const WARN_AT_90 = Math.floor(MAX_TURNS * 0.9); // 22 turns

      let currentTurn = 0;
      let totalToolCalls = 0;
      let fullResponse = "";
      let turnToolCalls = []; // Declare outside loop

      // Token usage accumulation across all turns
      let accumulatedUsage = {
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cachedTokens: 0,
        totalTokens: 0,
      };
      let accumulatedCost = 0;

      while (currentTurn < MAX_TURNS) {
        currentTurn++;
        this.log(
          `[Turn ${currentTurn}/${MAX_TURNS}] Starting... (${totalToolCalls} tools used so far)`
        );

        // Build messages with progressive warnings
        let budgetWarning = "";
        const turnsRemaining = MAX_TURNS - currentTurn;

        if (currentTurn === WARN_AT_50) {
          budgetWarning =
            "\n\n⚠️ BUDGET CHECK: You're halfway through your tool budget. Start being more decisive - focus on the most important information and begin formulating your response.";
        } else if (currentTurn === WARN_AT_75) {
          budgetWarning =
            "\n\n⚠️ BUDGET WARNING: Only 25% of tool calls remaining! You MUST start your response now. Use remaining tools only if absolutely critical.";
        } else if (currentTurn >= WARN_AT_90) {
          budgetWarning = `\n\n🚨 FINAL WARNING: Only ${turnsRemaining} tool call(s) left! You MUST provide your final response NOW with the information you have. Do not call more tools unless completely necessary.`;
        }

        // On the very last turn, force output
        let forceOutputInstruction = "";
        if (currentTurn === MAX_TURNS) {
          forceOutputInstruction =
            "\n\n🛑 TOOL LIMIT REACHED: This is your LAST turn. You MUST respond with your analysis and any code changes NOW. Do NOT call any more tools.";
        }

        const messages = [
          {
            role: "system",
            content: systemPrompt + budgetWarning + forceOutputInstruction,
          },
          ...this.conversationHistory,
        ];

        let turnResponse = "";
        turnToolCalls = []; // Reset for each turn

        const handleToolCall = async (toolName, args, toolCallId) => {
          this.log(`[Tool Call] ${toolName}`, args);
          totalToolCalls++;

          this._view.webview.postMessage({
            type: "toolCall",
            tool: { id: toolCallId, name: toolName, args },
          });

          const result = await this.workspaceTools.executeTool(toolName, args);

          this._view.webview.postMessage({
            type: "toolResult",
            tool: { id: toolCallId, result },
          });

          // Include toolCallId for proper Responses API format
          turnToolCalls.push({ toolName, args, result, toolCallId });
          return result;
        };

        // Chunk buffering for smoother streaming (reduce UI updates)
        const CHUNK_BUFFER_SIZE = 256;
        let chunkBuffer = "";

        const flushBuffer = () => {
          if (chunkBuffer.length > 0) {
            this._view.webview.postMessage({
              type: "assistantChunk",
              chunk: chunkBuffer,
            });
            chunkBuffer = "";
          }
        };

        const streamResult = await this.llmConnector.streamChat(
          messages,
          (chunk) => {
            if (this.abortController?.signal.aborted) {
              throw new Error("Generation aborted");
            }

            turnResponse += chunk;
            fullResponse += chunk;
            chunkBuffer += chunk;

            // Only send to UI when buffer is full
            if (chunkBuffer.length >= CHUNK_BUFFER_SIZE) {
              flushBuffer();
            }
          },
          { tools, onToolCall: handleToolCall, maxTokens: 32000 }
        );

        // Flush any remaining buffer after stream completes
        flushBuffer();

        // Log token usage if available
        if (streamResult?.usage) {
          const providerName =
            this.llmConnector.getCurrentProvider()?.getName()?.toLowerCase() ||
            "unknown";
          const modelName =
            this.llmConnector.getCurrentProvider()?.defaultModel || "unknown";
          const normalizedUsage = this.tokenManager.normalizeUsage(
            streamResult.usage,
            providerName
          );
          const cost = this.tokenManager.calculateCost(
            normalizedUsage,
            providerName,
            modelName
          );
          this.log(
            this.tokenManager.formatUsageLog(
              normalizedUsage,
              cost,
              providerName,
              modelName
            )
          );

          // Accumulate usage across turns
          if (normalizedUsage) {
            accumulatedUsage.inputTokens += normalizedUsage.inputTokens || 0;
            accumulatedUsage.outputTokens += normalizedUsage.outputTokens || 0;
            accumulatedUsage.reasoningTokens +=
              normalizedUsage.reasoningTokens || 0;
            accumulatedUsage.cachedTokens += normalizedUsage.cachedTokens || 0;
            accumulatedUsage.totalTokens += normalizedUsage.totalTokens || 0;
          }
          if (cost?.totalCost) {
            accumulatedCost += cost.totalCost;
          }
        }

        // Check if response was truncated due to token limit
        const wasTruncated = streamResult?.wasTruncated || false;
        if (wasTruncated && turnToolCalls.length === 0) {
          this.log("[Turn truncated] Adding continuation message");

          // Detect if we're in the middle of a code block
          const openCodeBlocks = (turnResponse.match(/```/g) || []).length;
          const isInCodeBlock = openCodeBlocks % 2 !== 0; // Odd count = unclosed block

          // Detect if we're in the middle of a SEARCH/REPLACE block
          const hasUnclosedSearch =
            turnResponse.includes("<<<<<<< SEARCH") &&
            !turnResponse.includes(">>>>>>> REPLACE");

          // Build smarter continuation prompt
          let continuationPrompt = "Continue EXACTLY from where you left off. ";

          if (isInCodeBlock) {
            continuationPrompt +=
              "You were in the middle of a code block - continue the code WITHOUT starting a new ``` block. ";
          }

          if (hasUnclosedSearch) {
            continuationPrompt +=
              "You were in the middle of a SEARCH/REPLACE block - continue without repeating the file path or markers you already output. ";
          }

          continuationPrompt +=
            "Do NOT repeat any content you already generated.";

          // Add what we have so far to history and request continuation
          this.conversationHistory.push({
            role: "assistant",
            content: turnResponse,
          });
          this.conversationHistory.push({
            role: "user",
            content: continuationPrompt,
          });
          turnResponse = "";
          continue; // Continue the while loop for next turn
        }

        // If no tools called, we're done
        if (turnToolCalls.length === 0) {
          this.log("[Turn complete] No tools called");
          break;
        }

        // Check if using Responses API (OpenAI with specific models)
        const isResponsesAPI =
          this.llmConnector?.getCurrentProvider()?.useResponsesAPI;

        if (isResponsesAPI) {
          // Responses API format: function_call + function_call_output
          for (const tc of turnToolCalls) {
            // Add the assistant's function_call
            this.conversationHistory.push({
              type: "function_call",
              call_id: tc.toolCallId,
              name: tc.toolName,
              arguments: JSON.stringify(tc.args),
            });

            // Add our function_call_output
            this.conversationHistory.push({
              type: "function_call_output",
              call_id: tc.toolCallId,
              output: JSON.stringify(tc.result),
            });
          }
        } else {
          // Chat Completions API format (standard messages)
          this.conversationHistory.push({
            role: "assistant",
            content: turnResponse || "Using tools...",
          });

          for (const tc of turnToolCalls) {
            this.conversationHistory.push({
              role: "user",
              content: `Tool result for ${
                tc.toolName
              }:\n\`\`\`json\n${JSON.stringify(
                tc.result,
                null,
                2
              )}\n\`\`\`\n\nContinue.`,
            });
          }
        }
      }

      // Parse code blocks
      const blocks = DiffApplier.parseAiderBlocks(fullResponse);

      // Send complete with token usage
      // Calculate context status for gauge
      const providerName =
        this.llmConnector.getCurrentProvider()?.getName()?.toLowerCase() ||
        "openai";
      const modelName =
        this.llmConnector.getCurrentProvider()?.defaultModel || "gpt-4o";
      const contextStatus = this.tokenManager.getContextStatus(
        accumulatedUsage.inputTokens + accumulatedUsage.outputTokens,
        providerName,
        modelName
      );

      this._view.webview.postMessage({
        type: "assistantComplete",
        message: fullResponse,
        blocks,
        usage:
          accumulatedUsage.totalTokens > 0
            ? {
                inputTokens: accumulatedUsage.inputTokens,
                outputTokens: accumulatedUsage.outputTokens,
                reasoningTokens: accumulatedUsage.reasoningTokens,
                cachedTokens: accumulatedUsage.cachedTokens,
                totalTokens: accumulatedUsage.totalTokens,
                cost: accumulatedCost,
                provider: providerName,
                model: modelName,
              }
            : null,
        contextStatus: {
          usedPercentage: contextStatus.usedPercentage,
          currentTokens: contextStatus.currentTokens,
          maxTokens: contextStatus.maxTokens,
          remainingTokens: contextStatus.remainingTokens,
          status: contextStatus.status,
          needsSliding: contextStatus.needsSliding,
          needsSummarization: contextStatus.needsSummarization,
        },
      });

      if (turnToolCalls.length === 0) {
        this.conversationHistory.push({
          role: "assistant",
          content: fullResponse,
        });
      }

      // Persist assistant message to storage and trigger title generation
      if (this.storage && this.currentConversationId) {
        try {
          const workspaceId = this.getWorkspaceId();
          await this.storage.addMessage(
            workspaceId,
            this.currentConversationId,
            {
              role: "assistant",
              content: fullResponse,
              provider: this.llmConnector.getCurrentProvider()?.name || null,
              model: this.llmConnector.getCurrentProvider()?.model || null,
              toolCalls: turnToolCalls.length > 0 ? turnToolCalls : null,
              codeBlocks: blocks && blocks.length > 0 ? blocks : null,
              usage:
                accumulatedUsage.totalTokens > 0
                  ? {
                      inputTokens: accumulatedUsage.inputTokens,
                      outputTokens: accumulatedUsage.outputTokens,
                      reasoningTokens: accumulatedUsage.reasoningTokens,
                      cachedTokens: accumulatedUsage.cachedTokens,
                      totalTokens: accumulatedUsage.totalTokens,
                      cost: accumulatedCost,
                      provider:
                        this.llmConnector
                          .getCurrentProvider()
                          ?.getName()
                          ?.toLowerCase() || null,
                      model:
                        this.llmConnector.getCurrentProvider()?.defaultModel ||
                        null,
                    }
                  : null,
            }
          );

          // Update conversation with cumulative token count for persistence
          const providerName =
            this.llmConnector.getCurrentProvider()?.getName()?.toLowerCase() ||
            "openai";
          const modelName =
            this.llmConnector.getCurrentProvider()?.defaultModel || "gpt-4o";
          const contextStatus = this.tokenManager.getContextStatus(
            this.tokenManager.getCumulativeTokens(),
            providerName,
            modelName
          );
          await this.storage.updateConversation(
            workspaceId,
            this.currentConversationId,
            {
              cumulativeTokens: contextStatus.currentTokens,
              contextMaxTokens: contextStatus.maxTokens,
            }
          );

          // Trigger title generation (async, don't await)
          this.maybeGenerateTitle(this.currentConversationId);
        } catch (err) {
          this.log("Error persisting assistant message:", err);
        }
      }
    } catch (error) {
      this.log("[Error]", error);
      if (error.message !== "Generation aborted") {
        this._view.webview.postMessage({
          type: "error",
          error: error.message,
        });
      }
    } finally {
      this._view.webview.postMessage({
        type: "thinking",
        thinking: false,
      });
      this.abortController = null;
    }
  }

  /**
   * Apply code block
   */
  async applyCodeBlock(block) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage("No workspace open");
      return;
    }

    const result = await DiffApplier.applyBlock(
      block,
      workspaceFolders[0].uri.fsPath
    );

    if (result.success) {
      vscode.window.showInformationMessage(result.message);
    } else {
      vscode.window.showErrorMessage(result.error);
    }
  }

  /**
   * Handle creating a new file
   */
  async handleCreateNewFile(filePath, content, block) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage("No workspace open");
      return;
    }

    try {
      const fullPath = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);

      // Check if file already exists
      try {
        await vscode.workspace.fs.stat(fullPath);
        const answer = await vscode.window.showWarningMessage(
          `File "${filePath}" already exists. Overwrite?`,
          "Yes",
          "No"
        );
        if (answer !== "Yes") return;
      } catch {
        // File doesn't exist, good to create
      }

      // Write the new file
      const encoder = new TextEncoder();
      await vscode.workspace.fs.writeFile(fullPath, encoder.encode(content));

      vscode.window.showInformationMessage(`Created: ${filePath}`);

      // Open the file
      const doc = await vscode.workspace.openTextDocument(fullPath);
      await vscode.window.showTextDocument(doc);

      // Send blockApplied message to webview
      if (this._view && block) {
        const contentHash = (block.content || "").slice(0, 50);
        const blockKey = `${block.filePath}:${block.type}:${contentHash}`;
        this._view.webview.postMessage({
          type: "blockApplied",
          blockKey,
        });
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create file: ${error.message}`);
    }
  }

  /**
   * Handle rewriting an entire file
   */
  async handleRewriteFile(filePath, content, block) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage("No workspace open");
      return;
    }

    try {
      const fullPath = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);

      // Check if file exists for rewrite
      try {
        await vscode.workspace.fs.stat(fullPath);
      } catch {
        vscode.window.showErrorMessage(
          `File "${filePath}" doesn't exist. Use "New File" instead.`
        );
        return;
      }

      // Show diff preview for rewrite
      const doc = await vscode.workspace.openTextDocument(fullPath);
      const originalContent = doc.getText();

      // Create a virtual document with new content
      const modifiedUri = fullPath.with({
        scheme: "tinker-diff",
        query: `t=${Date.now()}`,
      });

      this._diffProvider.update(modifiedUri, content);

      // Store block for later application
      this._pendingBlock = { ...block, content };
      this._pendingRewritePath = fullPath;

      // Show diff
      await vscode.commands.executeCommand(
        "vscode.diff",
        fullPath,
        modifiedUri,
        `📝 Rewrite: ${filePath}`
      );

      // Ask for confirmation
      const action = await vscode.window.showQuickPick(
        [
          {
            label: "$(check) Accept Rewrite",
            description: "Replace entire file",
            action: "accept",
          },
          {
            label: "$(x) Reject",
            description: "Keep original file",
            action: "reject",
          },
        ],
        { placeHolder: "Apply file rewrite?" }
      );

      if (action?.action === "accept") {
        // Write the new content
        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(fullPath, encoder.encode(content));

        vscode.window.showInformationMessage(`Rewrote: ${filePath}`);

        // Close diff editors
        await vscode.commands.executeCommand(
          "workbench.action.closeActiveEditor"
        );

        // Open the updated file
        const updatedDoc = await vscode.workspace.openTextDocument(fullPath);
        await vscode.window.showTextDocument(updatedDoc);

        // Send blockApplied message to webview
        if (this._view && block) {
          const contentHash = (block.content || "").slice(0, 50);
          const blockKey = `${block.filePath}:${block.type}:${contentHash}`;
          this._view.webview.postMessage({
            type: "blockApplied",
            blockKey,
          });
        }
      } else {
        // Rejected - close diff editor
        await vscode.commands.executeCommand(
          "workbench.action.closeActiveEditor"
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to rewrite file: ${error.message}`
      );
    }
  }

  /**
   * Preview diff with interactive actions
   */
  async previewDiff(filePath, original, modified, block) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    const fullPath = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);

    try {
      const doc = await vscode.workspace.openTextDocument(fullPath);
      let modifiedContent = doc.getText();

      if (original && modified) {
        modifiedContent = modifiedContent.replace(original, modified);
      }

      const modifiedUri = fullPath.with({
        scheme: "tinker-diff",
        query: `t=${Date.now()}`,
      });

      this._diffProvider.update(modifiedUri, modifiedContent);

      // Store block for later application
      if (block) {
        this._pendingBlock = block;
        this._pendingDiffEditor = null;
      }

      // Open diff editor and store reference
      await vscode.commands.executeCommand(
        "vscode.diff",
        fullPath,
        modifiedUri,
        `📝 Review: ${filePath}`
      );

      // Show status bar message with action buttons
      const acceptAction = await vscode.window.setStatusBarMessage(
        `$(check) Accept Change    $(x) Reject Change    $(check-all) Accept All`,
        10000
      );

      // Show quick pick as floating action menu
      const action = await vscode.window.showQuickPick(
        [
          {
            label: "$(check) Accept",
            description: "Apply this change",
            action: "accept",
          },
          {
            label: "$(x) Reject",
            description: "Discard this change",
            action: "reject",
          },
          {
            label: "$(check-all) Accept All",
            description: "Accept all changes",
            action: "acceptAll",
          },
        ],
        {
          placeHolder: "Review changes and choose an action",
          title: `Changes to ${filePath}`,
        }
      );

      if (action) {
        if (action.action === "accept" || action.action === "acceptAll") {
          await this.acceptPendingChange(action.action === "acceptAll");
        } else if (action.action === "reject") {
          await this.rejectPendingChange();
        }
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Preview failed: ${error.message}`);
    }
  }

  /**
   * Accept pending change
   */
  async acceptPendingChange(acceptAll = false) {
    if (this._pendingBlock) {
      const blockToApply = this._pendingBlock;
      await this.applyCodeBlock(blockToApply);
      this._pendingBlock = null;

      // Close diff editor
      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor"
      );

      // Notify webview that block was applied
      // Use content hash for unique identification (matches frontend CodeBlock.jsx)
      if (this._view) {
        const contentHash = (
          blockToApply.search ||
          blockToApply.content ||
          ""
        ).slice(0, 50);
        this._view.webview.postMessage({
          type: "blockApplied",
          filePath: blockToApply.filePath,
          blockType: blockToApply.type,
          contentHash: contentHash,
        });
      }

      vscode.window.showInformationMessage(
        `✓ Changes ${acceptAll ? "accepted" : "applied"} successfully`
      );
    }
  }

  /**
   * Reject pending change
   */
  async rejectPendingChange() {
    this._pendingBlock = null;

    // Close diff editor
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");

    vscode.window.showInformationMessage("Changes rejected");
  }

  /**
   * Save settings
   */
  async saveSettings(settings) {
    const config = vscode.workspace.getConfiguration("tinkerAssistant");

    await config.update(
      "provider",
      settings.provider,
      vscode.ConfigurationTarget.Global
    );

    // Only update model if explicitly provided (don't overwrite with undefined)
    if (settings.model !== undefined) {
      await config.update(
        "model",
        settings.model,
        vscode.ConfigurationTarget.Global
      );
    }

    await config.update(
      "useResponsesAPI",
      settings.useResponsesAPI || false,
      vscode.ConfigurationTarget.Global
    );

    // For Azure, get the endpoint from settings or load from stored config
    let baseURL = settings.baseURL;
    if (settings.provider === "azure") {
      if (baseURL) {
        // Save new endpoint if provided
        await config.update(
          "azureEndpoint",
          baseURL,
          vscode.ConfigurationTarget.Global
        );
      } else {
        // Load stored endpoint if not provided (e.g., when just switching models)
        baseURL = config.get("azureEndpoint", "");
      }
    }

    // For Bedrock, handle AWS credentials
    let awsAccessKey = settings.awsAccessKey;
    let awsSecretKey = settings.awsSecretKey;
    let awsRegion = settings.awsRegion;
    if (settings.provider === "bedrock") {
      if (awsAccessKey && awsSecretKey) {
        // Store AWS credentials securely
        await config.update(
          "awsRegion",
          awsRegion || "us-east-1",
          vscode.ConfigurationTarget.Global
        );
        // Store AWS keys using helper method (with fallback)
        await this.setSecret("bedrock_awsAccessKey", awsAccessKey);
        await this.setSecret("bedrock_awsSecretKey", awsSecretKey);
      } else {
        // Load stored credentials if not provided
        awsRegion = config.get("awsRegion", "us-east-1");
        awsAccessKey = await this.getSecret("bedrock_awsAccessKey");
        awsSecretKey = await this.getSecret("bedrock_awsSecretKey");
      }
    }

    // Get existing API key if user didn't provide a new one
    let apiKeyToUse = settings.apiKey;
    if (!apiKeyToUse) {
      apiKeyToUse = await this.getSecret(`${settings.provider}_apiKey`);
    }

    // Handle API key storage based on rememberApiKey setting
    // Only modify stored keys if rememberApiKey is explicitly set
    if (settings.rememberApiKey !== undefined) {
      if (settings.rememberApiKey) {
        // Store API key if user wants to remember it
        if (settings.apiKey) {
          await this.setSecret(`${settings.provider}_apiKey`, settings.apiKey);
          vscode.window.showInformationMessage("API key saved securely");
        }
      } else {
        // Delete stored API key if user explicitly unchecked rememberApiKey
        await this.deleteSecret(`${settings.provider}_apiKey`);
        vscode.window.showInformationMessage("API key will not be saved");
      }
    }

    // Get the model to use - either from settings or from stored config
    let modelToUse = settings.model;
    if (modelToUse === undefined) {
      modelToUse = config.get("model", "");
    }

    // Initialize provider
    try {
      this.llmConnector.initProvider(settings.provider, {
        apiKey: apiKeyToUse,
        model: modelToUse,
        baseURL: baseURL,
        useResponsesAPI: settings.useResponsesAPI,
        // Bedrock-specific
        awsAccessKey: awsAccessKey,
        awsSecretKey: awsSecretKey,
        awsRegion: awsRegion,
      });

      this.log(
        `Provider ${settings.provider} initialized with model: ${modelToUse}`
      );
      vscode.window.showInformationMessage(`${settings.provider} configured`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to initialize: ${error.message}`);
    }
  }

  /**
   * Load settings
   */
  async loadSettings() {
    const config = vscode.workspace.getConfiguration("tinkerAssistant");
    const provider = config.get("provider", "openai");
    const model = config.get("model", "");
    const baseURL = config.get("azureEndpoint", "");
    const useResponsesAPI = config.get("useResponsesAPI", false);
    const awsRegion = config.get("awsRegion", "us-east-1");

    let apiKey = "";
    let awsAccessKey = "";
    let awsSecretKey = "";

    // Use helper method that falls back to globalState for VS Code forks
    apiKey = (await this.getSecret(`${provider}_apiKey`)) || "";
    // Load Bedrock credentials if that's the selected provider
    if (provider === "bedrock") {
      awsAccessKey = (await this.getSecret("bedrock_awsAccessKey")) || "";
      awsSecretKey = (await this.getSecret("bedrock_awsSecretKey")) || "";
    }

    this._view?.webview.postMessage({
      type: "settingsLoaded",
      settings: {
        provider,
        model,
        baseURL,
        useResponsesAPI,
        hasApiKey: !!apiKey,
        hasBedrockCredentials: !!(awsAccessKey && awsSecretKey),
      },
    });

    // Initialize provider based on type
    if (provider === "bedrock") {
      // Bedrock uses AWS credentials, not API key
      if (awsAccessKey && awsSecretKey) {
        try {
          this.llmConnector.initProvider(provider, {
            model,
            awsAccessKey,
            awsSecretKey,
            awsRegion,
          });
          this.log(
            `Provider ${provider} initialized on load with AWS credentials`
          );
        } catch (error) {
          this.log("Failed to init Bedrock provider:", error);
        }
      } else {
        this.log(
          "No AWS credentials found for Bedrock, provider not initialized"
        );
      }
    } else if (apiKey) {
      // Other providers use API key
      try {
        this.llmConnector.initProvider(provider, {
          apiKey,
          model,
          baseURL,
          useResponsesAPI,
        });
        this.log(`Provider ${provider} initialized on load`);
      } catch (error) {
        this.log("Failed to init provider:", error);
      }
    } else {
      this.log(`No API key found for ${provider}, provider not initialized`);
    }
  }

  /**
   * Save custom models per provider
   */
  async saveCustomModels(models) {
    const config = vscode.workspace.getConfiguration("tinkerAssistant");
    await config.update(
      "customModels",
      models,
      vscode.ConfigurationTarget.Global
    );

    this._view?.webview.postMessage({
      type: "customModelsSaved",
      models,
    });
  }

  /**
   * Load custom models per provider
   */
  async loadCustomModels() {
    const config = vscode.workspace.getConfiguration("tinkerAssistant");
    const defaultModels = {
      openai: ["gpt-4o", "gpt-4", "o1"],
      anthropic: ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022"],
      gemini: ["gemini-2.0-flash-exp", "gemini-1.5-pro"],
      azure: ["gpt-4", "gpt-35-turbo"],
    };
    const models = config.get("customModels", defaultModels);

    this._view?.webview.postMessage({
      type: "customModelsLoaded",
      models,
    });

    // Also load Bedrock models separately
    await this.loadBedrockModels();
  }

  /**
   * Save Bedrock models (with display name → model ID mapping)
   */
  async saveBedrockModels(models) {
    const config = vscode.workspace.getConfiguration("tinkerAssistant");
    await config.update(
      "bedrockModels",
      models,
      vscode.ConfigurationTarget.Global
    );

    this._view?.webview.postMessage({
      type: "bedrockModelsSaved",
      models,
    });

    // Also send to config panel if open
    this._configPanel?.webview.postMessage({
      type: "bedrockModelsSaved",
      models,
    });
  }

  /**
   * Load Bedrock models (with display name → model ID mapping)
   */
  async loadBedrockModels() {
    const config = vscode.workspace.getConfiguration("tinkerAssistant");
    const defaultModels = [
      {
        displayName: "Claude Sonnet 4",
        modelId: "anthropic.claude-sonnet-4-20250514-v1:0",
      },
      {
        displayName: "Claude 3.5 Sonnet",
        modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
      },
    ];
    const models = config.get("bedrockModels", defaultModels);

    this._view?.webview.postMessage({
      type: "bedrockModelsLoaded",
      models,
    });

    // Also send to config panel if open
    this._configPanel?.webview.postMessage({
      type: "bedrockModelsLoaded",
      models,
    });
  }

  /**
   * Save API key for a specific provider
   */
  async saveProviderApiKey(provider, apiKey) {
    if (apiKey) {
      await this.setSecret(`${provider}_apiKey`, apiKey);
      vscode.window.showInformationMessage(`${provider} API key saved`);
    } else {
      await this.deleteSecret(`${provider}_apiKey`);
    }

    // Send back status of all provider keys
    await this.loadAllProviderKeys();
  }

  /**
   * Load status of all provider API keys (just whether they exist, not the actual keys)
   */
  async loadAllProviderKeys() {
    const providers = ["openai", "anthropic", "gemini", "azure", "bedrock"];
    const keyStatus = {};

    for (const provider of providers) {
      if (provider === "bedrock") {
        // Bedrock uses AWS credentials, not API key
        const awsAccessKey = await this.getSecret("bedrock_awsAccessKey");
        const awsSecretKey = await this.getSecret("bedrock_awsSecretKey");
        keyStatus[provider] = !!(awsAccessKey && awsSecretKey);
      } else {
        const key = await this.getSecret(`${provider}_apiKey`);
        keyStatus[provider] = !!key;
      }
    }

    this._view?.webview.postMessage({
      type: "providerKeysLoaded",
      keyStatus,
    });

    // Also send to config panel if open
    this._configPanel?.webview.postMessage({
      type: "providerKeysLoaded",
      keyStatus,
    });
  }

  // ==================== CONVERSATION MANAGEMENT ====================

  /**
   * Get current workspace identifier
   */
  getWorkspaceId() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      return workspaceFolders[0].uri.fsPath;
    }
    return "default";
  }

  /**
   * Handle loading conversations list
   */
  async handleLoadConversations() {
    if (!this._view || !this.storage) return;

    try {
      const workspaceId = this.getWorkspaceId();
      const { conversations } = await this.storage.getConversations(
        workspaceId,
        0,
        50
      );

      // Get or create default conversation if none exist
      if (conversations.length === 0) {
        const newConv = await this.storage.createConversation(workspaceId);
        this.currentConversationId = newConv.id;
        conversations.push(newConv);
      } else if (!this.currentConversationId) {
        // Set current to most recent
        this.currentConversationId = conversations[0].id;
      }

      this._view.webview.postMessage({
        type: "conversationsLoaded",
        conversations,
        currentConversationId: this.currentConversationId,
      });

      // Load messages for current conversation
      if (this.currentConversationId) {
        await this.loadConversationMessages(this.currentConversationId);
      }
    } catch (error) {
      this.log("Error loading conversations:", error);
    }
  }

  /**
   * Handle switching to a different conversation
   */
  async handleSwitchConversation(conversationId) {
    if (!this._view || !conversationId || !this.storage) return;

    try {
      this.currentConversationId = conversationId;

      // Clear in-memory history
      this.conversationHistory = [];

      // Load messages for this conversation
      await this.loadConversationMessages(conversationId);

      // Notify frontend of switch
      this._view.webview.postMessage({
        type: "conversationSwitched",
        conversationId,
      });
    } catch (error) {
      this.log("Error switching conversation:", error);
    }
  }

  /**
   * Load messages for a conversation (with pagination)
   */
  async loadConversationMessages(conversationId, beforeIndex = null) {
    if (!this._view || !this.storage) return;

    try {
      const workspaceId = this.getWorkspaceId();
      const result = await this.storage.getMessages(
        workspaceId,
        conversationId,
        {
          pageSize: 50,
          beforeIndex,
        }
      );

      if (!result) return;

      const { messages, hasMoreBefore, hasMoreAfter } = result;

      // Rebuild conversation history for LLM context on full load
      if (!beforeIndex) {
        const allMessages = await this.storage.getAllMessages(
          workspaceId,
          conversationId
        );
        this.conversationHistory = allMessages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));
      }

      // Get conversation details
      const conversation = await this.storage.getById(
        workspaceId,
        conversationId
      );

      this._view.webview.postMessage({
        type: "messagesLoaded",
        messages,
        hasMore: hasMoreBefore,
        isAppend: !!beforeIndex,
        conversation,
      });

      // Send persisted context status if available (for context gauge)
      if (conversation?.cumulativeTokens && !beforeIndex) {
        // Restore token manager state with persisted tokens
        this.tokenManager.setCumulativeTokens(conversation.cumulativeTokens);

        const maxTokens =
          conversation.contextMaxTokens ||
          this.tokenManager.getContextInfo(
            this.llmConnector.getCurrentProvider()?.getName()?.toLowerCase() ||
              "openai",
            this.llmConnector.getCurrentProvider()?.defaultModel || "gpt-4o"
          ).maxTokens;

        const usedPercentage =
          (conversation.cumulativeTokens / maxTokens) * 100;

        this._view.webview.postMessage({
          type: "contextStatus",
          contextStatus: {
            usedPercentage,
            currentTokens: conversation.cumulativeTokens,
            maxTokens,
            remainingTokens: maxTokens - conversation.cumulativeTokens,
            status:
              usedPercentage >= 85
                ? "critical"
                : usedPercentage >= 70
                ? "warning"
                : usedPercentage >= 50
                ? "moderate"
                : "normal",
            needsSliding: usedPercentage >= 70,
            needsSummarization: usedPercentage >= 75,
          },
        });
      }
    } catch (error) {
      this.log("Error loading messages:", error);
    }
  }

  /**
   * Handle creating a new conversation
   */
  async handleCreateConversation() {
    if (!this._view || !this.storage) return;

    try {
      const workspaceId = this.getWorkspaceId();
      const conversation = await this.storage.createConversation(workspaceId);

      this.currentConversationId = conversation.id;
      this.conversationHistory = [];

      this._view.webview.postMessage({
        type: "conversationCreated",
        conversation,
      });

      // Clear messages in UI
      this._view.webview.postMessage({
        type: "messagesLoaded",
        messages: [],
        hasMore: false,
        isAppend: false,
        conversation,
      });
    } catch (error) {
      this.log("Error creating conversation:", error);
    }
  }

  /**
   * Handle deleting a conversation
   */
  async handleDeleteConversation(conversationId) {
    if (!this._view || !conversationId || !this.storage) return;

    try {
      const workspaceId = this.getWorkspaceId();
      await this.storage.deleteConversation(workspaceId, conversationId);

      // If deleting current, switch to another
      if (this.currentConversationId === conversationId) {
        const { conversations } = await this.storage.getConversations(
          workspaceId,
          0,
          1
        );

        if (conversations.length > 0) {
          await this.handleSwitchConversation(conversations[0].id);
        } else {
          // Create new if none left
          await this.handleCreateConversation();
        }
      }

      // Reload conversation list
      await this.handleLoadConversations();
    } catch (error) {
      this.log("Error deleting conversation:", error);
    }
  }

  /**
   * Handle toggling pin status
   */
  async handleTogglePin(conversationId) {
    if (!this._view || !conversationId || !this.storage) return;

    try {
      const workspaceId = this.getWorkspaceId();
      const newPinned = await this.storage.togglePin(
        workspaceId,
        conversationId
      );

      this._view.webview.postMessage({
        type: "conversationPinToggled",
        conversationId,
        isPinned: newPinned,
      });

      // Reload list to reorder
      await this.handleLoadConversations();
    } catch (error) {
      this.log("Error toggling pin:", error);
    }
  }

  /**
   * Handle loading more (older) messages
   */
  async handleLoadMoreMessages(beforeIndex) {
    if (!this._view || !this.currentConversationId || beforeIndex === null)
      return;

    try {
      await this.loadConversationMessages(
        this.currentConversationId,
        beforeIndex
      );
    } catch (error) {
      this.log("Error loading more messages:", error);
    }
  }

  /**
   * Trigger title generation for a conversation (called after first exchange)
   */
  async maybeGenerateTitle(conversationId) {
    if (!this.storage) {
      this.log("[TitleGen] No storage available");
      return;
    }

    try {
      const workspaceId = this.getWorkspaceId();
      this.log("[TitleGen] Checking title for conversation:", conversationId);

      // Only generate if still default title
      const conversation = await this.storage.getById(
        workspaceId,
        conversationId
      );
      if (!conversation) {
        this.log("[TitleGen] Conversation not found");
        return;
      }
      if (conversation.title !== "New Chat") {
        this.log("[TitleGen] Title already set:", conversation.title);
        return;
      }

      // Check if we have enough messages
      const messageCount = await this.storage.getMessageCount(
        workspaceId,
        conversationId
      );
      this.log("[TitleGen] Message count:", messageCount);
      if (messageCount < 2) {
        this.log("[TitleGen] Not enough messages");
        return; // Need at least 1 user + 1 assistant message
      }

      // Check if LLM is available
      if (!this.titleGenerator.isAvailable()) {
        this.log("[TitleGen] LLM not available");
        return;
      }

      // Get first few messages for context
      const messages = await this.storage.getMessagesForTitleGeneration(
        workspaceId,
        conversationId,
        3
      );
      this.log("[TitleGen] Got messages for title:", messages?.length);

      // Generate title (async, don't block)
      this.log("[TitleGen] Calling generateTitle...");
      const title = await this.titleGenerator.generateTitle(messages);
      this.log("[TitleGen] Generated title:", title);

      if (title && title !== "New Chat") {
        await this.storage.updateTitle(workspaceId, conversationId, title);

        // Notify frontend
        this._view?.webview.postMessage({
          type: "conversationTitleUpdated",
          conversationId,
          title,
        });
        this.log("[TitleGen] Title updated successfully");
      }
    } catch (error) {
      this.log("[TitleGen] Error generating title:", error);
    }
  }

  /**
   * Open configuration panel in editor area
   */
  openConfigPanel() {
    const column = vscode.ViewColumn.One;

    // If panel already exists, show it
    if (this._configPanel) {
      this._configPanel.reveal(column);
      return;
    }

    // Create new panel
    this._configPanel = vscode.window.createWebviewPanel(
      "tinkerConfig",
      "Tinker Configuration",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this._extensionUri, "webview-ui", "dist"),
          vscode.Uri.joinPath(this._extensionUri, "media"),
        ],
      }
    );

    // Set panel icon
    this._configPanel.iconPath = vscode.Uri.joinPath(
      this._extensionUri,
      "media",
      "tinker-logo-v2.svg"
    );

    this._configPanel.webview.html = this._getConfigPanelHtml(
      this._configPanel.webview
    );

    // Handle messages from config panel
    this._configPanel.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "saveCustomModels":
          await this.saveCustomModels(data.models);
          // Broadcast to sidebar
          this._view?.webview.postMessage({
            type: "customModelsLoaded",
            models: data.models,
          });
          break;
        case "loadCustomModels":
          await this.loadCustomModelsToPanel();
          break;
        case "saveBedrockModels":
          await this.saveBedrockModels(data.models);
          break;
        case "loadBedrockModels":
          await this.loadBedrockModels();
          break;
        case "saveProviderApiKey":
          await this.saveProviderApiKey(data.provider, data.apiKey);
          break;
        case "loadAllProviderKeys":
          await this.loadAllProviderKeysToPanel();
          break;
        case "loadSettings":
          await this.loadSettingsToPanel();
          break;
        case "saveSettings":
          await this.saveSettings(data.settings);
          break;
      }
    });

    // Clean up on close
    this._configPanel.onDidDispose(() => {
      this._configPanel = null;
    });
  }

  /**
   * Load custom models to config panel
   */
  async loadCustomModelsToPanel() {
    const config = vscode.workspace.getConfiguration("tinkerAssistant");
    const defaultModels = {
      openai: ["gpt-4o", "gpt-4", "o1"],
      anthropic: ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022"],
      gemini: ["gemini-2.0-flash-exp", "gemini-1.5-pro"],
      azure: ["gpt-4", "gpt-35-turbo"],
    };
    const models = config.get("customModels", defaultModels);

    this._configPanel?.webview.postMessage({
      type: "customModelsLoaded",
      models,
    });
  }

  /**
   * Load provider keys status to config panel
   */
  async loadAllProviderKeysToPanel() {
    const providers = ["openai", "anthropic", "gemini", "azure", "bedrock"];
    const keyStatus = {};

    for (const provider of providers) {
      if (provider === "bedrock") {
        // Bedrock uses AWS credentials, not API key
        const awsAccessKey = await this.getSecret("bedrock_awsAccessKey");
        const awsSecretKey = await this.getSecret("bedrock_awsSecretKey");
        keyStatus[provider] = !!(awsAccessKey && awsSecretKey);
      } else {
        const key = await this.getSecret(`${provider}_apiKey`);
        keyStatus[provider] = !!key;
      }
    }

    this._configPanel?.webview.postMessage({
      type: "providerKeysLoaded",
      keyStatus,
    });
  }

  /**
   * Load settings to config panel
   */
  async loadSettingsToPanel() {
    const config = vscode.workspace.getConfiguration("tinkerAssistant");
    const provider = config.get("provider", "openai");
    const model = config.get("model", "");
    const baseURL = config.get("azureEndpoint", "");
    const useResponsesAPI = config.get("useResponsesAPI", false);

    this._configPanel?.webview.postMessage({
      type: "settingsLoaded",
      settings: {
        provider,
        model,
        baseURL,
        useResponsesAPI,
      },
    });
  }

  /**
   * Get HTML for config panel webview
   */
  _getConfigPanelHtml(webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "webview-ui",
        "dist",
        "config-panel.js"
      )
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "webview-ui",
        "dist",
        "output.css"
      )
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tinker Configuration</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * Get HTML for webview
   */
  _getHtmlForWebview(webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "webview-ui",
        "dist",
        "sidebar.js"
      )
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "webview-ui",
        "dist",
        "output.css"
      )
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tinker Agent</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}

module.exports = ChatViewProvider;
