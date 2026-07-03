import { buildAskPrompt } from "../ask/AskPromptBuilder";
import { parseAiResponseOrFallback } from "../ask/AiResponseParser";
import type { AiProvider } from "./AiProvider";
import type { AskRequest, AskResponse, LearningOsSettings } from "../types";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export class OpenAICompatibleProvider implements AiProvider {
  id = "openai-compatible";
  displayName = "OpenAI-compatible";
  requiresApiKey = true;
  private settings: LearningOsSettings;

  constructor(settings: LearningOsSettings) {
    this.settings = settings;
  }

  async ask(request: AskRequest): Promise<AskResponse> {
    const prompt = buildAskPrompt(request);
    const content = await this.completePrompt(prompt);
    const parsed = parseAiResponseOrFallback(content);

    return {
      rawAnswer: parsed.answer,
      keyAnswer: parsed.keyAnswer,
      suggestedTakeaway: parsed.suggestedTakeaway,
      suggestedMasterySignal: parsed.masterySignal,
      suggestedReviewNeeded: parsed.reviewNeeded,
    };
  }

  async completePrompt(prompt: string): Promise<string> {
    if (!this.settings.providerApiKey.trim()) {
      throw new Error("No API key configured.");
    }

    const response = await fetch(this.endpointUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.settings.providerApiKey}`,
      },
      body: JSON.stringify({
        model: this.settings.providerModel,
        temperature: this.settings.providerTemperature,
        max_tokens: this.settings.providerMaxTokens,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Provider returned ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as ChatCompletionResponse;
    return json.choices?.[0]?.message?.content ?? "";
  }

  private endpointUrl(): string {
    const baseUrl = this.settings.providerBaseUrl.replace(/\/+$/, "");
    const path = this.settings.providerChatCompletionsPath.startsWith("/")
      ? this.settings.providerChatCompletionsPath
      : `/${this.settings.providerChatCompletionsPath}`;
    return `${baseUrl}${path}`;
  }
}
