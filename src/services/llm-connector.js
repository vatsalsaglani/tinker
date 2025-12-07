const OpenAIProvider = require("../providers/openai-provider");
const AnthropicProvider = require("../providers/anthropic-provider");
const GeminiProvider = require("../providers/gemini-provider");
const { generateSystemPrompt, getOSName } = require("../prompts/system-prompt");

/**
 * LLM Connector - Manages different LLM providers
 */
class LLMConnector {
  constructor() {
    this.currentProvider = null;
    this.providers = new Map();
  }

  /**
   * Initialize a provider
   * @param {string} providerName - 'openai', 'anthropic', 'gemini', 'azure'
   * @param {Object} config - Provider configuration
   */
  initProvider(providerName, config) {
    switch (providerName.toLowerCase()) {
      case "openai":
        this.currentProvider = new OpenAIProvider(config);
        break;
      case "anthropic":
        this.currentProvider = new AnthropicProvider(config);
        break;
      case "gemini":
        this.currentProvider = new GeminiProvider(config);
        break;
      case "azure":
        this.currentProvider = new OpenAIProvider({
          ...config,
          baseURL: config.baseURL || config.endpoint || config.azureEndpoint,
        });
        break;
      default:
        throw new Error(`Unsupported provider: ${providerName}`);
    }

    this.providers.set(providerName, this.currentProvider);
    return this.currentProvider;
  }

  /**
   * Switch to a different provider
   */
  switchProvider(providerName) {
    if (this.providers.has(providerName)) {
      this.currentProvider = this.providers.get(providerName);
    } else {
      throw new Error(`Provider not initialized: ${providerName}`);
    }
  }

  /**
   * Get current provider
   */
  getCurrentProvider() {
    if (!this.currentProvider) {
      throw new Error(
        "No provider initialized. Please configure API settings."
      );
    }
    return this.currentProvider;
  }

  /**
   * Send a chat message
   */
  async chat(messages, options = {}) {
    return await this.getCurrentProvider().chat(messages, options);
  }

  /**
   * Stream a chat message
   */
  async streamChat(messages, onChunk, options = { maxTokens: 16000 }) {
    return await this.getCurrentProvider().streamChat(
      messages,
      onChunk,
      options
    );
  }

  /**
   * Validate current provider's API key
   */
  async validateApiKey() {
    return await this.getCurrentProvider().validateApiKey();
  }

  /**
   * Get available models for current provider
   */
  getAvailableModels() {
    return this.getCurrentProvider().getAvailableModels();
  }

  /**
   * Get the system prompt for code generation
   * @param {Object} options - Options like workspaceRoot, fileTree
   */
  static getSystemPrompt(options = {}) {
    return generateSystemPrompt(options);
  }

  /**
   * @deprecated Use getSystemPrompt instead
   * Kept for backward compatibility
   */
  static getAiderSystemPrompt() {
    return generateSystemPrompt({});
  }

  /**
   * Get OS name (for command suggestions)
   */
  static getOSName() {
    return getOSName();
  }
}

module.exports = LLMConnector;
