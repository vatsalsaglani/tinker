const { z } = require("zod");
const { getLogger } = require("./logger");

const logger = getLogger().child("TitleGenerator");

/**
 * TitleGenerator - LLM-based title generation for conversations
 * Uses the configured provider to generate descriptive titles for chats.
 */
class TitleGenerator {
  constructor(llmConnector) {
    this.llmConnector = llmConnector;

    // Zod schema for structured title output
    this.titleSchema = z.object({
      title: z
        .string()
        .max(50)
        .describe(
          "A short, descriptive title for the conversation (max 50 chars)"
        ),
    });
  }

  /**
   * Build the title generation prompt from messages
   * @param {Array} messages - First few messages from conversation
   * @returns {string} Formatted context for title generation
   */
  buildContext(messages) {
    return messages
      .map((msg) => {
        // Handle array content (multimodal)
        let text = "";
        if (Array.isArray(msg.content)) {
          text = msg.content
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join(" ");
        } else {
          text = msg.content;
        }

        // Truncate long content
        if (text.length > 500) {
          text = text.substring(0, 500) + "...";
        }

        return `${msg.role}: ${text}`;
      })
      .join("\n");
  }

  /**
   * Generate a title for a conversation
   * @param {Array} messages - First few messages from the conversation
   * @returns {Promise<string>} Generated title or default
   */
  async generateTitle(messages) {
    if (!messages || messages.length === 0) {
      return "New Chat";
    }

    try {
      const context = this.buildContext(messages);

      const systemPrompt = `You are a helpful assistant that generates short, descriptive titles for chat conversations.
Given the conversation context, generate a concise title (max 50 characters) that captures the main topic or intent.
The title should be clear and specific, not generic like "Chat" or "Discussion".
Respond with ONLY a JSON object in this format: {"title": "Your Title Here"}`;

      const userPrompt = `Generate a title for this conversation:\n\n${context}`;

      // Use a simple chat call (non-streaming)
      const response = await this.llmConnector.chat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        {
          maxTokens: 500, // Increased for reasoning models
          temperature: 0.3,
        }
      );

      // Parse the response
      const jsonMatch = response.match(/\{[\s\S]*"title"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          const validated = this.titleSchema.parse(parsed);
          return validated.title;
        } catch (parseError) {
          logger.info("[TitleGenerator] Parse error:", parseError.message);
        }
      }

      // Fallback: extract first line without JSON
      const cleanResponse = response.replace(/```json?|```/g, "").trim();
      if (cleanResponse.length > 0 && cleanResponse.length <= 50) {
        return cleanResponse;
      }

      return "New Chat";
    } catch (error) {
      logger.error("[TitleGenerator] Error generating title:", error.message);
      return "New Chat";
    }
  }

  /**
   * Check if provider is configured for title generation
   * @returns {boolean} True if LLM is available
   */
  isAvailable() {
    try {
      return !!this.llmConnector.getCurrentProvider();
    } catch {
      return false;
    }
  }
}

module.exports = TitleGenerator;
