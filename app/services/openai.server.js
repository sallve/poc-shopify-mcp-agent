/**
 * OpenAI Service
 * Manages interactions with the OpenAI Responses API and MCP tools
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
   * Streams a conversation with OpenAI using the Responses API and MCP tools
   * @param {Object} params - Stream parameters
   * @param {Array} params.messages - Conversation history (ignored, only latest user message is used)
   * @param {string} params.promptType - The type of system prompt to use
   * @param {Array} params.tools - Array of MCP tool server definitions (from MCPClient)
   * @param {Object} streamHandlers - Stream event handlers
   * @param {Function} streamHandlers.onText - Handles text chunks
   * @param {Function} streamHandlers.onMessage - Handles complete messages
   * @returns {Promise<Object>} The final message
   */
  const streamConversation = async ({
    messages,
    promptType = AppConfig.api.defaultPromptType,
    tools
  }, streamHandlers) => {
    // Get system prompt from configuration or use default
    const systemInstruction = getSystemPrompt(promptType);

    // Find the latest user message
    const lastUserMessage = [...messages].reverse().find(m => m.role === "user");
    const userInput = lastUserMessage ? lastUserMessage.content : "";

    // --- FIX: Map tools to valid MCP tool definitions for OpenAI Responses API ---
    // Only include tools with a valid server_url
    const mcpTools = (tools || [])
      .filter(tool => tool.server_url)
      .map(tool => ({
        type: "mcp",
        server_label: tool.server_label || "shopify",
        server_url: tool.server_url,
        require_approval: tool.require_approval || "never",
        ...(tool.headers ? { headers: tool.headers } : {})
      }));

    // Compose the input for the Responses API
    let input = userInput;
    if (systemInstruction) {
      input = `${systemInstruction}\n${userInput}`;
    }

    // Call the Responses API (no streaming yet, as streaming is not generally available for responses.create)
    const response = await openai.responses.create({
      model: AppConfig.api.defaultModel,
      tools: mcpTools,
      input
    });

    // Handle output
    if (streamHandlers.onText && response.output_text) {
      streamHandlers.onText(response.output_text);
    }
    if (streamHandlers.onMessage) {
      streamHandlers.onMessage({
        role: "assistant",
        content: response.output_text
      });
    }

    return {
      role: "assistant",
      content: response.output_text
    };
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
