/**
 * ConversationStore - VS Code globalState-based storage for conversations
 *
 * Data Structure:
 * - Conversations: stored with messages, metadata, pagination state
 * - Tool calls: stored separately keyed by message ID
 * - Per-message model/provider tracking
 *
 * Storage Keys:
 * - tinker_conversations_{workspaceId}: Array of conversations
 * - tinker_toolcalls_{conversationId}_{messageId}: Tool calls for a message
 */

class ConversationStore {
  constructor(context) {
    this.context = context;
    this.DEFAULT_MESSAGE_PAGE_SIZE = 50;
    this.MAX_CONVERSATIONS = 100;

    const os = require("os");
    const path = require("path");
    const fs = require("fs");
    this._usageFilePath = path.join(os.homedir(), ".tinker", "usage.json");
    this._ensureTinkerDir();
  }

  /**
   * Ensure ~/.tinker directory exists
   */
  _ensureTinkerDir() {
    const path = require("path");
    const fs = require("fs");
    const tinkerDir = path.dirname(this._usageFilePath);
    if (!fs.existsSync(tinkerDir)) {
      try {
        fs.mkdirSync(tinkerDir, { recursive: true });
      } catch (err) {
        console.error(
          `[ConversationStore] Failed to create .tinker dir: ${err.message}`
        );
      }
    }
  }

  /**
   * Get storage key for workspace conversations
   */
  getConversationsKey(workspaceId) {
    // Sanitize workspace ID for storage key
    const sanitized = workspaceId.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50);
    return `tinker_conversations_${sanitized}`;
  }

  /**
   * Get storage key for tool calls
   */
  getToolCallsKey(conversationId, messageId) {
    return `tinker_toolcalls_${conversationId}_${messageId}`;
  }

  /**
   * Get storage key for conversation stats
   */
  getConversationStatsKey(conversationId) {
    return `tinker_conv_stats_${conversationId}`;
  }

  /**
   * Get storage key for workspace stats
   */
  getWorkspaceStatsKey(workspaceId) {
    const sanitized = workspaceId.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50);
    return `tinker_workspace_stats_${sanitized}`;
  }

  /**
   * Get storage key for global stats
   */
  getGlobalStatsKey() {
    return `tinker_global_stats`;
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  // ==================== CONVERSATION OPERATIONS ====================

  /**
   * Get all conversations for a workspace
   */
  async getAll(workspaceId) {
    const key = this.getConversationsKey(workspaceId);
    return this.context.globalState.get(key, []);
  }

  /**
   * Get conversations with pagination (newest first)
   */
  async getConversations(workspaceId, page = 0, pageSize = 20) {
    const all = await this.getAll(workspaceId);

    // Sort by updatedAt descending, pinned first
    const sorted = [...all].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return b.isPinned ? 1 : -1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    const start = page * pageSize;
    const end = start + pageSize;

    return {
      conversations: sorted.slice(start, end),
      total: all.length,
      hasMore: end < all.length,
      page,
      pageSize,
    };
  }

  /**
   * Get a single conversation by ID
   */
  async getById(workspaceId, conversationId) {
    const all = await this.getAll(workspaceId);
    return all.find((c) => c.id === conversationId) || null;
  }

  /**
   * Create a new conversation
   */
  async createConversation(workspaceId, initialData = {}) {
    const all = await this.getAll(workspaceId);
    const now = new Date().toISOString();

    const newConversation = {
      id: this.generateId(),
      workspaceId,
      title: initialData.title || "New Chat",
      isPinned: false,
      messages: [],
      messageCount: 0,
      displayFromIndex: 0,
      appliedBlocks: [], // Track which code blocks have been applied
      createdAt: now,
      updatedAt: now,
      ...initialData,
    };

    all.push(newConversation);

    // Keep only last N conversations
    while (all.length > this.MAX_CONVERSATIONS) {
      // Remove oldest non-pinned
      const unpinnedIndex = all.findIndex((c) => !c.isPinned);
      if (unpinnedIndex >= 0) {
        all.splice(unpinnedIndex, 1);
      } else {
        all.shift();
      }
    }

    const key = this.getConversationsKey(workspaceId);
    await this.context.globalState.update(key, all);

    return newConversation;
  }

  /**
   * Update conversation metadata (title, isPinned, etc)
   */
  async updateConversation(workspaceId, conversationId, updates) {
    const all = await this.getAll(workspaceId);
    const index = all.findIndex((c) => c.id === conversationId);

    if (index === -1) return null;

    all[index] = {
      ...all[index],
      ...updates,
      id: all[index].id, // Preserve ID
      createdAt: all[index].createdAt, // Preserve creation
      updatedAt: new Date().toISOString(),
    };

    const key = this.getConversationsKey(workspaceId);
    await this.context.globalState.update(key, all);

    return all[index];
  }

  /**
   * Toggle pin status
   */
  async togglePin(workspaceId, conversationId) {
    const conversation = await this.getById(workspaceId, conversationId);
    if (!conversation) return null;

    const updated = await this.updateConversation(workspaceId, conversationId, {
      isPinned: !conversation.isPinned,
    });

    return updated?.isPinned;
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(workspaceId, conversationId) {
    const all = await this.getAll(workspaceId);
    const conversation = all.find((c) => c.id === conversationId);

    if (!conversation) return false;

    // Delete associated tool calls
    for (const msg of conversation.messages || []) {
      if (msg.hasToolCalls) {
        const toolKey = this.getToolCallsKey(conversationId, msg.id);
        await this.context.globalState.update(toolKey, undefined);
      }
    }

    const filtered = all.filter((c) => c.id !== conversationId);
    const key = this.getConversationsKey(workspaceId);
    await this.context.globalState.update(key, filtered);

    return true;
  }

  /**
   * Get or create default conversation for workspace
   */
  async getOrCreateDefault(workspaceId) {
    const { conversations } = await this.getConversations(workspaceId, 0, 1);

    if (conversations.length > 0) {
      return conversations[0];
    }

    return this.createConversation(workspaceId);
  }

  // ==================== MESSAGE OPERATIONS ====================

  /**
   * Add a message to a conversation
   * @param {string} workspaceId - Workspace ID
   * @param {string} conversationId - Conversation ID
   * @param {Object} message - Message object
   * @param {string} message.role - 'user' or 'assistant'
   * @param {string|Array} message.content - Message content
   * @param {string} [message.provider] - LLM provider used
   * @param {string} [message.model] - Model used
   * @param {Array} [message.toolCalls] - Optional tool calls
   * @param {Array} [message.codeBlocks] - Optional code blocks
   * @param {Array} [message.contextChips] - Optional context chips
   * @param {Object} [message.usage] - Optional usage data
   * @param {Object} [message.metadata] - Additional metadata
   */
  async addMessage(workspaceId, conversationId, message) {
    const all = await this.getAll(workspaceId);
    const index = all.findIndex((c) => c.id === conversationId);

    if (index === -1) return null;

    const messageId = this.generateId();
    const now = new Date().toISOString();

    // Extract tool calls to store separately
    const toolCalls = message.toolCalls || [];
    const hasToolCalls = toolCalls.length > 0;

    // Store tool calls separately if present
    if (hasToolCalls) {
      const toolKey = this.getToolCallsKey(conversationId, messageId);
      await this.context.globalState.update(toolKey, toolCalls);
    }

    // Create message without tool calls (stored separately)
    const newMessage = {
      id: messageId,
      role: message.role,
      content: message.content,
      provider: message.provider || null,
      model: message.model || null,
      hasToolCalls,
      codeBlocks: message.codeBlocks || null,
      contextChips: message.contextChips || null,
      usage: message.usage || null, // Token usage data
      createdAt: now,
    };

    all[index].messages.push(newMessage);
    all[index].messageCount = all[index].messages.length;
    all[index].updatedAt = now;

    const key = this.getConversationsKey(workspaceId);
    await this.context.globalState.update(key, all);

    // Update aggregate statistics if usage data present
    if (message.usage && message.role === "assistant") {
      await this.updateConversationStats(
        workspaceId,
        conversationId,
        message.usage,
        hasToolCalls ? toolCalls.length : 0
      );
    }

    return { ...newMessage, toolCalls: hasToolCalls ? toolCalls : null };
  }

  /**
   * Get messages with pagination
   */
  async getMessages(workspaceId, conversationId, options = {}) {
    const {
      pageSize = this.DEFAULT_MESSAGE_PAGE_SIZE,
      fromEnd = true, // Load from end (most recent) by default
      beforeIndex = null, // Load messages before this index
    } = options;

    const conversation = await this.getById(workspaceId, conversationId);
    if (!conversation) return null;

    const totalMessages = conversation.messages.length;
    let startIndex, endIndex;

    if (beforeIndex !== null) {
      // Loading older messages
      endIndex = beforeIndex;
      startIndex = Math.max(0, endIndex - pageSize);
    } else if (fromEnd) {
      // Load most recent
      endIndex = totalMessages;
      startIndex = Math.max(0, totalMessages - pageSize);
    } else {
      // Load from displayFromIndex
      startIndex = conversation.displayFromIndex;
      endIndex = Math.min(startIndex + pageSize, totalMessages);
    }

    const messages = conversation.messages.slice(startIndex, endIndex);

    return {
      conversationId,
      messages,
      totalMessages,
      startIndex,
      endIndex,
      hasMoreBefore: startIndex > 0,
      hasMoreAfter: endIndex < totalMessages,
    };
  }

  /**
   * Get tool calls for a specific message
   */
  async getToolCalls(conversationId, messageId) {
    const toolKey = this.getToolCallsKey(conversationId, messageId);
    return this.context.globalState.get(toolKey, []);
  }

  /**
   * Get all messages for LLM context (full conversation)
   */
  async getAllMessages(workspaceId, conversationId) {
    const conversation = await this.getById(workspaceId, conversationId);
    if (!conversation) return [];

    // Return messages with tool calls loaded
    const messagesWithToolCalls = await Promise.all(
      conversation.messages.map(async (msg) => {
        if (msg.hasToolCalls) {
          const toolCalls = await this.getToolCalls(conversationId, msg.id);
          return { ...msg, toolCalls };
        }
        return msg;
      })
    );

    return messagesWithToolCalls;
  }

  /**
   * Get first N messages for title generation
   */
  async getMessagesForTitleGeneration(workspaceId, conversationId, count = 3) {
    const conversation = await this.getById(workspaceId, conversationId);
    if (!conversation) return [];

    return conversation.messages.slice(0, count).map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Update conversation title
   */
  async updateTitle(workspaceId, conversationId, title) {
    return this.updateConversation(workspaceId, conversationId, { title });
  }

  /**
   * Get message count
   */
  async getMessageCount(workspaceId, conversationId) {
    const conversation = await this.getById(workspaceId, conversationId);
    return conversation?.messageCount || 0;
  }

  /**
   * Clear messages in a conversation (keep conversation)
   */
  async clearMessages(workspaceId, conversationId) {
    const conversation = await this.getById(workspaceId, conversationId);
    if (!conversation) return false;

    // Delete all tool calls
    for (const msg of conversation.messages) {
      if (msg.hasToolCalls) {
        const toolKey = this.getToolCallsKey(conversationId, msg.id);
        await this.context.globalState.update(toolKey, undefined);
      }
    }

    return this.updateConversation(workspaceId, conversationId, {
      messages: [],
      messageCount: 0,
      displayFromIndex: 0,
    });
  }

  // ==================== APPLIED BLOCKS TRACKING ====================

  /**
   * Add a block key to the applied blocks list
   * @param {string} workspaceId - Workspace ID
   * @param {string} conversationId - Conversation ID
   * @param {string} blockKey - Unique identifier for the block (filePath:type:contentHash)
   */
  async addAppliedBlock(workspaceId, conversationId, blockKey) {
    const conversation = await this.getById(workspaceId, conversationId);
    if (!conversation) return false;

    // Initialize appliedBlocks if not present (for legacy conversations)
    const appliedBlocks = conversation.appliedBlocks || [];

    // Avoid duplicates
    if (!appliedBlocks.includes(blockKey)) {
      appliedBlocks.push(blockKey);
      await this.updateConversation(workspaceId, conversationId, {
        appliedBlocks,
      });
    }

    return true;
  }

  /**
   * Get all applied block keys for a conversation
   * @param {string} workspaceId - Workspace ID
   * @param {string} conversationId - Conversation ID
   * @returns {string[]} Array of applied block keys
   */
  async getAppliedBlocks(workspaceId, conversationId) {
    const conversation = await this.getById(workspaceId, conversationId);
    if (!conversation) return [];
    return conversation.appliedBlocks || [];
  }

  /**
   * Check if a block has been applied
   * @param {string} workspaceId - Workspace ID
   * @param {string} conversationId - Conversation ID
   * @param {string} blockKey - Block key to check
   * @returns {boolean}
   */
  async isBlockApplied(workspaceId, conversationId, blockKey) {
    const appliedBlocks = await this.getAppliedBlocks(
      workspaceId,
      conversationId
    );
    return appliedBlocks.includes(blockKey);
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Get storage statistics
   */
  async getStats(workspaceId) {
    const all = await this.getAll(workspaceId);
    const totalSize = JSON.stringify(all).length;

    return {
      conversationCount: all.length,
      totalMessages: all.reduce((sum, c) => sum + c.messageCount, 0),
      sizeBytes: totalSize,
      sizeKB: (totalSize / 1024).toFixed(2),
      pinnedCount: all.filter((c) => c.isPinned).length,
    };
  }

  // ==================== TOKEN USAGE AGGREGATION ====================

  /**
   * Update conversation-level token statistics
   */
  async updateConversationStats(
    workspaceId,
    conversationId,
    usage,
    toolCallCount = 0
  ) {
    const key = this.getConversationStatsKey(conversationId);
    const existing = this.context.globalState.get(key, {
      conversationId,
      workspaceId,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalReasoningTokens: 0,
      totalCachedTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      messageCount: 0,
      toolCallCount: 0,
      modelBreakdown: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Update totals
    existing.totalInputTokens += usage.inputTokens || 0;
    existing.totalOutputTokens += usage.outputTokens || 0;
    existing.totalReasoningTokens += usage.reasoningTokens || 0;
    existing.totalCachedTokens += usage.cachedTokens || 0;
    existing.totalTokens += usage.totalTokens || 0;
    existing.totalCost += usage.cost || 0;
    existing.messageCount += 1;
    existing.toolCallCount += toolCallCount;
    existing.updatedAt = new Date().toISOString();

    // Update model breakdown
    const modelKey = usage.model || "unknown";
    if (!existing.modelBreakdown[modelKey]) {
      existing.modelBreakdown[modelKey] = { tokens: 0, cost: 0, count: 0 };
    }
    existing.modelBreakdown[modelKey].tokens += usage.totalTokens || 0;
    existing.modelBreakdown[modelKey].cost += usage.cost || 0;
    existing.modelBreakdown[modelKey].count += 1;

    await this.context.globalState.update(key, existing);

    // Also update workspace and global stats
    await this.updateWorkspaceStats(workspaceId, usage, toolCallCount);
    await this.updateGlobalStats(usage, toolCallCount);

    return existing;
  }

  /**
   * Update workspace-level token statistics
   */
  async updateWorkspaceStats(workspaceId, usage, toolCallCount = 0) {
    const key = this.getWorkspaceStatsKey(workspaceId);
    const existing = this.context.globalState.get(key, {
      workspaceId,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalReasoningTokens: 0,
      totalCachedTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      messageCount: 0,
      toolCallCount: 0,
      modelBreakdown: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    existing.totalInputTokens += usage.inputTokens || 0;
    existing.totalOutputTokens += usage.outputTokens || 0;
    existing.totalReasoningTokens += usage.reasoningTokens || 0;
    existing.totalCachedTokens += usage.cachedTokens || 0;
    existing.totalTokens += usage.totalTokens || 0;
    existing.totalCost += usage.cost || 0;
    existing.messageCount += 1;
    existing.toolCallCount += toolCallCount;
    existing.updatedAt = new Date().toISOString();

    const modelKey = usage.model || "unknown";
    if (!existing.modelBreakdown[modelKey]) {
      existing.modelBreakdown[modelKey] = { tokens: 0, cost: 0, count: 0 };
    }
    existing.modelBreakdown[modelKey].tokens += usage.totalTokens || 0;
    existing.modelBreakdown[modelKey].cost += usage.cost || 0;
    existing.modelBreakdown[modelKey].count += 1;

    await this.context.globalState.update(key, existing);
    return existing;
  }

  /**
   * Update global token statistics
   */
  async updateGlobalStats(usage, toolCallCount = 0) {
    const key = this.getGlobalStatsKey();
    const existing = this.context.globalState.get(key, {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalReasoningTokens: 0,
      totalCachedTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      messageCount: 0,
      toolCallCount: 0,
      modelBreakdown: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    existing.totalInputTokens += usage.inputTokens || 0;
    existing.totalOutputTokens += usage.outputTokens || 0;
    existing.totalReasoningTokens += usage.reasoningTokens || 0;
    existing.totalCachedTokens += usage.cachedTokens || 0;
    existing.totalTokens += usage.totalTokens || 0;
    existing.totalCost += usage.cost || 0;
    existing.messageCount += 1;
    existing.toolCallCount += toolCallCount;
    existing.updatedAt = new Date().toISOString();

    const modelKey = usage.model || "unknown";
    if (!existing.modelBreakdown[modelKey]) {
      existing.modelBreakdown[modelKey] = { tokens: 0, cost: 0, count: 0 };
    }
    existing.modelBreakdown[modelKey].tokens += usage.totalTokens || 0;
    existing.modelBreakdown[modelKey].cost += usage.cost || 0;
    existing.modelBreakdown[modelKey].count += 1;

    await this.context.globalState.update(key, existing);
    await this._syncUsageToExternalFile(usage, toolCallCount);
    return existing;
  }

  /**
   * Sync usage data to an external file for cross-workspace persistence
   */
  async _syncUsageToExternalFile(usage, toolCallCount = 0) {
    const fs = require("fs");
    try {
      let globalUsage = {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalReasoningTokens: 0,
        totalCachedTokens: 0,
        totalTokens: 0,
        totalCost: 0,
        messageCount: 0,
        toolCallCount: 0,
        modelBreakdown: {},
        workspaceBreakdown: {},
        lastUpdated: new Date().toISOString(),
      };

      if (fs.existsSync(this._usageFilePath)) {
        try {
          const content = fs.readFileSync(this._usageFilePath, "utf8");
          globalUsage = JSON.parse(content);
        } catch (e) {
          console.error(
            `[ConversationStore] Error parsing usage file: ${e.message}`
          );
        }
      }

      // Update global totals
      globalUsage.totalInputTokens += usage.inputTokens || 0;
      globalUsage.totalOutputTokens += usage.outputTokens || 0;
      globalUsage.totalReasoningTokens += usage.reasoningTokens || 0;
      globalUsage.totalCachedTokens += usage.cachedTokens || 0;
      globalUsage.totalTokens += usage.totalTokens || 0;
      globalUsage.totalCost += usage.cost || 0;
      globalUsage.messageCount += 1;
      globalUsage.toolCallCount += toolCallCount;
      globalUsage.lastUpdated = new Date().toISOString();

      // Update model breakdown
      const modelKey = usage.model || "unknown";
      if (!globalUsage.modelBreakdown[modelKey]) {
        globalUsage.modelBreakdown[modelKey] = { tokens: 0, cost: 0, count: 0 };
      }
      globalUsage.modelBreakdown[modelKey].tokens += usage.totalTokens || 0;
      globalUsage.modelBreakdown[modelKey].cost += usage.cost || 0;
      globalUsage.modelBreakdown[modelKey].count += 1;

      // Update workspace breakdown
      const workspaceId = this._getCurrentWorkspaceId();
      if (!globalUsage.workspaceBreakdown[workspaceId]) {
        globalUsage.workspaceBreakdown[workspaceId] = {
          tokens: 0,
          cost: 0,
          count: 0,
          name: this._getWorkspaceName(),
        };
      }
      globalUsage.workspaceBreakdown[workspaceId].tokens +=
        usage.totalTokens || 0;
      globalUsage.workspaceBreakdown[workspaceId].cost += usage.cost || 0;
      globalUsage.workspaceBreakdown[workspaceId].count += 1;

      fs.writeFileSync(
        this._usageFilePath,
        JSON.stringify(globalUsage, null, 2)
      );
    } catch (err) {
      console.error(
        `[ConversationStore] Failed to sync usage to file: ${err.message}`
      );
    }
  }

  /**
   * Get workspace ID using VS Code API
   */
  _getCurrentWorkspaceId() {
    const vscode = require("vscode");
    if (
      vscode.workspace.workspaceFolders &&
      vscode.workspace.workspaceFolders.length > 0
    ) {
      return vscode.workspace.workspaceFolders[0].uri.toString();
    }
    return "default-workspace";
  }

  /**
   * Get workspace name using VS Code API
   */
  _getWorkspaceName() {
    const vscode = require("vscode");
    if (
      vscode.workspace.workspaceFolders &&
      vscode.workspace.workspaceFolders.length > 0
    ) {
      return vscode.workspace.workspaceFolders[0].name;
    }
    return "Default";
  }

  /**
   * Get aggregated usage stats for the dashboard
   */
  async getAggregatedUsage(workspaceId) {
    const fs = require("fs");
    const workspaceStats = await this.getWorkspaceStats(workspaceId);
    let globalStats = null;

    if (fs.existsSync(this._usageFilePath)) {
      try {
        const content = fs.readFileSync(this._usageFilePath, "utf8");
        globalStats = JSON.parse(content);
      } catch (err) {
        console.error(
          `[ConversationStore] Failed to read usage file: ${err.message}`
        );
      }
    }

    // Fallback to globalState if file doesn't exist yet
    if (!globalStats) {
      globalStats = await this.getGlobalStats();
    }

    return {
      workspace: workspaceStats,
      global: globalStats,
    };
  }

  /**
   * Get conversation-level token statistics
   */
  async getConversationStats(conversationId) {
    const key = this.getConversationStatsKey(conversationId);
    return this.context.globalState.get(key, null);
  }

  /**
   * Get workspace-level token statistics
   */
  async getWorkspaceStats(workspaceId) {
    const key = this.getWorkspaceStatsKey(workspaceId);
    return this.context.globalState.get(key, null);
  }

  /**
   * Get global token statistics
   */
  async getGlobalStats() {
    const key = this.getGlobalStatsKey();
    return this.context.globalState.get(key, null);
  }
}

module.exports = ConversationStore;
