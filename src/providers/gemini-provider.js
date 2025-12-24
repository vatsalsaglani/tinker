const BaseProvider = require("./base-provider");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const os = require("os");

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

    // Debug logging setup - disabled by default for production
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

  /**
   * Write debug log to timestamped file
   */
  writeDebugLog(prefix, data) {
    if (!this.enableDebugLogging) return;

    try {
      if (!fs.existsSync(this.debugDir)) {
        fs.mkdirSync(this.debugDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `gemini_${prefix}_${timestamp}.json`;
      const filepath = path.join(this.debugDir, filename);

      fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf8");
      console.log(`[Gemini DEBUG] Wrote log to: ${filepath}`);
    } catch (error) {
      console.error("[Gemini DEBUG] Failed to write log file:", error.message);
    }
  }

  async chat(messages, options = {}) {
    const {
      model = this.defaultModel,
      temperature = 0.2,
      maxTokens = 8192,
    } = options;

    try {
      console.log(`[Gemini] Chat - Model: ${model}`);

      const response = await this.client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error("[Gemini] API Error:", error);
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

    console.log(
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
      console.log(`[Gemini] Adding ${tools.length} tools`);
    }

    this.writeDebugLog("stream_request", {
      model,
      toolCount: tools?.length || 0,
      messageCount: messages.length,
      timestamp: new Date().toISOString(),
    });

    try {
      console.log(
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
          console.log(
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
          console.log(`[Gemini] Usage received:`, JSON.stringify(chunk.usage));
        }

        const delta = chunk.choices[0]?.delta;
        const chunkFinishReason = chunk.choices[0]?.finish_reason;

        if (chunkFinishReason) {
          finishReason = chunkFinishReason;
          console.log(`[Gemini] Finish reason: ${finishReason}`);
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
                  console.error("[Gemini] Failed to parse tool arguments:", e);
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
              console.log(
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
            console.log(
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
            console.error("[Gemini] Failed to parse tool arguments:", e);
            console.error(
              "[Gemini] Raw arguments:",
              currentToolCall.function.arguments
            );
          }
          currentToolCall = null;
        }
      }

      console.log(
        `[Gemini] Stream complete - chunks: ${chunkCount}, responseLength: ${fullResponse.length}, finishReason: ${finishReason}`
      );

      // If we got no response and no tool calls, log a warning
      if (
        fullResponse.length === 0 &&
        !currentToolCall &&
        finishReason === "stop"
      ) {
        console.warn(
          `[Gemini] WARNING: Empty response received! Model may not support streaming or there was an issue.`
        );
        console.warn(
          `[Gemini] Try checking if the model "${model}" is correct and supports the OpenAI compatibility layer.`
        );
      }

      const wasTruncated = finishReason === "length";

      this.writeDebugLog("stream_response", {
        model,
        finishReason,
        wasTruncated,
        responseLength: fullResponse.length,
        chunkCount,
        timestamp: new Date().toISOString(),
      });

      // Return consistent format with OpenAI provider
      return {
        content: fullResponse,
        finishReason,
        wasTruncated,
        usage,
      };
    } catch (error) {
      console.error("[Gemini] Streaming Error:", error);
      console.error("[Gemini] Error details:", {
        message: error.message,
        status: error.status,
        code: error.code,
        type: error.type,
      });
      this.writeDebugLog("stream_error", {
        error: error.message,
        status: error.status,
        timestamp: new Date().toISOString(),
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
      console.error("[Gemini] API Validation Error:", error.message);
      return false;
    }
  }
}

module.exports = GeminiProvider;
