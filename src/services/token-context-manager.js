/**
 * Token Context Manager
 * Handles token tracking, usage normalization, cost calculation,
 * and context window management for all LLM providers
 */

const ModelConfigLoader = require("./model-config-loader");
const { getLogger } = require("./logger");

const logger = getLogger().child("TokenContextManager");

class TokenContextManager {
  constructor(configPath = null) {
    this.modelConfig = new ModelConfigLoader(configPath);
    this._geminiWarningLogged = false; // Only warn once for Gemini total mismatch
    this._cumulativeTokens = 0; // Track cumulative tokens for context window
  }

  /**
   * Set cumulative tokens (for restoring from persisted conversation)
   * @param {number} tokens - Cumulative token count
   */
  setCumulativeTokens(tokens) {
    this._cumulativeTokens = tokens || 0;
  }

  /**
   * Add tokens to cumulative count
   * @param {number} tokens - Tokens to add
   */
  addCumulativeTokens(tokens) {
    this._cumulativeTokens += tokens || 0;
  }

  /**
   * Get current cumulative tokens
   * @returns {number}
   */
  getCumulativeTokens() {
    return this._cumulativeTokens;
  }

  /**
   * Normalize token usage from different provider response formats
   * @param {Object} rawUsage - Raw usage object from provider
   * @param {string} provider - Provider name
   * @returns {Object|null} Normalized usage object
   */
  normalizeUsage(rawUsage, provider) {
    if (!rawUsage) {
      return null;
    }

    try {
      if (provider === "openai" || provider === "azure") {
        return this._normalizeOpenAIUsage(rawUsage);
      }

      if (provider === "anthropic" || provider === "bedrock") {
        return this._normalizeAnthropicUsage(rawUsage);
      }

      if (provider === "gemini") {
        return this._normalizeGeminiUsage(rawUsage);
      }

      // Unknown provider - try to extract what we can
      return this._normalizeGenericUsage(rawUsage);
    } catch (error) {
      logger.error(
        `[TokenContextManager] Failed to normalize usage for ${provider}:`,
        error.message
      );
      return null;
    }
  }

  /**
   * Normalize OpenAI usage (both Chat Completions and Responses API)
   */
  _normalizeOpenAIUsage(rawUsage) {
    // Chat Completions API format: prompt_tokens, completion_tokens
    if (rawUsage.prompt_tokens !== undefined) {
      return {
        inputTokens: rawUsage.prompt_tokens,
        outputTokens: rawUsage.completion_tokens || 0,
        reasoningTokens:
          rawUsage.completion_tokens_details?.reasoning_tokens || 0,
        cachedTokens: rawUsage.prompt_tokens_details?.cached_tokens || 0,
        totalTokens:
          rawUsage.total_tokens ||
          rawUsage.prompt_tokens + (rawUsage.completion_tokens || 0),
      };
    }

    // Responses API format: input_tokens, output_tokens
    if (rawUsage.input_tokens !== undefined) {
      return {
        inputTokens: rawUsage.input_tokens,
        outputTokens: rawUsage.output_tokens || 0,
        reasoningTokens: rawUsage.output_tokens_details?.reasoning_tokens || 0,
        cachedTokens: rawUsage.input_tokens_details?.cached_tokens || 0,
        totalTokens:
          rawUsage.total_tokens ||
          rawUsage.input_tokens + (rawUsage.output_tokens || 0),
      };
    }

    return null;
  }

  /**
   * Normalize Anthropic/Bedrock usage
   */
  _normalizeAnthropicUsage(rawUsage) {
    const inputTokens = rawUsage.input_tokens || 0;
    const outputTokens = rawUsage.output_tokens || 0;

    return {
      inputTokens,
      outputTokens,
      reasoningTokens: 0, // Anthropic doesn't separate reasoning tokens
      cachedTokens: rawUsage.cache_read_input_tokens || 0,
      cacheCreationTokens: rawUsage.cache_creation_input_tokens || 0,
      totalTokens: inputTokens + outputTokens,
    };
  }

  /**
   * Normalize Gemini usage (via OpenAI compatibility layer)
   */
  _normalizeGeminiUsage(rawUsage) {
    const inputTokens = rawUsage.prompt_tokens || 0;
    const outputTokens = rawUsage.completion_tokens || 0;
    const totalTokens = rawUsage.total_tokens || 0;

    // Log warning once if total doesn't match (likely includes thinking tokens)
    const expectedTotal = inputTokens + outputTokens;
    if (totalTokens !== expectedTotal && !this._geminiWarningLogged) {
      logger.warn(
        `[TokenContextManager] Gemini total_tokens (${totalTokens}) differs from input+output (${expectedTotal}). ` +
          `This may include thinking tokens. Using reported total.`
      );
      this._geminiWarningLogged = true;
    }

    return {
      inputTokens,
      outputTokens,
      reasoningTokens: Math.max(0, totalTokens - expectedTotal), // Infer thinking tokens
      cachedTokens: 0,
      totalTokens,
    };
  }

  /**
   * Generic normalization for unknown providers
   */
  _normalizeGenericUsage(rawUsage) {
    return {
      inputTokens:
        rawUsage.input_tokens ||
        rawUsage.prompt_tokens ||
        rawUsage.inputTokens ||
        0,
      outputTokens:
        rawUsage.output_tokens ||
        rawUsage.completion_tokens ||
        rawUsage.outputTokens ||
        0,
      reasoningTokens:
        rawUsage.reasoning_tokens || rawUsage.reasoningTokens || 0,
      cachedTokens: rawUsage.cached_tokens || rawUsage.cachedTokens || 0,
      totalTokens: rawUsage.total_tokens || rawUsage.totalTokens || 0,
    };
  }

  /**
   * Calculate cost for a message
   * @param {Object} usage - Normalized usage object
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   * @param {string} tier - Pricing tier (default: 'standard')
   * @returns {Object|null} Cost breakdown or null if pricing not available
   */
  calculateCost(usage, provider, model, tier = "standard") {
    if (!usage) {
      return null;
    }

    return this.modelConfig.calculateCost(provider, model, usage, tier);
  }

  /**
   * Get context window information for a model
   * @param {string} provider
   * @param {string} model
   * @returns {Object} Context window info
   */
  getContextInfo(provider, model) {
    const contextLength = this.modelConfig.getContextLength(provider, model);
    const maxOutputTokens = this.modelConfig.getMaxOutputTokens(
      provider,
      model
    );

    return {
      contextLength: contextLength || 128000, // Default fallback
      maxOutputTokens: maxOutputTokens || 8192,
      outputReserve: maxOutputTokens || 8192, // Reserve for model output
      availableForInput: contextLength
        ? contextLength - (maxOutputTokens || 8192)
        : 120000,
    };
  }

  /**
   * Calculate context usage percentage
   * @param {number} currentTokens - Current token count in context
   * @param {string} provider
   * @param {string} model
   * @returns {Object} Context status
   */
  getContextStatus(currentTokens, provider, model) {
    const contextInfo = this.getContextInfo(provider, model);
    const maxAvailable = contextInfo.availableForInput;
    const percentage = (currentTokens / maxAvailable) * 100;

    return {
      currentTokens,
      maxTokens: contextInfo.contextLength,
      availableTokens: maxAvailable,
      usedPercentage: Math.min(100, percentage),
      remainingTokens: Math.max(0, maxAvailable - currentTokens),
      needsSliding: percentage >= 70,
      needsSummarization: percentage >= 75,
      status:
        percentage >= 85
          ? "critical"
          : percentage >= 75
          ? "warning"
          : percentage >= 50
          ? "moderate"
          : "normal",
    };
  }

  /**
   * Format usage for logging
   * @param {Object} usage - Normalized usage
   * @param {Object} cost - Cost breakdown
   * @param {string} provider
   * @param {string} model
   * @returns {string} Formatted log string
   */
  formatUsageLog(usage, cost, provider, model) {
    if (!usage) {
      return `[TokenContextManager] No usage data for ${provider}/${model}`;
    }

    let log = `[TokenContextManager] ${provider}/${model}: `;
    log += `↑${usage.inputTokens} ↓${usage.outputTokens}`;

    if (usage.reasoningTokens > 0) {
      log += ` 🧠${usage.reasoningTokens}`;
    }
    if (usage.cachedTokens > 0) {
      log += ` 💾${usage.cachedTokens}`;
    }

    log += ` = ${usage.totalTokens} total`;

    if (cost?.totalCost !== undefined) {
      log += ` | $${cost.totalCost.toFixed(6)}`;
    }

    return log;
  }
}

module.exports = TokenContextManager;
