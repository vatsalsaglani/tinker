const BaseProvider = require("./base-provider");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { getLogger } = require("../services/logger");

const logger = getLogger().child("GeminiProvider");

/**
 * Gemini Provider using OpenAI SDK compatibility layer
 * https://ai.google.dev/gemini-api/docs/openai
 */
class GeminiProvider extends BaseProvider {
  constructor(config) {
    super(config);

    // Use OpenAI SDK with Gemini's OpenAI-compatible endpoint
    this.client = new OpenAI.default({
      apiKey: this.apiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });

    this.defaultModel = config.model || "gemini-2.0-flash";

    // Debug logging setup - disabled by default
    this.debugDir = config.debugDir || path.join(os.homedir(), ".tinker-debug");
    this.enableDebugLogging = config.enableDebugLogging || false;
  }

  getName() {
    return "Gemini";
  }

  getAvailableModels() {
    return [
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
      "gemini-1.5-pro",
    ];
  }

  async chat(messages, options = {}) {
    const {
      model = this.defaultModel,
      temperature = 0.2,
      maxTokens = 8192,
    } = options;

    try {
      logger.debug(`[Gemini] Chat - Model: ${model}`);

      const response = await this.client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
      });

      return response.choices[0].message.content;
    } catch (error) {
      logger.error("[Gemini] API Error:", error);
      throw new Error(`Gemini Error: ${error.message}`);
    }
  }

  async streamChat(messages, onChunk, options = {}) {
    const {
      model = this.defaultModel,
      temperature = 0.2,
      maxTokens = 8192,
      tools = null,
      onToolCall = null,
    } = options;

    logger.debug(
      `[Gemini] StreamChat - Model: ${model}, Tools: ${tools?.length || 0}`
    );

    const args = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: true,
    };

    // Add tools if provided (OpenAI format works with Gemini's OpenAI compatibility)
    if (tools && tools.length > 0) {
      args.tools = tools;
      args.tool_choice = "auto";
      logger.debug(`[Gemini] Adding ${tools.length} tools`);
    }

    try {
      logger.debug(
        `[Gemini] Creating stream with args:`,
        JSON.stringify({
          model: args.model,
          messageCount: args.messages.length,
          maxTokens: args.max_tokens,
          hasTools: !!args.tools,
        })
      );

      const stream = await this.client.chat.completions.create(args);

      let fullResponse = "";
      let currentToolCall = null;
      let finishReason = "stop";
      let usage = null;
      let chunkCount = 0;

      for await (const chunk of stream) {
        chunkCount++;

        // Log first few chunks and every 10th chunk for debugging
        if (chunkCount <= 3 || chunkCount % 10 === 0) {
          logger.debug(
            `[Gemini] Chunk ${chunkCount}:`,
            JSON.stringify({
              hasChoices: !!chunk.choices?.length,
              hasDelta: !!chunk.choices?.[0]?.delta,
              hasContent: !!chunk.choices?.[0]?.delta?.content,
              hasToolCalls: !!chunk.choices?.[0]?.delta?.tool_calls,
              finishReason: chunk.choices?.[0]?.finish_reason,
            })
          );
        }

        // Capture usage from final chunk
        if (chunk.usage) {
          usage = chunk.usage;
          logger.debug(`[Gemini] Usage received:`, JSON.stringify(chunk.usage));
        }

        const delta = chunk.choices[0]?.delta;
        const chunkFinishReason = chunk.choices[0]?.finish_reason;

        if (chunkFinishReason) {
          finishReason = chunkFinishReason;
          logger.debug(`[Gemini] Finish reason: ${finishReason}`);
        }

        // Handle text content
        if (delta?.content) {
          fullResponse += delta.content;
          onChunk(delta.content);
        }

        // Handle tool calls (OpenAI format)
        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            if (!currentToolCall || toolCall.index !== currentToolCall.index) {
              // Process previous tool call if exists
              if (currentToolCall && onToolCall) {
                try {
                  const args = JSON.parse(currentToolCall.function.arguments);
                  await onToolCall(
                    currentToolCall.function.name,
                    args,
                    currentToolCall.id
                  );
                } catch (e) {
                  logger.error("[Gemini] Failed to parse tool arguments:", e);
                }
              }
              currentToolCall = {
                index: toolCall.index,
                id: toolCall.id || `call_${Date.now()}`,
                function: {
                  name: toolCall.function?.name || "",
                  arguments: toolCall.function?.arguments || "",
                },
              };
              logger.debug(
                `[Gemini] Tool call started: ${currentToolCall.function.name}`
              );
            } else {
              if (toolCall.function?.arguments) {
                currentToolCall.function.arguments +=
                  toolCall.function.arguments;
              }
            }
          }
        }

        // Process tool call on finish - Gemini may use "stop" instead of "tool_calls"
        // Execute if we have a pending tool call and stream is ending
        if (chunkFinishReason && currentToolCall && onToolCall) {
          try {
            const args = JSON.parse(currentToolCall.function.arguments || "{}");
            logger.debug(
              `[Gemini] Executing tool (finish: ${chunkFinishReason}): ${currentToolCall.function.name}`
            );
            await onToolCall(
              currentToolCall.function.name,
              args,
              currentToolCall.id
            );
            // Mark that we executed a tool so we can continue the loop
            finishReason = "tool_calls";
          } catch (e) {
            logger.error("[Gemini] Failed to parse tool arguments:", e);
            logger.error(
              "[Gemini] Raw arguments:",
              currentToolCall.function.arguments
            );
          }
          currentToolCall = null;
        }
      }

      logger.debug(
        `[Gemini] Stream complete - chunks: ${chunkCount}, responseLength: ${fullResponse.length}, finishReason: ${finishReason}`
      );

      // Detect malformed tool call response - when model outputs JSON that looks like tool args as text
      // This happens when Gemini incorrectly returns { "reason": "..." } as text instead of a tool call
      if (fullResponse.length > 0 && finishReason === "stop" && onToolCall) {
        const trimmedResponse = fullResponse.trim();
        // Check if response looks like it was meant to be a tool call
        if (
          trimmedResponse.startsWith("{") &&
          trimmedResponse.endsWith("}") &&
          trimmedResponse.includes('"reason"')
        ) {
          try {
            const parsed = JSON.parse(trimmedResponse);
            if (parsed.reason && Object.keys(parsed).length <= 3) {
              logger.warn(
                `[Gemini] WARNING: Model returned what looks like tool call arguments as text content.`
              );
              logger.warn(
                `[Gemini] This is a known issue with some Gemini preview models.`
              );
              logger.warn(
                `[Gemini] Response: ${trimmedResponse.substring(0, 200)}`
              );
              // Don't fail - just log the warning. The model may need to be retried or the conversation continued.
            }
          } catch {
            // Not valid JSON, ignore
          }
        }
      }

      // If we got no response and no tool calls, log a warning
      if (
        fullResponse.length === 0 &&
        !currentToolCall &&
        finishReason === "stop"
      ) {
        logger.warn(
          `[Gemini] WARNING: Empty response received! Model may not support streaming or there was an issue.`
        );
        logger.warn(
          `[Gemini] Try checking if the model "${model}" is correct and supports the OpenAI compatibility layer.`
        );
      }

      const wasTruncated = finishReason === "length";

      // Return consistent format with OpenAI provider
      return {
        content: fullResponse,
        finishReason,
        wasTruncated,
        usage,
      };
    } catch (error) {
      logger.error("[Gemini] Streaming Error:", error);
      logger.error("[Gemini] Error details:", {
        message: error.message,
        status: error.status,
        code: error.code,
        type: error.type,
      });
      throw new Error(`Gemini Streaming Error: ${error.message}`);
    }
  }

  async validateApiKey() {
    try {
      await this.client.chat.completions.create({
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5,
      });
      return true;
    } catch (error) {
      logger.error("[Gemini] API Validation Error:", error.message);
      return false;
    }
  }
}

module.exports = GeminiProvider;
