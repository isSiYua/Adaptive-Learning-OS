import {
  createFallbackMergeProposal,
  primaryProposalSourceText,
  proposalPreviewMarkdown,
} from "../ask/ClarificationMergeProposal";
import { detectAskIntent, isGeneratedContentIntent } from "../ask/AskIntent";
import type {
  AskJob,
  ClarificationMergeProposal,
  ClarificationRecord,
  LearningOsSettings,
} from "../types";
import type { LiveClarificationState } from "./LiveClarificationState";

export function liveAwareProposalForState(params: {
  job: AskJob;
  liveState: LiveClarificationState;
  liveRecord: ClarificationRecord | null;
  settings: Pick<LearningOsSettings, "uiLanguage" | "answerLanguage">;
}): { proposal: ClarificationMergeProposal; existingRecord: ClarificationRecord | null; visible: string } | null {
  if (!params.job.mergeProposal) return null;

  if (params.liveState.kind === "block-deleted" || params.liveState.kind === "no-prior-block") {
    const proposal = createFallbackMergeProposal({
      job: {
        ...params.job,
        existingClarificationId: undefined,
        targetClarificationId: undefined,
        targetItemId: undefined,
      },
      existingRecord: null,
      explanation: primaryProposalSourceText(params.job),
    });
    return {
      proposal,
      existingRecord: null,
      visible: proposalPreviewMarkdown({
        job: params.job,
        proposal,
        existingRecord: null,
        settings: params.settings,
      }),
    };
  }

  if (params.liveState.kind === "item-deleted") {
    const proposal = createFallbackMergeProposal({
      job: {
        ...params.job,
        targetItemId: undefined,
      },
      existingRecord: params.liveRecord,
      explanation: primaryProposalSourceText(params.job),
    });
    return {
      proposal,
      existingRecord: params.liveRecord,
      visible: proposalPreviewMarkdown({
        job: params.job,
        proposal,
        existingRecord: params.liveRecord,
        settings: params.settings,
      }),
    };
  }

  return {
    proposal: params.job.mergeProposal,
    existingRecord: params.liveRecord,
    visible: proposalPreviewMarkdown({
      job: params.job,
      proposal: params.job.mergeProposal,
      existingRecord: params.liveRecord,
      settings: params.settings,
    }),
  };
}

export function sourceDeletedApplyPolicy(params: {
  job: AskJob;
  liveState: LiveClarificationState;
  uiLanguage: LearningOsSettings["uiLanguage"];
}): { warning?: string; applyDisabledReason?: string } {
  if (!sourceIsDeleted(params.liveState)) return {};

  const generated = isGeneratedContentIntent(detectAskIntent(params.job.userQuestion));
  if (generated) {
    return {
      warning:
        params.uiLanguage === "en"
          ? "The original source block no longer exists. Generated content will be inserted at the end of the current heading section."
          : "原 source block 已不存在，生成内容将插入到当前标题区域末尾。",
    };
  }

  const warning =
    params.uiLanguage === "en"
      ? "The original source paragraph was deleted, so this explanation will not be inserted automatically."
      : "原文段落已被删除，因此这个解释不会自动插入到笔记中。";
  return { warning, applyDisabledReason: warning };
}

function sourceIsDeleted(state: LiveClarificationState): boolean {
  return (
    (state.kind === "block-deleted" || state.kind === "no-prior-block") &&
    state.sourceBlockStillExists === false
  );
}
