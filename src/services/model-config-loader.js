/**
 * Model Configuration Loader
 * Loads and parses model-config.yaml for pricing and model specifications
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { getLogger } = require("./logger");

const logger = getLogger().child("ModelConfigLoader");

class ModelConfigLoader {
  constructor(configPath = null) {
    // Default to model-config.yaml in the extension root
    this.configPath =
      configPath || path.join(__dirname, "..", "..", "model-config.yaml");
    this._config = null;
    this._loadAttempted = false;
  }

  /**
   * Load the configuration file
   * @returns {Object|null} The parsed configuration or null if failed
   */
  loadConfig() {
    if (this._config) {
      return this._config;
    }

    if (this._loadAttempted) {
      return null;
    }

    this._loadAttempted = true;

    try {
      if (!fs.existsSync(this.configPath)) {
        logger.warn(
          `[ModelConfigLoader] Config file not found: ${this.configPath}`
        );
        return null;
      }

      const fileContents = fs.readFileSync(this.configPath, "utf8");
      this._config = yaml.load(fileContents);
      logger.info(
        `[ModelConfigLoader] Loaded config with ${
          Object.keys(this._config.providers || {}).length
        } providers`
      );
      return this._config;
    } catch (error) {
      logger.error(
        `[ModelConfigLoader] Failed to load config:`,
        error.message
      );
      return null;
    }
  }

  /**
   * Get model specification for a specific provider and model
   * Uses fuzzy matching for versioned names, ARNs, and aliases
   * @param {string} provider - Provider name (openai, anthropic, gemini)
   * @param {string} model - Model name (can be ARN, versioned, or alias)
   * @returns {Object|null} Model specification or null if not found
   */
  getModelSpec(provider, model) {
    const config = this.loadConfig();
    if (!config?.providers) {
      return null;
    }

    // Map bedrock -> anthropic, azure -> openai
    const mappedProvider = this._mapProvider(provider);
    const providerConfig = config.providers[mappedProvider];

    if (!providerConfig?.models) {
      return null;
    }

    // Normalize the input model name
    const normalizedInput = this._normalizeModelName(model, provider);

    // Try exact match first
    if (providerConfig.models[model]) {
      return providerConfig.models[model];
    }

    // Try normalized exact match
    if (providerConfig.models[normalizedInput]) {
      return providerConfig.models[normalizedInput];
    }

    // Score-based fuzzy matching
    let bestMatch = null;
    let bestScore = 0;

    for (const [modelName, spec] of Object.entries(providerConfig.models)) {
      const normalizedConfig = this._normalizeModelName(
        modelName,
        mappedProvider
      );
      const score = this._calculateMatchScore(
        normalizedInput,
        normalizedConfig,
        modelName
      );

      if (score > bestScore) {
        bestScore = score;
        bestMatch = spec;
      }
    }

    // Only return if we have a reasonable match (score > 50)
    if (bestScore > 50) {
      return bestMatch;
    }

    return null;
  }

  /**
   * Normalize model name by stripping ARN prefixes, version suffixes, dates
   * @param {string} model - Raw model name
   * @param {string} provider - Provider name
   * @returns {string} Normalized model name
   */
  _normalizeModelName(model, provider) {
    if (!model) return "";

    let normalized = model.toLowerCase();

    // Strip ARN prefix (arn:aws:bedrock:region:account:...)
    if (normalized.includes("arn:aws:bedrock")) {
      // Extract model ID from ARN like "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-4"
      const arnMatch = normalized.match(
        /(?:foundation-model|inference-profile)\/(.+?)(?:$|\/)/
      );
      if (arnMatch) {
        normalized = arnMatch[1];
      }
    }

    // Strip Bedrock provider prefix (anthropic., amazon., etc.)
    normalized = normalized.replace(
      /^(anthropic|amazon|meta|cohere|ai21|mistral)\./i,
      ""
    );

    // Strip version suffixes like "-v1:0", "-v2:0", ":0"
    normalized = normalized.replace(/[:-]v?\d+:\d+$/i, "");
    normalized = normalized.replace(/:\d+$/i, "");

    // Strip date suffixes like "-20241022", "-2024-05-13"
    normalized = normalized.replace(/-\d{8}$/i, "");
    normalized = normalized.replace(/-\d{4}-\d{2}-\d{2}$/i, "");

    // Common aliases
    const aliases = {
      "sonnet-4": "claude-sonnet-4",
      "sonnet-3.5": "claude-3-5-sonnet",
      "sonnet-3-5": "claude-3-5-sonnet",
      "opus-4": "claude-opus-4",
      "haiku-3.5": "claude-3-5-haiku",
      gpt4o: "gpt-4o",
      "gpt-4-o": "gpt-4o",
      "gemini-flash": "gemini-2.0-flash",
      "flash-2": "gemini-2.0-flash",
    };

    for (const [alias, canonical] of Object.entries(aliases)) {
      if (normalized.includes(alias)) {
        normalized = normalized.replace(alias, canonical);
      }
    }

    return normalized.trim();
  }

  /**
   * Calculate match score between input model and config model name
   * @param {string} input - Normalized input model name
   * @param {string} configNormalized - Normalized config model name
   * @param {string} configOriginal - Original config model name
   * @returns {number} Score 0-100
   */
  _calculateMatchScore(input, configNormalized, configOriginal) {
    // Exact match after normalization
    if (input === configNormalized) return 100;

    // One contains the other
    if (input.includes(configNormalized) || configNormalized.includes(input)) {
      const longer = Math.max(input.length, configNormalized.length);
      const shorter = Math.min(input.length, configNormalized.length);
      return 70 + (shorter / longer) * 25; // 70-95
    }

    // Extract key parts (claude, sonnet, 4, gpt, 4o, flash, etc.)
    const inputParts = input.split(/[-_.\s]+/).filter((p) => p.length > 0);
    const configParts = configNormalized
      .split(/[-_.\s]+/)
      .filter((p) => p.length > 0);

    // Count matching parts
    let matches = 0;
    for (const part of inputParts) {
      if (
        configParts.some(
          (cp) => cp === part || cp.includes(part) || part.includes(cp)
        )
      ) {
        matches++;
      }
    }

    if (inputParts.length === 0) return 0;

    const matchRatio =
      matches / Math.max(inputParts.length, configParts.length);
    return Math.round(matchRatio * 70); // 0-70 for partial matches
  }

  /**
   * Map provider aliases to their base provider
   * @param {string} provider
   * @returns {string}
   */
  _mapProvider(provider) {
    const providerMap = {
      bedrock: "anthropic",
      azure: "openai",
    };
    return providerMap[provider] || provider;
  }

  /**
   * Get context length for a model
   * @param {string} provider
   * @param {string} model
   * @returns {number|null}
   */
  getContextLength(provider, model) {
    const spec = this.getModelSpec(provider, model);
    return spec?.context_length || null;
  }

  /**
   * Get max output tokens for a model
   * @param {string} provider
   * @param {string} model
   * @returns {number|null}
   */
  getMaxOutputTokens(provider, model) {
    const spec = this.getModelSpec(provider, model);
    return spec?.max_output_tokens || null;
  }

  /**
   * Get pricing for a model (standard tier)
   * @param {string} provider
   * @param {string} model
   * @param {string} tier - Pricing tier (default: 'standard')
   * @returns {Object|null}
   */
  getPricing(provider, model, tier = "standard") {
    const spec = this.getModelSpec(provider, model);
    if (!spec?.pricing?.tiers) {
      return null;
    }
    return spec.pricing.tiers[tier] || spec.pricing.tiers.standard || null;
  }

  /**
   * Calculate cost for token usage
   * @param {string} provider
   * @param {string} model
   * @param {Object} usage - Token usage object
   * @param {number} usage.inputTokens
   * @param {number} usage.outputTokens
   * @param {number} [usage.reasoningTokens]
   * @param {number} [usage.cachedTokens]
   * @param {string} [tier] - Pricing tier
   * @returns {Object|null}
   */
  calculateCost(provider, model, usage, tier = "standard") {
    const pricing = this.getPricing(provider, model, tier);
    if (!pricing || !usage) {
      return null;
    }

    const inputTokens = usage.inputTokens || 0;
    const outputTokens = usage.outputTokens || 0;
    const reasoningTokens = usage.reasoningTokens || 0;
    const cachedTokens = usage.cachedTokens || 0;

    // Calculate non-cached input tokens
    const nonCachedInputTokens = Math.max(0, inputTokens - cachedTokens);

    // Input cost (cached vs non-cached)
    let inputCost = 0;
    if (pricing.input_per_1m) {
      inputCost = (nonCachedInputTokens / 1_000_000) * pricing.input_per_1m;
    }
    if (pricing.cached_input_per_1m && cachedTokens > 0) {
      inputCost += (cachedTokens / 1_000_000) * pricing.cached_input_per_1m;
    }

    // Output cost
    let outputCost = 0;
    if (pricing.output_per_1m) {
      outputCost = (outputTokens / 1_000_000) * pricing.output_per_1m;
    }

    // Reasoning cost (uses reasoning_per_1m or falls back to output_per_1m)
    let reasoningCost = 0;
    if (reasoningTokens > 0) {
      const reasoningRate = pricing.reasoning_per_1m || pricing.output_per_1m;
      if (reasoningRate) {
        reasoningCost = (reasoningTokens / 1_000_000) * reasoningRate;
      }
    }

    const totalCost = inputCost + outputCost + reasoningCost;

    return {
      totalCost,
      breakdown: {
        inputCost,
        outputCost,
        reasoningCost,
        cachedInputCost:
          cachedTokens > 0 && pricing.cached_input_per_1m
            ? (cachedTokens / 1_000_000) * pricing.cached_input_per_1m
            : 0,
      },
      tokens: {
        input: inputTokens,
        output: outputTokens,
        reasoning: reasoningTokens,
        cached: cachedTokens,
      },
    };
  }
}

module.exports = ModelConfigLoader;
