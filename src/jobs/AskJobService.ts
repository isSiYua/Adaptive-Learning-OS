import { Notice } from "obsidian";
import { buildAskPrompt } from "../ask/AskPromptBuilder";
import {
  buildClarificationRebasePrompt,
  buildClarificationMergePrompt,
  createFallbackMergeProposal,
  parseClarificationMergeProposal,
  proposalPreviewMarkdown,
} from "../ask/ClarificationMergeProposal";
import { AnthropicCompatibleProvider } from "../ai/AnthropicCompatibleProvider";
import { OpenAICompatibleProvider } from "../ai/OpenAICompatibleProvider";
import { createAskJobId, createClarificationItemId } from "../utils/ids";
import { toLocalIsoString } from "../utils/dates";
import { stableHash } from "../utils/hash";
import type { AskJobStore } from "../storage/AskJobStore";
import type { ClarificationStore } from "../storage/ClarificationStore";
import type {
  AskJob,
  AskJobStatus,
  ClarificationItem,
  ClarificationRecord,
  LearningOsSettings,
  SelectionContext,
} from "../types";

type ApiProvider = OpenAICompatibleProvider | AnthropicCompatibleProvider;

export interface AskJobExistingTarget {
  clarificationId?: string;
  targetItemId?: string;
  record?: ClarificationRecord | null;
  visibleMarkdown?: string;
}

export interface AskJobServiceEvents {
  onChanged?: () => void;
  onReady?: (job: AskJob) => void;
}

export class AskJobService {
  private runningIds = new Set<string>();
  private waiters = new Map<string, Array<(job: AskJob) => void>>();

  constructor(
    private store: AskJobStore,
    private clarificationStore: ClarificationStore,
    private getSettings: () => LearningOsSettings,
    private events: AskJobServiceEvents = {}
  ) {}

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
  }): Promise<AskJob> {
    const settings = this.getSettings();
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
    const proposedItemId = createClarificationItemId(params.question || params.context.selectedText, now);
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
      model: settings.providerModel,
      prompt,
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
  }): Promise<AskJob> {
    const job = await this.createBackgroundJob(params);
    return new Promise((resolve) => {
      const waiters = this.waiters.get(job.id) ?? [];
      waiters.push(resolve);
      this.waiters.set(job.id, waiters);
    });
  }

  async retry(job: AskJob, userQuestion?: string): Promise<void> {
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
    await this.store.saveJob(
      {
        ...job,
        userQuestion: nextQuestion,
        prompt,
        status: "queued",
        updated: nowIso,
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

  async remerge(job: AskJob): Promise<void> {
    if (!job.rawAnswer) {
      await this.retry(job);
      return;
    }

    const settings = this.getSettings();
    const provider = this.createApiProvider(settings);
    const existingRecord = await this.existingRecordForJob(job);
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
    const provider = this.createApiProvider(settings);
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
        explanation: job.parsedAnswer?.suggested_takeaway || job.parsedAnswer?.key_answer || job.rawAnswer,
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

      const provider = this.createApiProvider(settings);
      const response = await provider.ask({
        userQuestion: current.userQuestion,
        selectedText: current.selectedText,
        context: this.contextFromJob(current),
        language: current.answerLanguage,
        responseStyle: "normal",
      });

      current = {
        ...current,
        rawAnswer: response.rawAnswer,
        parsedAnswer: {
          answer: response.rawAnswer,
          key_answer: response.keyAnswer,
          suggested_takeaway: response.suggestedTakeaway,
          mastery_signal: response.suggestedMasterySignal,
          review_needed: response.suggestedReviewNeeded,
        },
      };

      const existingRecord = await this.existingRecordForJob(current);
      const proposal = await this.createMergeProposal(current, existingRecord, provider, settings);
      const completed: AskJob = {
        ...current,
        status: "completed",
        updated: toLocalIsoString(),
        mergeProposal: {
          ...proposal,
          proposedVisibleMarkdown: proposalPreviewMarkdown({
            job: current,
            proposal,
            existingRecord,
            settings,
          }),
        },
        proposalVisibleMarkdownHash: stableHash(
          proposalPreviewMarkdown({
            job: current,
            proposal,
            existingRecord,
            settings,
          })
        ),
        error: undefined,
      };

      await this.store.saveJob(completed, "completed");
      this.events.onChanged?.();
      this.events.onReady?.(completed);
      this.resolveWaiters(completed);
    } catch (error) {
      const failed: AskJob = {
        ...current,
        status: "failed",
        updated: toLocalIsoString(),
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
    const explanation = job.parsedAnswer?.suggested_takeaway || job.parsedAnswer?.key_answer || job.rawAnswer || "";
    try {
      const prompt = buildClarificationMergePrompt({
        job,
        existingRecord,
        rawAnswer: job.rawAnswer ?? "",
        answerLanguage: settings.answerLanguage,
      });
      const rawProposal = await provider.completePrompt(prompt);
      return (
        parseClarificationMergeProposal(rawProposal) ??
        createFallbackMergeProposal({ job, existingRecord, explanation })
      );
    } catch {
      new Notice(
        settings.uiLanguage === "en"
          ? "AI merge failed. A safe fallback proposal was created."
          : "AI 合并失败，已生成安全的 fallback 建议。"
      );
      return createFallbackMergeProposal({ job, existingRecord, explanation });
    }
  }

  private async existingRecordForJob(job: AskJob): Promise<ClarificationRecord | null> {
    if (job.existingClarificationId) {
      return this.clarificationStore.readRecord(job.existingClarificationId);
    }
    return this.clarificationStore.findByNotePathAndSourceHash(job.notePath, job.sourceBlockHash);
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
      sourceSentenceTruncated: false,
      originalSelectionLength: job.selectedText.length,
    };
  }
}

export function buildSourceAnchorKey(params: {
  notePath: string;
  sourceBlockHash: string;
  headingPath: string[];
}): string {
  return `${params.notePath}#${params.sourceBlockHash}#${params.headingPath.join(">")}`;
}
