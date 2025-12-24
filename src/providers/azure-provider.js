const BaseProvider = require("./base-provider");
const { AzureOpenAI } = require("openai");
const fs = require("fs");
const path = require("path");
const os = require("os");

class AzureProvider extends BaseProvider {
  constructor(config) {
    super(config);

    // Debug: log received config
    console.log("[Azure] Constructor received config:", {
      hasApiKey: !!config.apiKey,
      endpoint: config.endpoint,
      baseURL: config.baseURL,
      model: config.model,
      useResponsesAPI: config.useResponsesAPI,
    });

    // Azure OpenAI requires specific config
    this.apiVersion = config.apiVersion || "2024-08-01-preview";
    // Endpoint should be like: https://your-resource-name.openai.azure.com
    this.endpoint = config.endpoint || config.baseURL;
    // The deployment name (this is what you call in Azure, NOT the model name)
    this.deploymentName = config.model || config.deploymentName || "gpt-4";
    // Whether to use Responses API
    this.useResponsesAPI = config.useResponsesAPI || false;

    console.log("[Azure] Resolved values:", {
      hasApiKey: !!this.apiKey,
      endpoint: this.endpoint,
      deploymentName: this.deploymentName,
      useResponsesAPI: this.useResponsesAPI,
    });

    if (this.apiKey && this.endpoint) {
      // Use the AzureOpenAI client for Chat Completions API
      this.client = new AzureOpenAI({
        apiKey: this.apiKey,
        endpoint: this.endpoint,
        apiVersion: this.apiVersion,
        deployment: this.deploymentName,
      });
      console.log(
        `[Azure] Initialized with endpoint: ${this.endpoint}, deployment: ${this.deploymentName}`
      );
    } else {
      console.log(
        `[Azure] Missing apiKey (${!!this.apiKey}) or endpoint (${!!this
          .endpoint}) - client not initialized`
      );
    }

    this.defaultModel = this.deploymentName;

    // Debug logging setup - disabled by default for production
    this.debugDir = config.debugDir || path.join(os.homedir(), ".tinker-debug");
    this.enableDebugLogging = config.enableDebugLogging || false;
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

  /**
   * Check if model is a GPT-5 variant (needs max_completion_tokens instead of max_tokens)
   */
  isGpt5Model(model) {
    const modelLower = (model || "").toLowerCase();
    return modelLower.includes("gpt-5") || modelLower.includes("gpt5");
  }

  /**
   * Determine if we should use the Responses API
   */
  shouldUseResponsesAPI(model) {
    return this.useResponsesAPI || model.includes("codex");
  }

  /**
   * Convert messages to Responses API format
   */
  convertMessagesForResponsesAPI(messages) {
    return messages.map((msg) => {
      // Handle function_call and function_call_output (already in correct format)
      if (msg.type === "function_call" || msg.type === "function_call_output") {
        return msg;
      }

      if (msg.role === "system") {
        return msg;
      }

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

      if (msg.role === "user") {
        return {
          role: "user",
          content: [{ type: "input_text", text: msg.content }],
        };
      }

      // Pass through assistant messages unchanged
      if (msg.role === "assistant") {
        return msg;
      }

      return msg;
    });
  }

  /**
   * Convert tools to Responses API format
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

  async chat(messages, options = {}) {
    if (!this.client) throw new Error("Azure OpenAI not configured");

    const {
      model = this.defaultModel,
      temperature = 0.2,
      maxTokens = 4096,
    } = options;

    const useResponses = this.shouldUseResponsesAPI(model);

    if (useResponses) {
      // Use Responses API via REST
      try {
        const convertedMessages = this.convertMessagesForResponsesAPI(messages);
        const requestBody = {
          model,
          input: convertedMessages,
          max_output_tokens: maxTokens,
        };

        if (!this.isGpt5Model(model)) {
          requestBody.temperature = temperature;
        }

        const response = await fetch(`${this.endpoint}/openai/v1/responses`, {
          method: "POST",
          headers: {
            "api-key": this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || "Azure Responses API error");
        }

        const data = await response.json();

        // Extract text from Responses API output array
        if (data.output && Array.isArray(data.output)) {
          for (const item of data.output) {
            if (item.type === "message" && item.content) {
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

        return data.output_text || "";
      } catch (error) {
        console.error("[Azure] Responses API Error:", error);
        throw new Error(`Azure Responses API Error: ${error.message}`);
      }
    } else {
      // Use Chat Completions API
      try {
        const args = {
          model: model,
          messages,
        };

        if (this.isGpt5Model(model)) {
          args.max_completion_tokens = maxTokens;
        } else {
          args.max_tokens = maxTokens;
          args.temperature = temperature;
        }

        const response = await this.client.chat.completions.create(args);
        return response.choices[0].message.content;
      } catch (error) {
        console.error("Azure OpenAI API Error:", error);
        throw new Error(`Azure OpenAI Error: ${error.message}`);
      }
    }
  }

  async streamChat(messages, onChunk, options = {}) {
    if (!this.apiKey || !this.endpoint)
      throw new Error("Azure OpenAI not configured");

    const {
      model = this.defaultModel,
      temperature = 0.2,
      maxTokens = 4096,
      tools = null,
      onToolCall = null,
    } = options;

    const useResponses = this.shouldUseResponsesAPI(model);

    if (useResponses) {
      return this.streamChatWithResponsesAPI(messages, onChunk, {
        model,
        temperature,
        maxTokens,
        tools,
        onToolCall,
      });
    } else {
      return this.streamChatWithCompletionsAPI(messages, onChunk, {
        model,
        temperature,
        maxTokens,
        tools,
        onToolCall,
      });
    }
  }

  /**
   * Stream using Azure Responses API
   */
  async streamChatWithResponsesAPI(messages, onChunk, options) {
    const { model, temperature, maxTokens, tools, onToolCall } = options;

    try {
      const convertedMessages = this.convertMessagesForResponsesAPI(messages);

      const requestBody = {
        model,
        input: convertedMessages,
        max_output_tokens: maxTokens,
        stream: true,
      };

      if (!this.isGpt5Model(model)) {
        requestBody.temperature = temperature;
      }

      if (tools && tools.length > 0) {
        requestBody.tools = this.convertToolsForResponsesAPI(tools);
        requestBody.tool_choice = "auto";
      }

      this.writeDebugLog("responses_stream_request", {
        model,
        useResponsesAPI: true,
        toolCount: tools?.length || 0,
        timestamp: new Date().toISOString(),
      });

      const response = await fetch(`${this.endpoint}/openai/v1/responses`, {
        method: "POST",
        headers: {
          "api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json();
        this.writeDebugLog("responses_stream_error", {
          error,
          status: response.status,
          timestamp: new Date().toISOString(),
        });
        throw new Error(
          `${response.status} ${error.error?.message || "Unknown error"}`
        );
      }

      // Parse SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      let buffer = "";
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
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const eventType = parsed.type;

              // Track finish reason and usage
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

              // Handle text delta
              if (eventType === "response.output_text.delta") {
                const text = parsed.delta || "";
                if (text) {
                  fullResponse += text;
                  onChunk(text);
                }
              }

              // Handle tool call start
              if (eventType === "response.output_item.added") {
                const item = parsed.item;
                if (item?.type === "function_call") {
                  currentToolCalls.set(item.id || `call_${Date.now()}`, {
                    id: item.id,
                    name: item.name,
                    arguments: "",
                  });
                }
              }

              // Handle tool call arguments
              if (eventType === "response.function_call_arguments.delta") {
                const callId = parsed.call_id || parsed.item_id;
                if (currentToolCalls.has(callId)) {
                  currentToolCalls.get(callId).arguments += parsed.delta || "";
                }
              }

              // Handle tool call complete
              if (
                eventType === "response.function_call_arguments.done" &&
                onToolCall
              ) {
                const callId = parsed.call_id || parsed.item_id;
                if (currentToolCalls.has(callId)) {
                  const tc = currentToolCalls.get(callId);
                  try {
                    const args = JSON.parse(tc.arguments);
                    await onToolCall(tc.name, args, tc.id);
                  } catch (e) {
                    console.error("[Azure] Failed to parse tool arguments:", e);
                  }
                }
              }
            } catch (e) {
              // Skip malformed JSON
            }
          }
        }
      }

      const wasTruncated =
        finishReason === "length" || finishReason === "incomplete";

      this.writeDebugLog("responses_stream_response", {
        model,
        finishReason,
        wasTruncated,
        responseLength: fullResponse.length,
        timestamp: new Date().toISOString(),
      });

      return {
        content: fullResponse,
        finishReason,
        wasTruncated,
        usage,
      };
    } catch (error) {
      console.error("[Azure] Responses API Streaming Error:", error);
      this.writeDebugLog("responses_stream_error", {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      throw new Error(`Azure Responses API Streaming Error: ${error.message}`);
    }
  }

  /**
   * Stream using Azure Chat Completions API
   */
  async streamChatWithCompletionsAPI(messages, onChunk, options) {
    const { model, temperature, maxTokens, tools, onToolCall } = options;

    if (!this.client) throw new Error("Azure OpenAI not configured");

    const args = {
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (this.isGpt5Model(model)) {
      args.max_completion_tokens = maxTokens;
    } else {
      args.max_tokens = maxTokens;
      args.temperature = temperature;
    }

    if (tools && tools.length > 0) {
      args.tools = tools;
      args.tool_choice = "auto";
      console.log(`[Azure] Adding ${tools.length} tools`);
    }

    this.writeDebugLog("completions_stream_request", {
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
      let usage = null;

      for await (const chunk of stream) {
        // Capture usage from final chunk
        if (chunk.usage) {
          usage = chunk.usage;
        }

        const delta = chunk.choices[0]?.delta;
        const chunkFinishReason = chunk.choices[0]?.finish_reason;

        if (chunkFinishReason) {
          finishReason = chunkFinishReason;
        }

        if (delta?.content) {
          fullResponse += delta.content;
          onChunk(delta.content);
        }

        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            if (!currentToolCall || toolCall.index !== currentToolCall.index) {
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

      this.writeDebugLog("completions_stream_response", {
        model,
        finishReason,
        wasTruncated,
        responseLength: fullResponse.length,
        timestamp: new Date().toISOString(),
      });

      return {
        content: fullResponse,
        finishReason,
        wasTruncated,
        usage,
      };
    } catch (error) {
      console.error("Azure OpenAI Streaming Error:", error);
      this.writeDebugLog("completions_stream_error", {
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
