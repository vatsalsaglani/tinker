/**
 * Base Provider class
 * All LLM providers should extend this class
 */

class BaseProvider {
  constructor(config) {
    this.config = config;
    this.apiKey = config.apiKey;
  }

  /**
   * Send a chat completion request
   * @param {Array} messages - Array of message objects
   * @param {Object} options - Additional options (temperature, max_tokens, etc.)
   * @returns {Promise<string>} - The completion response
   */
  async chat(messages, options = {}) {
    throw new Error("chat() must be implemented by provider");
  }

  /**
   * Stream a chat completion
   * @param {Array} messages - Array of message objects
   * @param {Function} onChunk - Callback function to handle streamed chunks
   * @param {Object} options - Additional options (temperature, max_tokens, etc.)
   * @returns {Promise<string>} - THe complete response
   */
  async streamChat(messages, onChunk, options = {}) {
    throw new Error("streamChat() must be implemented by provider");
  }

  /**
   * Valide the API key
   * @returns {Promise<boolean>} - True if API key is valid, false otherwise
   */
  async validateApiKey() {
    throw new Error("validateApiKey() must be implemented by provider");
  }

  /**
   * Get available models for this provider
   * @returns {Array<string>} - Array of model names
   */
  getAvailableModels() {
    throw new Error("getAvailableModels() must be implemented by provider");
  }

  /**
   * Get the name of this provider
   * @returns {string} - The provider name
   */
  getName() {
    throw new Error("getName() must be implemented by provider");
  }
}

module.exports = BaseProvider;
