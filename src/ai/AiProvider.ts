import type { AskRequest, AskResponse } from "../types";

export interface AiProvider {
  id: string;
  displayName: string;
  requiresApiKey: boolean;
  ask(request: AskRequest): Promise<AskResponse>;
}
