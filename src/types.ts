export type MasterySignal = "neutral" | "weak" | "resolved";

export type AskCardStatus = "draft" | "resolved" | "uncompressed";
export type ClarificationInsertionStyle = "callout-collapsed" | "inline" | "hidden-only";
export type ProviderMode = "manual" | "openai-compatible" | "anthropic-compatible" | "custom";
export type ProviderPreset = "openai" | "deepseek" | "glm-zhipu" | "openrouter" | "claude" | "custom";
export type FollowUpUpdateMode = "ai-merge" | "append" | "replace";
export type UiLanguage = "zh" | "en";
export type AnswerLanguage = "auto" | "zh" | "en";
export type AskJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "applied"
  | "archived";

export interface LearningOsSettings {
  schemaVersion: number;
  dataFolder: string;
  defaultLanguage: string;
  uiLanguage: UiLanguage;
  answerLanguage: AnswerLanguage;
  maxSelectedTextChars: number;
  maxContextBeforeChars: number;
  maxContextAfterChars: number;
  insertMode: "after-paragraph" | "cursor";
  storeFullAnswerInLog: boolean;
  storeFullAnswerInNote: boolean;
  showPromptPreview: boolean;
  clarificationInsertionStyle: ClarificationInsertionStyle;
  showQuestionInVisibleClarification: boolean;
  providerMode: ProviderMode;
  providerPreset: ProviderPreset;
  providerBaseUrl: string;
  providerChatCompletionsPath: string;
  providerMessagesPath: string;
  providerModel: string;
  providerApiKey: string;
  providerTemperature: number;
  providerMaxTokens: number;
  previewPromptBeforeSend: boolean;
  maxConcurrentAskJobs: number;
}

export interface SelectionContext {
  notePath: string;
  noteTitle: string;
  selectedText: string;
  headingPath: string[];
  currentHeading: string | null;
  parentHeading: string | null;
  nearbyBefore: string;
  nearbyAfter: string;
  frontmatter: Record<string, unknown>;
  detectedConceptIds: string[];
  sourceBlock: string;
  sourceBlockHash: string;
  sourceStartOffset?: number;
  sourceEndOffset?: number;
  answerLanguage?: AnswerLanguage;
  sourceSentenceTruncated: boolean;
  originalSelectionLength: number;
}

export interface ClarificationRecord {
  schemaVersion: number;
  id: string;
  revision?: number;
  contentHash?: string;
  notePath: string;
  sourceBlock: string;
  sourceBlockHash: string;
  sourceStartOffset?: number;
  sourceEndOffset?: number;
  headingPath: string[];
  detectedConcept?: string;
  language: AnswerLanguage;
  uiLanguage: UiLanguage;
  created: string;
  updated: string;
  items: ClarificationItem[];
  interactions: AskInteraction[];
}

export interface ClarificationItem {
  id: string;
  targetText: string;
  itemTitle: string;
  question: string;
  explanation: string;
  created: string;
  updated: string;
  relatedInteractionIds: string[];
}

export interface AskInteraction {
  id: string;
  type: "new-item" | "update-item" | "follow-up" | "merge";
  selectedText: string;
  question: string;
  rawAnswer: string;
  keyAnswer: string;
  suggestedExplanation: string;
  provider: string;
  model?: string;
  created: string;
}

export interface ClarificationUpdateDecision {
  action: "update-item" | "add-item";
  targetItemId: string | null;
  item: {
    targetText: string;
    itemTitle: string;
    explanation: string;
  };
  fullVisibleMarkdown: string;
  reason: string;
  language: UiLanguage;
}

export interface ClarificationMergeProposal {
  schemaVersion: number;
  action: "create-clarification" | "update-item" | "add-item" | "replace-item" | "append-item";
  clarificationId?: string;
  targetItemId?: string | null;
  operations?: ClarificationMergeOperation[];
  proposedItems: ClarificationItem[];
  proposedVisibleMarkdown: string;
  reasoning?: string;
  confidence?: "low" | "medium" | "high";
}

export interface ClarificationMergeOperation {
  op: "update-item" | "add-item";
  itemId: string;
  targetText: string;
  itemTitle: string;
  explanation: string;
}

export interface AskJob {
  schemaVersion: number;
  id: string;
  status: AskJobStatus;
  created: string;
  updated: string;
  notePath: string;
  headingPath: string[];
  selectedText: string;
  sourceBlock: string;
  sourceBlockHash: string;
  sourceAnchorKey?: string;
  sourceStartOffset?: number;
  sourceEndOffset?: number;
  detectedConcept?: string;
  existingClarificationId?: string;
  targetClarificationId?: string;
  targetItemId?: string;
  proposedItemId?: string;
  relatedItemIds?: string[];
  appliedClarificationId?: string;
  appliedItemIds?: string[];
  existingClarificationRecordPath?: string;
  existingVisibleMarkdown?: string;
  existingItemsSnapshot?: ClarificationItem[];
  baseClarificationRevision?: number;
  baseClarificationContentHash?: string;
  baseClarificationUpdated?: string;
  baseVisibleBlockHash?: string;
  baseLiveClarificationHash?: string;
  baseLiveItemHashes?: Record<string, string>;
  proposalVisibleMarkdownHash?: string;
  userQuestion: string;
  answerLanguage: AnswerLanguage;
  uiLanguage: UiLanguage;
  providerMode: string;
  providerPreset?: string;
  model?: string;
  prompt: string;
  rawAnswer?: string;
  parsedAnswer?: {
    answer?: string;
    key_answer?: string;
    suggested_takeaway?: string;
    mastery_signal?: MasterySignal;
    review_needed?: boolean;
  };
  mergeProposal?: ClarificationMergeProposal;
  error?: {
    message: string;
    code?: string;
    retryable?: boolean;
  };
}

export interface AskJobLogRecord {
  schemaVersion: number;
  id: string;
  status: AskJobStatus;
  updated: string;
  notePath: string;
  sourceBlockHash: string;
  type: "created" | "status" | "completed" | "failed" | "applied" | "archived" | "deleted";
}

export interface ClarificationLogRecord {
  schemaVersion: number;
  id: string;
  updated: string;
  notePath: string;
  sourceBlockHash: string;
  itemCount: number;
  interactionCount: number;
  type: "created" | "updated" | "saved-only";
}

export interface AskFollowUp {
  id: string;
  question: string;
  rawAnswer: string;
  keyAnswer: string;
  myTakeaway: string;
  mergeReason?: string;
  created: string;
}

export interface AskCardRecord {
  schemaVersion: number;
  id: string;
  concept?: string;
  notePath: string;
  sourceSentence: string;
  sourceSentenceTruncated?: boolean;
  originalSelectionLength?: number;
  question: string;
  rawAnswer: string;
  keyAnswer: string;
  myTakeaway: string;
  masterySignal: MasterySignal;
  reviewNeeded: boolean;
  created: string;
  updated: string;
  followUps: AskFollowUp[];
}

export interface AskRequest {
  userQuestion: string;
  selectedText: string;
  context: SelectionContext;
  language: string;
  responseStyle: "short" | "normal" | "detailed";
}

export interface AskResponse {
  rawAnswer: string;
  keyAnswer: string;
  suggestedTakeaway: string;
  suggestedMasterySignal: MasterySignal;
  suggestedReviewNeeded: boolean;
}

export interface AskCard {
  schemaVersion: number;
  id: string;
  concept: string;
  status: AskCardStatus;
  source_sentence: string;
  question: string;
  key_answer: string;
  my_takeaway: string;
  mastery_signal: MasterySignal;
  review_needed: boolean;
  created: string;
  full_answer?: string;
  fields?: Record<string, string | boolean | number>;
}

export interface ParsedAskCard {
  card: Partial<AskCard>;
  raw: string;
  startIndex: number;
  endIndex: number;
  errors: string[];
  fields: Record<string, string | boolean | number>;
}

export interface AskCardLogRecord {
  schemaVersion: number;
  id: string;
  created?: string;
  updated: string;
  notePath?: string;
  concept?: string;
  sourceSentence?: string;
  question: string;
  myTakeaway: string;
  masterySignal: MasterySignal;
  reviewNeeded: boolean;
  type: "created" | "follow-up" | "legacy-converted" | "saved-only";
}
