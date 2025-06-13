/**
 * OpenAI Service
 * Manages interactions with the OpenAI API
 */
import OpenAI from "openai";
import AppConfig from "./config.server";
import systemPrompts from "../prompts/prompts.json";

/**
 * Creates an OpenAI service instance
 * @param {string} apiKey - OpenAI API key
 * @returns {Object} OpenAI service with methods for interacting with OpenAI API
 */
export function createOpenAIService(apiKey = process.env.OPENAI_API_KEY) {
  // Initialize OpenAI client (v4+)
  const openai = new OpenAI({ apiKey });

  /**
   * Streams a conversation with OpenAI
   * @param {Object} params - Stream parameters
   * @param {Array} params.messages - Conversation history
   * @param {string} params.promptType - The type of system prompt to use
   * @param {Array} params.tools - Available tools for OpenAI (functions)
   * @param {Object} streamHandlers - Stream event handlers
   * @param {Function} streamHandlers.onText - Handles text chunks
   * @param {Function} streamHandlers.onMessage - Handles complete messages
   * @param {Function} streamHandlers.onToolUse - Handles tool use requests (function calls)
   * @returns {Promise<Object>} The final message
   */
  const streamConversation = async ({
    messages,
    promptType = AppConfig.api.defaultPromptType,
    tools
  }, streamHandlers) => {
    // Get system prompt from configuration or use default
    const systemInstruction = getSystemPrompt(promptType);

    // Prepare OpenAI messages (prepend system prompt)
    const openaiMessages = [
      { role: "system", content: systemInstruction },
      ...messages
    ];

    // Prepare function definitions if tools are provided
    const functions = tools && tools.length > 0 ? tools : undefined;

    // Call OpenAI Chat Completion with streaming (v4+)
    const stream = await openai.chat.completions.create({
      model: AppConfig.api.defaultModel,
      max_tokens: AppConfig.api.maxTokens,
      messages: openaiMessages,
      stream: true,
      ...(functions ? { functions } : {})
    });

    let finalMessage = { role: "assistant", content: "" };

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) {
        finalMessage.content += delta.content;
        if (streamHandlers.onText) {
          streamHandlers.onText(delta.content);
        }
      }
      // Handle function call (tool use)
      if (delta?.function_call && streamHandlers.onToolUse) {
        streamHandlers.onToolUse(delta.function_call);
      }
    }

    if (streamHandlers.onMessage) {
      streamHandlers.onMessage(finalMessage);
    }
    return finalMessage;
  };

  /**
   * Gets the system prompt content for a given prompt type
   * @param {string} promptType - The prompt type to retrieve
   * @returns {string} The system prompt content
   */
  const getSystemPrompt = (promptType) => {
    return systemPrompts.systemPrompts[promptType]?.content ||
      systemPrompts.systemPrompts[AppConfig.api.defaultPromptType].content;
  };

  return {
    streamConversation,
    getSystemPrompt
  };
}

export default {
  createOpenAIService
};
