import { LLMProvider, LLMGenerateParams } from "./provider";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent";

export class GeminiProvider implements LLMProvider {
  name = "gemini";

  async generate(params: LLMGenerateParams): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${params.system}\n\n${params.user}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: params.temperature ?? 0.2,
      },
    };

    const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Gemini API error: ${errorText}`);
    }

    const json = await res.json();

    return (
      json.candidates?.[0]?.content?.parts?.[0]?.text ??
      "No response from Gemini"
    );
  }
}
