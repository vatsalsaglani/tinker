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
      return new Date(b.updatedAt) - new Date(a.updatedAt);
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
   * @param {string} message.provider - LLM provider used
   * @param {string} message.model - Model used
   * @param {Array} message.toolCalls - Optional tool calls (stored separately)
   * @param {Object} message.metadata - Additional metadata
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
      createdAt: now,
    };

    all[index].messages.push(newMessage);
    all[index].messageCount = all[index].messages.length;
    all[index].updatedAt = now;

    const key = this.getConversationsKey(workspaceId);
    await this.context.globalState.update(key, all);

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
}

module.exports = ConversationStore;
