const BaseProvider = require("./base-provider");
const AnthropicBedrock = require("@anthropic-ai/bedrock-sdk");
const fs = require("fs");
const path = require("path");
const os = require("os");

class BedrockProvider extends BaseProvider {
  constructor(config) {
    super(config);

    // AWS credentials
    this.awsAccessKey = config.awsAccessKey;
    this.awsSecretKey = config.awsSecretKey;
    this.awsRegion = config.awsRegion || "us-east-1";

    this.client = new AnthropicBedrock.default({
      awsAccessKey: this.awsAccessKey,
      awsSecretKey: this.awsSecretKey,
      awsRegion: this.awsRegion,
    });

    // Bedrock model IDs are longer, e.g., anthropic.claude-3-5-sonnet-20241022-v2:0
    this.defaultModel =
      config.model || "anthropic.claude-sonnet-4-20250514-v1:0";

    // Debug logging setup - disabled by default for production
    this.debugDir = config.debugDir || path.join(os.homedir(), ".tinker-debug");
    this.enableDebugLogging = config.enableDebugLogging || false;
  }

  getName() {
    return "Bedrock";
  }

  getAvailableModels() {
    return [
      "anthropic.claude-sonnet-4-20250514-v1:0",
      "anthropic.claude-3-5-sonnet-20241022-v2:0",
      "anthropic.claude-3-5-haiku-20241022-v1:0",
      "anthropic.claude-3-opus-20240229-v1:0",
      "anthropic.claude-3-sonnet-20240229-v1:0",
      "anthropic.claude-3-haiku-20240307-v1:0",
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
      const filename = `bedrock_${prefix}_${timestamp}.json`;
      const filepath = path.join(this.debugDir, filename);

      fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf8");
      console.log(`[Bedrock DEBUG] Wrote log to: ${filepath}`);
    } catch (error) {
      console.error("[Bedrock DEBUG] Failed to write log file:", error.message);
    }
  }

  /**
   * Convert OpenAI-style messages to Anthropic format (same as Anthropic provider)
   */
  convertMessages(messages) {
    const systemMessage = messages.find((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system");

    // Handle tool results in Anthropic format
    const convertedMessages = chatMessages.map((msg) => {
      // Handle function_call_output (Responses API format)
      if (msg.type === "function_call_output") {
        return {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.call_id,
              content: msg.output,
            },
          ],
        };
      }
      // Handle function_call (Responses API format)
      if (msg.type === "function_call") {
        return {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: msg.call_id,
              name: msg.name,
              input: JSON.parse(msg.arguments || "{}"),
            },
          ],
        };
      }
      // Handle standard tool calls format
      if (msg.role === "tool") {
        return {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.tool_call_id,
              content: msg.content,
            },
          ],
        };
      }

      // Handle user messages with images (convert from OpenAI format to Anthropic)
      if (msg.role === "user" && Array.isArray(msg.content)) {
        const convertedContent = msg.content.map((part) => {
          if (part.type === "text") {
            return part;
          }
          if (part.type === "image_url" && part.image_url?.url) {
            // Extract base64 data and media type from data URL
            const dataUrl = part.image_url.url;
            const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              const [, mediaType, base64Data] = match;
              return {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64Data,
                },
              };
            }
          }
          return part;
        });
        return { role: "user", content: convertedContent };
      }

      return msg;
    });

    return {
      system: systemMessage?.content || "",
      messages: convertedMessages,
    };
  }

  async chat(messages, options = {}) {
    const {
      model = this.defaultModel,
      temperature = 0.2,
      maxTokens = 8192,
    } = options;

    try {
      const { system, messages: chatMessages } = this.convertMessages(messages);

      const response = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: chatMessages,
      });

      return response.content[0].type === "text"
        ? response.content[0].text
        : "";
    } catch (error) {
      console.error("Bedrock API Error:", error);
      throw new Error(`Bedrock Error: ${error.message}`);
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

    try {
      const { system, messages: chatMessages } = this.convertMessages(messages);

      const requestParams = {
        model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: chatMessages,
        stream: true,
      };

      // Add tools if provided (Anthropic format)
      if (tools && tools.length > 0) {
        requestParams.tools = tools.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters,
        }));
        console.log(`[Bedrock] Adding ${tools.length} tools`);
      }

      this.writeDebugLog("stream_request", {
        model,
        region: this.awsRegion,
        toolCount: tools?.length || 0,
        messageCount: messages.length,
        timestamp: new Date().toISOString(),
      });

      const stream = await this.client.messages.create(requestParams);

      let fullResponse = "";
      let currentToolUse = null;
      let finishReason = "stop";

      for await (const chunk of stream) {
        // Track stop reason
        if (chunk.type === "message_delta" && chunk.delta?.stop_reason) {
          finishReason = chunk.delta.stop_reason;
        }

        // Handle text content
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "text_delta"
        ) {
          const content = chunk.delta.text || "";
          fullResponse += content;
          onChunk(content);
        }

        // Handle tool use start
        if (
          chunk.type === "content_block_start" &&
          chunk.content_block?.type === "tool_use"
        ) {
          currentToolUse = {
            id: chunk.content_block.id,
            name: chunk.content_block.name,
            input: "",
          };
        }

        // Handle tool input delta
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "input_json_delta" &&
          currentToolUse
        ) {
          currentToolUse.input += chunk.delta.partial_json;
        }

        // Handle tool use completion
        if (chunk.type === "content_block_stop" && currentToolUse) {
          try {
            const input = JSON.parse(currentToolUse.input);
            if (onToolCall) {
              console.log(`[Bedrock] Executing tool: ${currentToolUse.name}`);
              await onToolCall(currentToolUse.name, input, currentToolUse.id);
            }
          } catch (e) {
            console.error("[Bedrock] Failed to parse tool input:", e);
          }
          currentToolUse = null;
        }
      }

      // Map Anthropic stop reasons to our format
      const wasTruncated = finishReason === "max_tokens";
      const normalizedFinishReason =
        finishReason === "end_turn" ? "stop" : finishReason;

      this.writeDebugLog("stream_response", {
        model,
        region: this.awsRegion,
        finishReason: normalizedFinishReason,
        wasTruncated,
        responseLength: fullResponse.length,
        timestamp: new Date().toISOString(),
      });

      // Return consistent format with OpenAI provider
      return {
        content: fullResponse,
        finishReason: normalizedFinishReason,
        wasTruncated,
      };
    } catch (error) {
      console.error("Bedrock Streaming Error:", error);
      this.writeDebugLog("stream_error", {
        error: error.message,
        region: this.awsRegion,
        timestamp: new Date().toISOString(),
      });
      throw new Error(`Bedrock Streaming Error: ${error.message}`);
    }
  }

  async validateApiKey() {
    try {
      await this.client.messages.create({
        model: this.defaultModel,
        max_tokens: 10,
        messages: [{ role: "user", content: "Hi" }],
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = BedrockProvider;
