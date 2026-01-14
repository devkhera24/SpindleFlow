import { LLMProvider } from "./provider";
import { GeminiProvider } from "./gemini";

export function getLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER ?? "gemini";

  switch (provider) {
    case "gemini":
      return new GeminiProvider();
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}
