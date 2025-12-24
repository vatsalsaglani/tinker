const BaseProvider = require("./base-provider");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const os = require("os");

class OpenAIProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.client = new OpenAI.default({
      apiKey: this.apiKey,
      baseURL: config.baseURL || "https://api.openai.com/v1",
    });

    this.defaultModel = config.model || "gpt-5-mini";
    this.useResponsesAPI = config.useResponsesAPI || false;

    // Debug logging setup - disabled by default for production
    this.debugDir = config.debugDir || path.join(os.homedir(), ".tinker-debug");
    this.enableDebugLogging = config.enableDebugLogging || false;
  }

  getName() {
    return "OpenAI";
  }

  getAvailableModels() {
    return ["gpt-5-mini", "gpt-5", "gpt-4o", "gpt-5-nano", "o3"];
  }

  /**
   * Write debug log to timestamped file
   */
  writeDebugLog(prefix, data) {
    if (!this.enableDebugLogging) return;

    try {
      // Create debug directory if it doesn't exist
      if (!fs.existsSync(this.debugDir)) {
        fs.mkdirSync(this.debugDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `${prefix}_${timestamp}.json`;
      const filepath = path.join(this.debugDir, filename);

      fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf8");
      console.log(`[DEBUG] Wrote log to: ${filepath}`);
    } catch (error) {
      console.error("[DEBUG] Failed to write log file:", error.message);
    }
  }

  /**
   * Determine if model should use Responses API
   */
  shouldUseResponsesAPI(model) {
    return this.useResponsesAPI || model.includes("codex");
  }

  /**
   * Convert OpenAI Chat Completions tools format to Responses API format
   * Responses API expects: { type: "function", name: "...", description: "...", parameters: {...} }
   * NOT: { type: "function", function: { name: "...", ... } }
   */
  convertToolsForResponsesAPI(tools) {
    if (!tools || tools.length === 0) return null;

    return tools.map((tool) => {
      const fn = tool.function || tool;
      return {
        type: "function",
        name: fn.name,
        description: fn.description,
        parameters: fn.parameters,
      };
    });
  }

  /**
   * Convert messages to Responses API format
   * Responses API uses different content types: input_text, input_image, output_text
   */
  convertMessagesForResponsesAPI(messages) {
    return messages.map((msg) => {
      // Handle system messages
      if (msg.role === "system") {
        return msg; // System messages stay the same
      }

      // Handle array content (multi-modal messages with images)
      if (Array.isArray(msg.content)) {
        const convertedContent = msg.content.map((part) => {
          if (part.type === "text") {
            return { type: "input_text", text: part.text };
          }
          if (part.type === "image_url" && part.image_url?.url) {
            return {
              type: "input_image",
              image_url: part.image_url.url,
            };
          }
          return part;
        });
        return { role: msg.role, content: convertedContent };
      }

      // Handle string content (simple text messages)
      if (typeof msg.content === "string") {
        return {
          role: msg.role,
          content: msg.content, // Simple string content works as-is
        };
      }

      return msg;
    });
  }

  async chat(messages, options = {}) {
    const {
      model = this.defaultModel,
      temperature = 0.2,
      maxTokens = 4096,
    } = options;

    const useResponsesAPI = this.shouldUseResponsesAPI(model);

    console.log(
      `[OpenAI] Chat - Model: ${model}, UseResponsesAPI: ${useResponsesAPI}`
    );

    if (useResponsesAPI) {
      console.log("[OpenAI] Using Responses API (non-streaming)");
      try {
        const convertedMessages = this.convertMessagesForResponsesAPI(messages);
        const requestBody = {
          model,
          input: convertedMessages,
          max_output_tokens: maxTokens,
        };

        this.writeDebugLog("chat_request", {
          api: "responses",
          model,
          requestBody,
          timestamp: new Date().toISOString(),
        });

        const response = await fetch(
          `${this.client.baseURL.replace("/v1", "")}/v1/responses`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          }
        );

        if (!response.ok) {
          const error = await response.json();
          this.writeDebugLog("chat_error", { error, status: response.status });
          throw new Error(
            `${response.status} ${
              error.error?.message || error.message || "Unknown error"
            }`
          );
        }

        const data = await response.json();

        this.writeDebugLog("chat_response", {
          api: "responses",
          data,
          timestamp: new Date().toISOString(),
        });

        console.log(
          "[OpenAI] Responses API Data:",
          JSON.stringify(data, null, 2)
        );

        // Extract text from Responses API output array
        // Output can contain: { type: "message", content: [...] } or { type: "output_text", text: "..." }
        if (data.output && Array.isArray(data.output)) {
          for (const item of data.output) {
            if (item.type === "message" && item.content) {
              // Extract text from message content array
              const textParts = item.content
                .filter((c) => c.type === "output_text" || c.type === "text")
                .map((c) => c.text)
                .join("");
              if (textParts) return textParts;
            } else if (item.type === "output_text" && item.text) {
              return item.text;
            }
          }
        }

        // Fallback to Chat Completions format
        return data.choices?.[0]?.message?.content || "";
      } catch (error) {
        console.error("[OpenAI] Responses API ERROR:", error);
        throw new Error(`OpenAI Error: ${error.message}`);
      }
    } else {
      console.log("[OpenAI] Using Chat Completions API");
      const args = {
        model,
        messages,
      };

      if (model.includes("gpt-5")) {
        args.max_completion_tokens = maxTokens;
      } else {
        args.max_tokens = maxTokens;
        args.temperature = temperature;
      }

      try {
        const response = await this.client.chat.completions.create(args);
        return response.choices[0].message.content;
      } catch (error) {
        console.error("[OpenAI] API ERROR:", error);
        throw new Error(`OpenAI Error: ${error.status} ${error.message}`);
      }
    }
  }

  async streamChat(messages, onChunk, options = {}) {
    const {
      model = this.defaultModel,
      temperature = 0.2,
      maxTokens = 4096,
      tools = null,
      onToolCall = null,
    } = options;

    const useResponsesAPI = this.shouldUseResponsesAPI(model);

    if (useResponsesAPI) {
      try {
        // Convert messages for Responses API format
        const convertedMessages = this.convertMessagesForResponsesAPI(messages);

        // Build request body for Responses API
        const requestBody = {
          model,
          input: convertedMessages,
          max_output_tokens: maxTokens,
          stream: true,
        };

        // Add temperature for non-gpt-5 models
        if (!model.includes("gpt-5")) {
          requestBody.temperature = temperature;
        }

        // IMPORTANT: Add tools if provided
        if (tools && tools.length > 0) {
          requestBody.tools = this.convertToolsForResponsesAPI(tools);
          requestBody.tool_choice = "auto";
        }

        // Log the full request to file
        this.writeDebugLog("stream_request", {
          api: "responses",
          model,
          useResponsesAPI: true,
          toolCount: tools?.length || 0,
          requestBody: {
            ...requestBody,
            input: `[${messages.length} messages]`,
          },
          fullMessages: messages,
          timestamp: new Date().toISOString(),
        });

        const response = await fetch(
          `${this.client.baseURL.replace("/v1", "")}/v1/responses`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          }
        );

        if (!response.ok) {
          const error = await response.json();
          this.writeDebugLog("stream_error", {
            error,
            status: response.status,
            timestamp: new Date().toISOString(),
          });
          console.error("[OpenAI] Responses API Error Response:", error);
          throw new Error(
            `${response.status} ${
              error.error?.message || error.message || "Unknown error"
            }`
          );
        }

        // Parse SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = "";
        let buffer = "";
        let allEvents = [];
        let currentToolCalls = new Map();
        let finishReason = null;
        let usage = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") {
                continue;
              }

              try {
                const parsed = JSON.parse(data);
                allEvents.push(parsed);

                // Handle different event types from Responses API
                const eventType = parsed.type;

                // Track finish reason and usage from response.done or response.completed
                if (
                  eventType === "response.done" ||
                  eventType === "response.completed"
                ) {
                  finishReason =
                    parsed.response?.status || parsed.status || "stop";
                  // Capture usage from response
                  if (parsed.response?.usage) {
                    usage = parsed.response.usage;
                  }
                  // Check output items for finish reasons
                  if (parsed.response?.output) {
                    for (const item of parsed.response.output) {
                      if (
                        item.status === "incomplete" ||
                        item.finish_reason === "length"
                      ) {
                        finishReason = "length";
                        break;
                      }
                    }
                  }
                }

                if (eventType === "response.output_item.added") {
                  // New output item (could be text or tool call)
                  const item = parsed.item;
                  if (item?.type === "function_call") {
                    currentToolCalls.set(item.id || `call_${Date.now()}`, {
                      id: item.id,
                      name: item.name,
                      arguments: "",
                    });
                  }
                }

                if (eventType === "response.function_call_arguments.delta") {
                  // Tool call arguments streaming
                  const callId = parsed.call_id || parsed.item_id;
                  if (currentToolCalls.has(callId)) {
                    currentToolCalls.get(callId).arguments +=
                      parsed.delta || "";
                  }
                }

                if (eventType === "response.function_call_arguments.done") {
                  // Tool call complete
                  const callId = parsed.call_id || parsed.item_id;
                  const toolCall = currentToolCalls.get(callId);
                  if (toolCall && onToolCall) {
                    try {
                      const args = JSON.parse(toolCall.arguments);
                      await onToolCall(toolCall.name, args, callId);
                    } catch (e) {
                      console.error(
                        "[OpenAI] Failed to parse tool arguments:",
                        e
                      );
                    }
                  }
                }

                // Handle text content
                const content =
                  parsed.delta?.content ||
                  parsed.choices?.[0]?.delta?.content ||
                  (eventType === "response.output_text.delta"
                    ? parsed.delta
                    : null);

                if (content) {
                  fullResponse += content;
                  onChunk(content);
                }
              } catch (e) {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }

        // Determine if output was truncated
        const wasTruncated =
          finishReason === "length" ||
          finishReason === "max_tokens" ||
          finishReason === "incomplete";

        // Log all events for debugging
        this.writeDebugLog("stream_response", {
          api: "responses",
          model,
          eventCount: allEvents.length,
          finishReason,
          wasTruncated,
          fullResponse:
            fullResponse.substring(0, 500) +
            (fullResponse.length > 500 ? "..." : ""),
          toolCallsProcessed: Array.from(currentToolCalls.values()),
          timestamp: new Date().toISOString(),
        });

        // Return object with content, truncation info, and usage
        return {
          content: fullResponse,
          finishReason: finishReason || "stop",
          wasTruncated,
          usage,
        };
      } catch (error) {
        console.error("[OpenAI] Responses API ERROR:", error);
        this.writeDebugLog("stream_error", {
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString(),
        });
        throw new Error(`OpenAI Error: ${error.message}`);
      }
    } else {
      // Use Chat Completions API (existing implementation)
      console.log("[OpenAI] Using Chat Completions API (streaming)");

      const args = {
        model,
        messages,
      };

      if (model.includes("gpt-5")) {
        args.max_completion_tokens = maxTokens;
      } else {
        args.max_tokens = maxTokens;
        args.temperature = temperature;
      }

      // Add tools if provided
      if (tools && tools.length > 0) {
        args.tools = tools;
        args.tool_choice = "auto";
        console.log(`[OpenAI] Chat Completions - Adding ${tools.length} tools`);
      }

      this.writeDebugLog("stream_request", {
        api: "chat_completions",
        model,
        useResponsesAPI: false,
        toolCount: tools?.length || 0,
        args: {
          ...args,
          messages: `[${messages.length} messages]`,
        },
        fullMessages: messages,
        timestamp: new Date().toISOString(),
      });

      try {
        const stream = await this.client.chat.completions.create({
          ...args,
          stream: true,
          stream_options: { include_usage: true },
        });

        let fullResponse = "";
        let currentToolCall = null;
        let usage = null;
        let finishReason = "stop";

        for await (const chunk of stream) {
          // Capture usage from final chunk (requires stream_options.include_usage)
          if (chunk.usage) {
            usage = chunk.usage;
          }

          // Track finish reason
          if (chunk.choices?.[0]?.finish_reason) {
            finishReason = chunk.choices[0].finish_reason;
          }

          const delta = chunk.choices?.[0]?.delta;

          if (delta?.content) {
            fullResponse += delta.content;
            onChunk(delta.content);
          }

          if (delta?.tool_calls) {
            for (const toolCall of delta.tool_calls) {
              if (
                !currentToolCall ||
                toolCall.index !== currentToolCall.index
              ) {
                if (currentToolCall && onToolCall) {
                  try {
                    const args = JSON.parse(currentToolCall.function.arguments);
                    await onToolCall(
                      currentToolCall.function.name,
                      args,
                      currentToolCall.id
                    );
                  } catch (e) {
                    console.error(
                      "[OpenAI] Failed to parse tool arguments:",
                      e
                    );
                  }
                }

                currentToolCall = {
                  id: toolCall.id || `call_${Date.now()}`,
                  index: toolCall.index,
                  function: {
                    name: toolCall.function?.name || "",
                    arguments: toolCall.function?.arguments || "",
                  },
                };
              } else {
                if (toolCall.function?.arguments) {
                  currentToolCall.function.arguments +=
                    toolCall.function.arguments;
                }
              }
            }
          }

          if (
            chunk.choices[0]?.finish_reason === "tool_calls" &&
            currentToolCall &&
            onToolCall
          ) {
            try {
              const args = JSON.parse(currentToolCall.function.arguments);
              console.log(
                `[OpenAI] Executing tool: ${currentToolCall.function.name}`
              );
              await onToolCall(
                currentToolCall.function.name,
                args,
                currentToolCall.id
              );
            } catch (e) {
              console.error("[OpenAI] Failed to parse tool arguments:", e);
            }
            currentToolCall = null;
          }
        }

        this.writeDebugLog("stream_response", {
          api: "chat_completions",
          model,
          finishReason,
          usage,
          fullResponse:
            fullResponse.substring(0, 500) +
            (fullResponse.length > 500 ? "..." : ""),
          timestamp: new Date().toISOString(),
        });

        // Return same format as Responses API for consistency
        return {
          content: fullResponse,
          finishReason,
          wasTruncated: finishReason === "length",
          usage,
        };
      } catch (error) {
        console.error("[OpenAI] API ERROR:", error);
        this.writeDebugLog("stream_error", {
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString(),
        });
        throw new Error(`OpenAI Error: ${error.status} ${error.message}`);
      }
    }
  }

  async validateApiKey() {
    try {
      await this.client.models.list();
      return true;
    } catch (error) {
      console.error("[OpenAI] API Validation ERROR:", error);
      return false;
    }
  }
}

module.exports = OpenAIProvider;
