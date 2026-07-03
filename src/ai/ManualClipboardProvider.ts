import { buildAskPrompt } from "../ask/AskPromptBuilder";
import type { AiProvider } from "./AiProvider";
import type { AskRequest, AskResponse } from "../types";

export class ManualClipboardProvider implements AiProvider {
  id = "manual-clipboard";
  displayName = "Manual prompt";
  requiresApiKey = false;

  async ask(request: AskRequest): Promise<AskResponse> {
    return {
      rawAnswer: buildAskPrompt(request),
      keyAnswer: "",
      suggestedTakeaway: "",
      suggestedMasterySignal: "neutral",
      suggestedReviewNeeded: false,
    };
  }

  buildPrompt(request: AskRequest): string {
    return buildAskPrompt(request);
  }
}
