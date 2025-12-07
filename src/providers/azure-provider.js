const BaseProvider = require("./base-provider");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const os = require("os");

class AzureProvider extends BaseProvider {
  constructor(config) {
    super(config);
    // Azure OpenAI requires specific config
    this.apiVersion = config.apiVersion || "2024-02-15-preview";
    this.endpoint = config.endpoint; // e.g. https://my-resource.openai.azure.com/

    if (this.apiKey && this.endpoint) {
      this.client = new OpenAI.default({
        apiKey: this.apiKey,
        baseURL: `${this.endpoint}/openai/deployments`,
        defaultQuery: { "api-version": this.apiVersion },
        defaultHeaders: { "api-key": this.apiKey },
      });
    }

    this.defaultModel = config.model || "gpt-4";

    // Debug logging setup
    this.debugDir = config.debugDir || path.join(os.homedir(), ".tinker-debug");
    this.enableDebugLogging = true;
  }

  getName() {
    return "Azure OpenAI";
  }

  getAvailableModels() {
    return ["gpt-4", "gpt-35-turbo", "gpt-4o", "gpt-4-turbo"];
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
      const filename = `azure_${prefix}_${timestamp}.json`;
      const filepath = path.join(this.debugDir, filename);

      fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf8");
      console.log(`[Azure DEBUG] Wrote log to: ${filepath}`);
    } catch (error) {
      console.error("[Azure DEBUG] Failed to write log file:", error.message);
    }
  }

  async chat(messages, options = {}) {
    if (!this.client) throw new Error("Azure OpenAI not configured");

    const {
      model = this.defaultModel,
      temperature = 0.2,
      maxTokens = 4096,
    } = options;

    try {
      const response = await this.client.chat.completions.create({
        model: model,
        messages,
        max_tokens: maxTokens,
        temperature,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error("Azure OpenAI API Error:", error);
      throw new Error(`Azure OpenAI Error: ${error.message}`);
    }
  }

  async streamChat(messages, onChunk, options = {}) {
    if (!this.client) throw new Error("Azure OpenAI not configured");

    const {
      model = this.defaultModel,
      temperature = 0.2,
      maxTokens = 4096,
      tools = null,
      onToolCall = null,
    } = options;

    const args = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: true,
    };

    // Add tools if provided
    if (tools && tools.length > 0) {
      args.tools = tools;
      args.tool_choice = "auto";
      console.log(`[Azure] Adding ${tools.length} tools`);
    }

    this.writeDebugLog("stream_request", {
      model,
      toolCount: tools?.length || 0,
      messageCount: messages.length,
      timestamp: new Date().toISOString(),
    });

    try {
      const stream = await this.client.chat.completions.create(args);

      let fullResponse = "";
      let currentToolCall = null;
      let finishReason = "stop";

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        const chunkFinishReason = chunk.choices[0]?.finish_reason;

        if (chunkFinishReason) {
          finishReason = chunkFinishReason;
        }

        // Handle text content
        if (delta?.content) {
          fullResponse += delta.content;
          onChunk(delta.content);
        }

        // Handle tool calls
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
                  console.error("[Azure] Failed to parse tool arguments:", e);
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
            } else {
              if (toolCall.function?.arguments) {
                currentToolCall.function.arguments +=
                  toolCall.function.arguments;
              }
            }
          }
        }

        // Process tool call on finish
        if (
          chunkFinishReason === "tool_calls" &&
          currentToolCall &&
          onToolCall
        ) {
          try {
            const args = JSON.parse(currentToolCall.function.arguments);
            console.log(
              `[Azure] Executing tool: ${currentToolCall.function.name}`
            );
            await onToolCall(
              currentToolCall.function.name,
              args,
              currentToolCall.id
            );
          } catch (e) {
            console.error("[Azure] Failed to parse tool arguments:", e);
          }
          currentToolCall = null;
        }
      }

      const wasTruncated = finishReason === "length";

      this.writeDebugLog("stream_response", {
        model,
        finishReason,
        wasTruncated,
        responseLength: fullResponse.length,
        timestamp: new Date().toISOString(),
      });

      // Return consistent format with OpenAI provider
      return {
        content: fullResponse,
        finishReason,
        wasTruncated,
      };
    } catch (error) {
      console.error("Azure OpenAI Streaming Error:", error);
      this.writeDebugLog("stream_error", {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      throw new Error(`Azure OpenAI Streaming Error: ${error.message}`);
    }
  }

  async validateApiKey() {
    if (!this.client) return false;
    try {
      await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5,
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = AzureProvider;
