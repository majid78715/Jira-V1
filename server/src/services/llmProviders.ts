import axios from "axios";
import { AiConfig } from "../models/_types";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function callLlmProvider(
  config: AiConfig,
  messages: LlmMessage[]
): Promise<string> {
  switch (config.provider) {
    case "openai":
      return callOpenAI(config, messages);
    case "gemini":
      return callGemini(config, messages);
    case "claude":
      return callClaude(config, messages);
    case "local":
      if (config.localUrl) {
        return callLocal(config, messages);
      }
      throw new Error("Local provider selected but no URL configured");
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

async function callOpenAI(config: AiConfig, messages: LlmMessage[]): Promise<string> {
  if (!config.apiKey) throw new Error("OpenAI API key is missing");
  
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: config.modelName || "gpt-4-turbo",
        messages,
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json"
        }
      }
    );
    return response.data.choices[0]?.message?.content || "";
  } catch (error: any) {
    console.error("OpenAI API Error:", error.response?.data || error.message);
    throw new Error(`OpenAI Error: ${error.response?.data?.error?.message || error.message}`);
  }
}

async function callGemini(config: AiConfig, messages: LlmMessage[]): Promise<string> {
  if (!config.apiKey) throw new Error("Gemini API key is missing");
  
  const model = config.modelName || "gemini-pro";
  // Convert messages to Gemini format
  // Gemini uses "user" and "model" roles, and a different structure
  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  })).filter(m => m.role !== "system"); // Gemini often handles system prompts differently or via specific API fields, but for simple chat we might just prepend system to first user message

  // Prepend system message to the first user message if it exists
  const systemMsg = messages.find(m => m.role === "system");
  if (systemMsg && contents.length > 0) {
    contents[0].parts[0].text = `${systemMsg.content}\n\n${contents[0].parts[0].text}`;
  }

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`,
      {
        contents
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
    return response.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } catch (error: any) {
    console.error("Gemini API Error:", error.response?.data || error.message);
    throw new Error(`Gemini Error: ${error.response?.data?.error?.message || error.message}`);
  }
}

async function callClaude(config: AiConfig, messages: LlmMessage[]): Promise<string> {
  if (!config.apiKey) throw new Error("Claude API key is missing");

  const systemMsg = messages.find(m => m.role === "system");
  const userMessages = messages.filter(m => m.role !== "system");

  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: config.modelName || "claude-3-opus-20240229",
        max_tokens: 1024,
        system: systemMsg?.content,
        messages: userMessages
      },
      {
        headers: {
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        }
      }
    );
    return response.data.content[0]?.text || "";
  } catch (error: any) {
    console.error("Claude API Error:", error.response?.data || error.message);
    throw new Error(`Claude Error: ${error.response?.data?.error?.message || error.message}`);
  }
}

async function callLocal(config: AiConfig, messages: LlmMessage[]): Promise<string> {
  // Assumes OpenAI-compatible API (like Ollama, LM Studio, LocalAI)
  try {
    const response = await axios.post(
      `${config.localUrl}/chat/completions`,
      {
        model: config.modelName || "local-model",
        messages,
        temperature: 0.7
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
    return response.data.choices[0]?.message?.content || "";
  } catch (error: any) {
    console.error("Local LLM Error:", error.response?.data || error.message);
    throw new Error(`Local LLM Error: ${error.message}`);
  }
}
