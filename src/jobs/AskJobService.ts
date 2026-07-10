import { buildAskPrompt } from "../ask/AskPromptBuilder";
import {
  buildClarificationRebasePrompt,
  buildClarificationMergePrompt,
  createFallbackMergeProposal,
  normalizeProposalForAskIntent,
  parseClarificationMergeProposal,
  primaryProposalSourceText,
  proposalPreviewMarkdown,
} from "../ask/ClarificationMergeProposal";
import { AnthropicCompatibleProvider } from "../ai/AnthropicCompatibleProvider";
import { resolveAskModelRoute } from "../ai/ModelRouting";
import { OpenAICompatibleProvider } from "../ai/OpenAICompatibleProvider";
import { createAskJobId, createClarificationItemId } from "../utils/ids";
import { toLocalIsoString } from "../utils/dates";
import { stableHash } from "../utils/hash";
import type { AskJobStore } from "../storage/AskJobStore";
import type { ClarificationStore } from "../storage/ClarificationStore";
import type {
  AskJob,
  AskJobStatus,
  AskModelRoutingSelection,
  ClarificationItem,
  ClarificationMergeProposal,
  ClarificationRecord,
  LearningOsSettings,
  SelectionContext,
} from "../types";

type ApiProvider = OpenAICompatibleProvider | AnthropicCompatibleProvider;

export interface AskJobLiveMergeContext {
  existingRecord: ClarificationRecord | null;
  currentVisibleMarkdown?: string;
  reviewWarning?: string;
  applyDisabledReason?: string;
}

export interface AskJobExistingTarget {
  clarificationId?: string;
  targetItemId?: string;
  record?: ClarificationRecord | null;
  visibleMarkdown?: string;
}

export interface AskJobServiceEvents {
  onChanged?: () => void;
  onReady?: (job: AskJob) => void;
  onNotice?: (message: string) => void;
  resolveLiveMergeContext?: (job: AskJob) => Promise<AskJobLiveMergeContext | null>;
}

export class AskJobService {
  private runningIds = new Set<string>();
  private waiters = new Map<string, Array<(job: AskJob) => void>>();
  private store: AskJobStore;
  private clarificationStore: ClarificationStore;
  private getSettings: () => LearningOsSettings;
  private events: AskJobServiceEvents;

  constructor(
    store: AskJobStore,
    clarificationStore: ClarificationStore,
    getSettings: () => LearningOsSettings,
    events: AskJobServiceEvents = {}
  ) {
    this.store = store;
    this.clarificationStore = clarificationStore;
    this.getSettings = getSettings;
    this.events = events;
  }

  async initialize(): Promise<void> {
    const jobs = await this.store.listJobs();
    const nowIso = toLocalIsoString();
    for (const job of jobs.filter((item) => item.status === "running")) {
      await this.store.saveJob(
        {
          ...job,
          status: "failed",
          updated: nowIso,
          error: {
            message: "interrupted",
            code: "interrupted",
            retryable: true,
          },
        },
        "failed"
      );
    }
    this.events.onChanged?.();
  }

  async createBackgroundJob(params: {
    context: SelectionContext;
    question: string;
    existing?: AskJobExistingTarget;
    modelSelection?: AskModelRoutingSelection;
  }): Promise<AskJob> {
    const settings = this.getSettings();
    const sourceValidationError = validateSelectedLearningOsSource(params.context, settings.uiLanguage);
    if (sourceValidationError) {
      this.events.onNotice?.(sourceValidationError);
      throw new Error(sourceValidationError);
    }
    const now = new Date();
    const nowIso = toLocalIsoString(now);
    const prompt = buildAskPrompt({
      userQuestion: params.question,
      selectedText: params.context.selectedText,
      context: { ...params.context, answerLanguage: settings.answerLanguage },
      language: settings.answerLanguage,
      responseStyle: "normal",
    });
    const id = createAskJobId(now);
    const sourceAnchorKey = buildSourceAnchorKey({
      notePath: params.context.notePath,
      sourceBlockHash: params.context.sourceBlockHash,
      headingPath: params.context.headingPath,
    });
    const duplicate = await this.findDuplicateJob({
      notePath: params.context.notePath,
      sourceAnchorKey,
      question: params.question,
      selectedText: params.context.selectedText,
    });
    if (duplicate) {
      this.events.onNotice?.(
        settings.uiLanguage === "en"
          ? "This question already exists in Learning OS Inbox."
          : "这个问题已经在 Learning OS 收件箱中。"
      );
      this.events.onChanged?.();
      return duplicate;
    }
    const proposedItemId = createClarificationItemId(params.question || params.context.selectedText, now);
    const modelRoute = resolveAskModelRoute({
      settings,
      question: params.question,
      selection: params.modelSelection,
    });
    const job: AskJob = {
      schemaVersion: 1,
      id,
      status: "queued",
      created: nowIso,
      updated: nowIso,
      notePath: params.context.notePath,
      headingPath: params.context.headingPath,
      selectedText: params.context.selectedText,
      sourceBlock: params.context.sourceBlock,
      sourceBlockHash: params.context.sourceBlockHash,
      sourceAnchorKey,
      sourceStartOffset: params.context.sourceStartOffset,
      sourceEndOffset: params.context.sourceEndOffset,
      detectedConcept: params.context.detectedConceptIds[0],
      existingClarificationId: params.existing?.clarificationId,
      targetClarificationId: params.existing?.clarificationId,
      targetItemId: params.existing?.targetItemId,
      askSourceMode: params.context.askSourceMode,
      selectedLearningOsItem: params.context.selectedLearningOsItem,
      siblingLearningOsItems: params.context.siblingLearningOsItems,
      proposedItemId,
      existingClarificationRecordPath: params.existing?.clarificationId
        ? this.clarificationStore.recordPathForId(params.existing.clarificationId)
        : undefined,
      existingVisibleMarkdown: params.existing?.visibleMarkdown,
      existingItemsSnapshot: params.existing?.record?.items,
      baseClarificationRevision: params.existing?.record?.revision,
      baseClarificationContentHash: params.existing?.record?.contentHash,
      baseClarificationUpdated: params.existing?.record?.updated,
      baseVisibleBlockHash: params.existing?.visibleMarkdown
        ? stableHash(params.existing.visibleMarkdown)
        : undefined,
      baseLiveClarificationHash: params.existing?.visibleMarkdown
        ? stableHash(params.existing.visibleMarkdown)
        : undefined,
      baseLiveItemHashes: params.existing?.record
        ? Object.fromEntries(params.existing.record.items.map((item) => [item.id, stableHash(item.explanation)]))
        : undefined,
      userQuestion: params.question,
      answerLanguage: settings.answerLanguage,
      uiLanguage: settings.uiLanguage,
      providerMode: settings.providerMode,
      providerPreset: settings.providerPreset,
      model: modelRoute.selectedModel,
      requestedModel: modelRoute.requestedModel,
      selectedModel: modelRoute.selectedModel,
      modelRoutingMode: modelRoute.modelRoutingMode,
      routingReason: modelRoute.routingReason,
      rerunOfJobId: modelRoute.rerunOfJobId,
      prompt,
      processingStage: "queued",
      timingDiagnostics: {
        queuedAt: nowIso,
      },
    };

    await this.store.saveJob(job, "created");
    this.events.onChanged?.();
    void this.processQueue();
    return job;
  }

  async createJobAndWait(params: {
    context: SelectionContext;
    question: string;
    existing?: AskJobExistingTarget;
    modelSelection?: AskModelRoutingSelection;
  }): Promise<AskJob> {
    const job = await this.createBackgroundJob(params);
    return new Promise((resolve) => {
      const waiters = this.waiters.get(job.id) ?? [];
      waiters.push(resolve);
      this.waiters.set(job.id, waiters);
    });
  }

  async retry(job: AskJob, userQuestion?: string, modelSelection?: AskModelRoutingSelection): Promise<void> {
    const nowIso = toLocalIsoString();
    const nextQuestion = userQuestion?.trim() || job.userQuestion;
    const settings = this.getSettings();
    const prompt = buildAskPrompt({
      userQuestion: nextQuestion,
      selectedText: job.selectedText,
      context: this.contextFromJob(job),
      language: settings.answerLanguage,
      responseStyle: "normal",
    });
    const modelRoute = resolveAskModelRoute({
      settings,
      question: nextQuestion,
      selection:
        modelSelection ??
        ({
          choice: job.requestedModel ?? "auto",
          rerunOfJobId: job.rerunOfJobId,
        } satisfies AskModelRoutingSelection),
    });
    await this.store.saveJob(
      {
        ...job,
        userQuestion: nextQuestion,
        prompt,
        model: modelRoute.selectedModel,
        requestedModel: modelRoute.requestedModel,
        selectedModel: modelRoute.selectedModel,
        modelRoutingMode: modelRoute.modelRoutingMode,
        routingReason: modelRoute.routingReason,
        rerunOfJobId: modelRoute.rerunOfJobId,
        status: "queued",
        updated: nowIso,
        processingStage: "queued",
        timingDiagnostics: withTiming(
          {
            ...(job.timingDiagnostics ?? {}),
            retryCount: (job.timingDiagnostics?.retryCount ?? 0) + 1,
            retryReason: "manual-retry",
            lastRetryAt: nowIso,
          },
          { queuedAt: nowIso }
        ),
        rawAnswer: undefined,
        parsedAnswer: undefined,
        mergeProposal: undefined,
        error: undefined,
      },
      "status"
    );
    this.events.onChanged?.();
    void this.processQueue();
  }

  async archive(job: AskJob): Promise<void> {
    await this.setStatus(job, "archived", "archived");
  }

  async remerge(job: AskJob, liveContext?: AskJobLiveMergeContext | null): Promise<void> {
    if (!job.rawAnswer) {
      await this.retry(job);
      return;
    }

    const settings = this.getSettings();
    const provider = this.createApiProvider(this.settingsForJob(settings, job));
    const resolvedLiveContext = liveContext === undefined ? (await this.events.resolveLiveMergeContext?.(job)) ?? null : liveContext;
    const existingRecord = resolvedLiveContext ? resolvedLiveContext.existingRecord : await this.existingRecordForJob(job);
    const proposal = await this.createMergeProposal(job, existingRecord, provider, settings);
    const visible = proposalPreviewMarkdown({
      job,
      proposal,
      existingRecord,
      settings,
    });
    await this.store.saveJob(
      {
        ...job,
        status: "completed",
        updated: toLocalIsoString(),
        mergeProposal: {
          ...proposal,
          proposedVisibleMarkdown: visible,
        },
        baseClarificationRevision: existingRecord?.revision,
        baseClarificationContentHash: existingRecord?.contentHash,
        baseClarificationUpdated: existingRecord?.updated,
        proposalVisibleMarkdownHash: stableHash(visible),
        proposalDiagnostics: buildProposalDiagnostics({
          job,
          proposal,
          visible,
          applyDisabledReason: resolvedLiveContext?.applyDisabledReason,
        }),
        reviewWarning: resolvedLiveContext?.reviewWarning,
        applyDisabledReason: resolvedLiveContext?.applyDisabledReason,
        error: undefined,
      },
      "completed"
    );
    this.events.onChanged?.();
  }

  async rebase(
    job: AskJob,
    latestRecord: ClarificationRecord,
    currentVisibleMarkdown: string
  ): Promise<void> {
    if (!job.rawAnswer) {
      await this.retry(job);
      return;
    }

    const settings = this.getSettings();
    const provider = this.createApiProvider(this.settingsForJob(settings, job));
    const prompt = buildClarificationRebasePrompt({
      job,
      latestRecord,
      currentVisibleMarkdown,
      staleProposalMarkdown: job.mergeProposal?.proposedVisibleMarkdown ?? "",
      rawAnswer: job.rawAnswer,
      answerLanguage: settings.answerLanguage,
    });
    const rawProposal = await provider.completePrompt(prompt);
    const proposal =
      parseClarificationMergeProposal(rawProposal) ??
      createFallbackMergeProposal({
        job,
        existingRecord: latestRecord,
        explanation: primaryProposalSourceText(job),
      });
    const visible = proposalPreviewMarkdown({
      job,
      proposal,
      existingRecord: latestRecord,
      settings,
    });

    await this.store.saveJob(
      {
        ...job,
        status: "completed",
        updated: toLocalIsoString(),
        existingClarificationId: latestRecord.id,
        existingVisibleMarkdown: currentVisibleMarkdown,
        existingItemsSnapshot: latestRecord.items,
        baseClarificationRevision: latestRecord.revision,
        baseClarificationContentHash: latestRecord.contentHash,
        baseClarificationUpdated: latestRecord.updated,
        baseVisibleBlockHash: stableHash(currentVisibleMarkdown),
        proposalVisibleMarkdownHash: stableHash(visible),
        proposalDiagnostics: buildProposalDiagnostics({
          job,
          proposal,
          visible,
          applyDisabledReason: undefined,
        }),
        mergeProposal: {
          ...proposal,
          clarificationId: latestRecord.id,
          proposedVisibleMarkdown: visible,
        },
        error: undefined,
      },
      "completed"
    );
    this.events.onChanged?.();
  }

  async markApplied(job: AskJob): Promise<AskJob> {
    return this.setStatus(job, "applied", "applied");
  }

  async processQueue(): Promise<void> {
    const settings = this.getSettings();
    const maxConcurrent = Math.max(1, settings.maxConcurrentAskJobs || 2);
    const availableSlots = maxConcurrent - this.runningIds.size;
    if (availableSlots <= 0) return;

    const queued = (await this.store.listJobs()).filter((job) => job.status === "queued");
    for (const job of queued.slice(0, availableSlots)) {
      if (this.runningIds.has(job.id)) continue;
      this.runningIds.add(job.id);
      void this.runJob(job).finally(() => {
        this.runningIds.delete(job.id);
        void this.processQueue();
      });
    }
  }

  private async runJob(job: AskJob): Promise<void> {
    let current = await this.setStatus(job, "running", "status");
    try {
      const settings = this.getSettings();
      if (settings.providerMode === "manual" || settings.providerMode === "custom") {
        throw new Error("No API provider configured. Copy the prompt or configure a provider in settings.");
      }

      const provider = this.createApiProvider(this.settingsForJob(settings, current));
      current = {
        ...current,
        processingStage: "waiting-provider",
        timingDiagnostics: withTiming(current.timingDiagnostics, { providerRequestStartedAt: toLocalIsoString() }),
      };
      await this.store.saveJob(current, "status");
      const response = await provider.ask({
        userQuestion: current.userQuestion,
        selectedText: current.selectedText,
        context: this.contextFromJob(current),
        language: current.answerLanguage,
        responseStyle: "normal",
      });

      const providerResponseReceivedAt = toLocalIsoString();
      current = {
        ...current,
        processingStage: "parsing-answer",
        rawAnswer: response.rawAnswer,
        parsedAnswer: {
          answer: response.answer,
          key_answer: response.keyAnswer,
          suggested_takeaway: response.suggestedTakeaway,
          mastery_signal: response.suggestedMasterySignal,
          review_needed: response.suggestedReviewNeeded,
        },
        timingDiagnostics: withTiming(current.timingDiagnostics, {
          providerResponseReceivedAt,
          parseCompletedAt: providerResponseReceivedAt,
        }),
      };

      current = {
        ...current,
        processingStage: "building-proposal",
        timingDiagnostics: withTiming(current.timingDiagnostics, { proposalBuildStartedAt: toLocalIsoString() }),
      };
      await this.store.saveJob(current, "status");
      const liveContext = (await this.events.resolveLiveMergeContext?.(current)) ?? null;
      const existingRecord = liveContext ? liveContext.existingRecord : await this.existingRecordForJob(current);
      const proposal = await this.createMergeProposal(current, existingRecord, provider, settings);
      const visible = proposalPreviewMarkdown({
        job: current,
        proposal,
        existingRecord,
        settings,
      });
      const jobCompletedAt = toLocalIsoString();
      const completed: AskJob = {
        ...current,
        status: "completed",
        updated: jobCompletedAt,
        processingStage: "completed",
        mergeProposal: {
          ...proposal,
          proposedVisibleMarkdown: visible,
        },
        timingDiagnostics: withTiming(current.timingDiagnostics, {
          proposalBuildCompletedAt: jobCompletedAt,
          jobCompletedAt,
        }),
        proposalVisibleMarkdownHash: stableHash(visible),
        proposalDiagnostics: buildProposalDiagnostics({
          job: current,
          proposal,
          visible,
          applyDisabledReason: liveContext?.applyDisabledReason,
        }),
        reviewWarning: liveContext?.reviewWarning,
        applyDisabledReason: liveContext?.applyDisabledReason,
        error: undefined,
      };

      await this.store.saveJob(completed, "completed");
      this.events.onChanged?.();
      this.events.onReady?.(completed);
      this.resolveWaiters(completed);
    } catch (error) {
      const failedAt = toLocalIsoString();
      const failed: AskJob = {
        ...current,
        status: "failed",
        updated: failedAt,
        processingStage: "failed",
        timingDiagnostics: withTiming(current.timingDiagnostics, { jobCompletedAt: failedAt }),
        error: {
          message: error instanceof Error ? error.message : "Unknown AI error",
          retryable: true,
        },
      };
      await this.store.saveJob(failed, "failed");
      this.events.onChanged?.();
      this.resolveWaiters(failed);
    }
  }

  private async createMergeProposal(
    job: AskJob,
    existingRecord: ClarificationRecord | null,
    provider: ApiProvider,
    settings: LearningOsSettings
  ) {
    const explanation = primaryProposalSourceText(job);
    try {
      const prompt = buildClarificationMergePrompt({
        job,
        existingRecord,
        rawAnswer: job.rawAnswer ?? "",
        answerLanguage: settings.answerLanguage,
      });
      const rawProposal = await provider.completePrompt(prompt);
      const proposal =
        parseClarificationMergeProposal(rawProposal) ??
        createFallbackMergeProposal({ job, existingRecord, explanation });
      return normalizeProposalForAskIntent({ job, existingRecord, proposal, explanation });
    } catch {
      this.events.onNotice?.(
        settings.uiLanguage === "en"
          ? "AI merge failed. A safe fallback proposal was created."
          : "AI 合并失败，已生成安全的 fallback 建议。"
      );
      return normalizeProposalForAskIntent({
        job,
        existingRecord,
        proposal: createFallbackMergeProposal({ job, existingRecord, explanation }),
        explanation,
      });
    }
  }

  private async existingRecordForJob(job: AskJob): Promise<ClarificationRecord | null> {
    if (job.existingClarificationId) {
      return this.clarificationStore.readRecord(job.existingClarificationId);
    }
    return this.clarificationStore.findByNotePathAndSourceHash(job.notePath, job.sourceBlockHash);
  }

  private async findDuplicateJob(params: {
    notePath: string;
    sourceAnchorKey: string;
    question: string;
    selectedText: string;
  }): Promise<AskJob | null> {
    const normalizedQuestion = normalizeDuplicateKey(params.question);
    const normalizedSelection = normalizeDuplicateKey(params.selectedText);
    const jobs = await this.store.listJobs();
    return (
      jobs.find((job) => {
        if (["failed", "archived", "cancelled"].includes(job.status)) return false;
        return (
          job.notePath === params.notePath &&
          job.sourceAnchorKey === params.sourceAnchorKey &&
          normalizeDuplicateKey(job.userQuestion) === normalizedQuestion &&
          normalizeDuplicateKey(job.selectedText) === normalizedSelection
        );
      }) ?? null
    );
  }

  private async setStatus(
    job: AskJob,
    status: AskJobStatus,
    type: "status" | "applied" | "archived"
  ): Promise<AskJob> {
    const next = await this.store.updateStatus(job, status, toLocalIsoString(), type);
    this.events.onChanged?.();
    return next;
  }

  private settingsForJob(settings: LearningOsSettings, job: AskJob): LearningOsSettings {
    return {
      ...settings,
      providerModel: job.selectedModel ?? job.model ?? settings.providerModel,
    };
  }

  private createApiProvider(settings: LearningOsSettings): ApiProvider {
    if (settings.providerMode === "anthropic-compatible") {
      return new AnthropicCompatibleProvider(settings);
    }
    return new OpenAICompatibleProvider(settings);
  }

  private resolveWaiters(job: AskJob): void {
    const waiters = this.waiters.get(job.id) ?? [];
    this.waiters.delete(job.id);
    for (const resolve of waiters) resolve(job);
  }

  private contextFromJob(job: AskJob): SelectionContext {
    return {
      notePath: job.notePath,
      noteTitle: job.notePath.split("/").pop()?.replace(/\.md$/, "") ?? job.notePath,
      selectedText: job.selectedText,
      headingPath: job.headingPath,
      currentHeading: job.headingPath.at(-1) ?? null,
      parentHeading: job.headingPath.at(-2) ?? null,
      nearbyBefore: "",
      nearbyAfter: "",
      frontmatter: {},
      detectedConceptIds: job.detectedConcept ? [job.detectedConcept] : [],
      sourceBlock: job.sourceBlock,
      sourceBlockHash: job.sourceBlockHash,
      sourceStartOffset: job.sourceStartOffset,
      sourceEndOffset: job.sourceEndOffset,
      answerLanguage: job.answerLanguage,
      askSourceMode: job.askSourceMode,
      selectedLearningOsItem: job.selectedLearningOsItem,
      siblingLearningOsItems: job.siblingLearningOsItems,
      sourceSentenceTruncated: false,
      originalSelectionLength: job.selectedText.length,
    };
  }
}

function normalizeDuplicateKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function validateSelectedLearningOsSource(context: SelectionContext, uiLanguage: "zh" | "en"): string | null {
  if (context.askSourceMode !== "clarification-item" && context.askSourceMode !== "generated-content-item") {
    return null;
  }
  const selected = context.selectedLearningOsItem;
  if (!selected) {
    return locateSourceError(uiLanguage);
  }
  if (context.askSourceMode === "clarification-item" && !selected.containerId.startsWith("clar-")) {
    return locateSourceError(uiLanguage);
  }
  if (context.askSourceMode === "generated-content-item" && !selected.containerId.startsWith("gen-")) {
    return locateSourceError(uiLanguage);
  }
  const selectedText = context.selectedText.trim();
  const sourceText = `${selected.itemTitle}\n${selected.itemContent}`.trim();
  if (selectedText && !sourceText.includes(selectedText)) {
    return locateSourceError(uiLanguage);
  }
  if ((context.siblingLearningOsItems ?? []).some((item) => item.itemId === selected.itemId)) {
    return locateSourceError(uiLanguage);
  }
  return null;
}

function locateSourceError(uiLanguage: "zh" | "en"): string {
  return uiLanguage === "en"
    ? "Could not precisely locate the selected Learning OS item. Please reselect and try again."
    : "无法准确定位本次选中的 Learning OS item，请重新选择后重试。";
}

function withTiming(
  current: AskJob["timingDiagnostics"] | undefined,
  patch: AskJob["timingDiagnostics"]
): AskJob["timingDiagnostics"] {
  const next = { ...(current ?? {}), ...patch };
  const duration = (start?: string, end?: string): number | undefined => {
    if (!start || !end) return undefined;
    const value = Date.parse(end) - Date.parse(start);
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  };
  return {
    ...next,
    queueDurationMs: duration(next.queuedAt, next.providerRequestStartedAt) ?? next.queueDurationMs,
    providerDurationMs: duration(next.providerRequestStartedAt, next.providerResponseReceivedAt) ?? next.providerDurationMs,
    parseDurationMs: duration(next.providerResponseReceivedAt, next.parseCompletedAt) ?? next.parseDurationMs,
    proposalDurationMs: duration(next.proposalBuildStartedAt, next.proposalBuildCompletedAt) ?? next.proposalDurationMs,
    draftStageDurationMs: duration(next.draftStageStartedAt, next.draftStageCompletedAt) ?? next.draftStageDurationMs,
    totalDurationMs: duration(next.queuedAt, next.jobCompletedAt) ?? next.totalDurationMs,
  };
}

function buildProposalDiagnostics(params: {
  job: AskJob;
  proposal: ClarificationMergeProposal;
  visible: string;
  applyDisabledReason?: string;
}): AskJob["proposalDiagnostics"] {
  const editableMarkdownLength = params.visible.trim().length;
  const hasProposalItems = params.proposal.proposedItems.length > 0;
  const fallbackReason = params.proposal.reasoning?.toLowerCase().includes("fallback")
    ? params.proposal.reasoning
    : undefined;
  return {
    resolvedSourceMode: params.job.askSourceMode,
    resolvedTargetContainerId:
      params.proposal.clarificationId ?? params.proposal.generatedId ?? params.job.selectedLearningOsItem?.containerId,
    resolvedTargetItemId: params.proposal.targetItemId ?? params.job.targetItemId ?? params.job.selectedLearningOsItem?.itemId,
    resolvedOutputKind: params.proposal.action,
    proposalBuildOutcome: editableMarkdownLength > 0 || hasProposalItems ? "non-empty" : "empty",
    proposalFallbackUsed: Boolean(fallbackReason),
    proposalFallbackReason: fallbackReason,
    editableMarkdownLength,
    inlineDraftStageOutcome: params.job.inlineDraft?.status,
    applyDisabledReason: params.applyDisabledReason,
    applyabilitySource:
      params.job.inlineDraft?.status === "created" || params.job.inlineDraft?.status === "existing-live-draft"
        ? "live-draft"
        : editableMarkdownLength > 0 || hasProposalItems
          ? "proposal"
          : "none",
  };
}

export function buildSourceAnchorKey(params: {
  notePath: string;
  sourceBlockHash: string;
  headingPath: string[];
}): string {
  return `${params.notePath}#${params.sourceBlockHash}#${params.headingPath.join(">")}`;
}
