import type { AskModelChoice, AskModelRoutingSelection, LearningOsSettings, ModelRoutingMode } from "../types";

export interface AskModelRoute {
  requestedModel: AskModelChoice;
  selectedModel: string;
  modelRoutingMode: ModelRoutingMode;
  routingReason: string;
  rerunOfJobId?: string;
  shouldSuggestPro: boolean;
}

export function resolveAskModelRoute(params: {
  settings: LearningOsSettings;
  question: string;
  selection?: AskModelRoutingSelection;
}): AskModelRoute {
  const choice = params.selection?.choice ?? "auto";
  const complex = shouldSuggestProForQuestion(params.question);
  const defaultModel = params.settings.defaultAskModel || params.settings.providerModel;
  const deepModel = params.settings.deepAskModel || defaultModel;

  if (choice === "flash") {
    return {
      requestedModel: choice,
      selectedModel: defaultModel,
      modelRoutingMode: "manual",
      routingReason: "user-selected-flash",
      rerunOfJobId: params.selection?.rerunOfJobId,
      shouldSuggestPro: false,
    };
  }

  if (choice === "pro") {
    return {
      requestedModel: choice,
      selectedModel: deepModel,
      modelRoutingMode: "manual",
      routingReason: params.selection?.routingReason ?? "user-selected-pro",
      rerunOfJobId: params.selection?.rerunOfJobId,
      shouldSuggestPro: false,
    };
  }

  if (params.selection?.suggestedProDecision === "accepted") {
    return {
      requestedModel: choice,
      selectedModel: deepModel,
      modelRoutingMode: "suggest",
      routingReason: "suggested-pro-user-confirmed",
      rerunOfJobId: params.selection.rerunOfJobId,
      shouldSuggestPro: true,
    };
  }

  if (params.selection?.suggestedProDecision === "declined") {
    return {
      requestedModel: choice,
      selectedModel: defaultModel,
      modelRoutingMode: "suggest",
      routingReason: "suggested-pro-but-user-chose-flash",
      rerunOfJobId: params.selection.rerunOfJobId,
      shouldSuggestPro: true,
    };
  }

  return {
    requestedModel: choice,
    selectedModel: defaultModel,
    modelRoutingMode: params.settings.modelRoutingMode,
    routingReason: complex ? "suggest-pro-available-default-flash" : "default-flash-for-normal-ask",
    rerunOfJobId: params.selection?.rerunOfJobId,
    shouldSuggestPro: complex,
  };
}

export function shouldSuggestProForQuestion(question: string): boolean {
  const text = question.trim().toLowerCase();
  if (!text) return false;
  return /架构|重构|设计数据结构|schema|migration|bug|源码|全部代码|一致性|复杂|深入|严格检查|帮我找问题|性能|开销|长期方案|系统设计|数据库设计|迁移|回滚|并发|事务|索引|architecture|refactor|debug|source code|consistency|deep review|performance|system design|database design|transaction|rollback|concurrency|index/.test(
    text
  );
}
