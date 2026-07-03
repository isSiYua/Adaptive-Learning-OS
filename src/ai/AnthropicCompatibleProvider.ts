import { buildAskPrompt } from "../ask/AskPromptBuilder";
import { parseAiResponseOrFallback } from "../ask/AiResponseParser";
import type { AiProvider } from "./AiProvider";
import type { AskRequest, AskResponse, LearningOsSettings } from "../types";

interface AnthropicMessageResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

export class AnthropicCompatibleProvider implements AiProvider {
  id = "anthropic-compatible";
  displayName = "Anthropic-compatible";
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
        "x-api-key": this.settings.providerApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.settings.providerModel,
        max_tokens: this.settings.providerMaxTokens,
        temperature: this.settings.providerTemperature,
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

    const json = (await response.json()) as AnthropicMessageResponse;
    return json.content?.find((part) => part.type === "text" || part.text)?.text ?? "";
  }

  private endpointUrl(): string {
    const baseUrl = this.settings.providerBaseUrl.replace(/\/+$/, "");
    const path = this.settings.providerMessagesPath.startsWith("/")
      ? this.settings.providerMessagesPath
      : `/${this.settings.providerMessagesPath}`;
    return `${baseUrl}${path}`;
  }
}
