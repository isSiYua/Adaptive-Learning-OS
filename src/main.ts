import { MarkdownView, Notice, Plugin, TFile } from "obsidian";
import { AskModal } from "./ask/AskModal";
import { buildOrphanCleanupPlan, cleanupJobsForArchive, cleanupJobsForDelete } from "./cleanup/OrphanCleanup";
import { OrphanCleanupModal } from "./cleanup/OrphanCleanupModal";
import {
  buildClarificationBlock,
  findClarificationForSourceBlock,
  findClarificationNearSelection,
  parseLiveClarificationItemsFromBlock,
} from "./ask/ClarificationBlock";
import { convertLegacyAskCards } from "./ask/LegacyAskCardConverter";
import { parseAskCards } from "./ask/AskCardParser";
import { positionToOffset } from "./editor/MarkdownOffsets";
import { SelectionContextCollector } from "./editor/SelectionContextCollector";
import {
  detectAskSourceMode,
  getSemanticSourceBlockAtSelection,
  resolveOriginalProseContext,
} from "./editor/SourceBlock";
import { AskJobService } from "./jobs/AskJobService";
import { applyAskJobProposal } from "./jobs/ApplyAskJobProposal";
import {
  liveStateWarning,
  recordFromLiveClarificationState,
  resolveLiveClarificationState,
} from "./jobs/LiveClarificationState";
import { liveAwareProposalForState, sourceDeletedApplyPolicy } from "./jobs/LiveAwareMerge";
import { generatedContentMissingWarning } from "./ask/AskIntent";
import { DEFAULT_SETTINGS, LearningOsSettingTab } from "./settings";
import {
  backupKnowledgeData,
  exportKnowledgeDataSummary,
  initializeKnowledgeData,
  rebuildKnowledgeDataIndex,
  showKnowledgeDataSummary,
} from "./knowledge/KnowledgeCommands";
import { KnowledgeDb, saveKnowledgeDb } from "./knowledge/KnowledgeDb";
import { KnowledgeNoteSyncDebouncer, noteHasFinalLearningOsMarkers, syncKnowledgeDataForNote } from "./knowledge/KnowledgeSync";
import { AskJobStore } from "./storage/AskJobStore";
import { ClarificationStore } from "./storage/ClarificationStore";
import { FileStore } from "./storage/FileStore";
import { timestampSlug } from "./utils/dates";
import { ASK_INBOX_VIEW_TYPE, AskInboxView } from "./views/AskInboxView";
import type { Editor, Menu } from "obsidian";
import type { AskJob, AskModelRoutingSelection, LearningOsSettings, ProviderPreset, SelectionContext } from "./types";
import type { OrphanCleanupPlan } from "./cleanup/OrphanCleanup";
import type { ApplyAskJobProposalResult } from "./jobs/ApplyAskJobProposal";

export default class AdaptiveLearningOsPlugin extends Plugin {
  settings: LearningOsSettings = DEFAULT_SETTINGS;
  private fileStore!: FileStore;
  private clarificationStore!: ClarificationStore;
  private askJobStore!: AskJobStore;
  private askJobService!: AskJobService;
  private floatingAskButton: HTMLButtonElement | null = null;
  private knowledgeSyncDebouncer = new KnowledgeNoteSyncDebouncer();
  private knowledgeSyncQueue: Promise<void> = Promise.resolve();

  async onload(): Promise<void> {
    await this.loadSettings();
    this.refreshStores();

    this.addSettingTab(new LearningOsSettingTab(this.app, this));
    this.registerView(ASK_INBOX_VIEW_TYPE, (leaf) => new AskInboxView(leaf, this));
    this.addRibbonIcon("inbox", this.t("打开 Learning OS 收件箱", "Open Learning OS Inbox"), () => {
      void this.openAskInbox();
    });

    this.addCommand({
      id: "initialize-vault-folders",
      name: "Initialize vault folders",
      callback: async () => {
        await this.fileStore.ensureDataFolders();
        new Notice(`Learning OS folders ready in ${this.settings.dataFolder}.`);
      },
    });

    this.addCommand({
      id: "initialize-knowledge-data",
      name: "Learning OS: Initialize KnowledgeData",
      callback: () => {
        void initializeKnowledgeData(this.knowledgeCommandContext());
      },
    });

    this.addCommand({
      id: "rebuild-knowledge-data-index",
      name: "Learning OS: Rebuild KnowledgeData Index",
      callback: () => {
        void rebuildKnowledgeDataIndex(this.knowledgeCommandContext());
      },
    });

    this.addCommand({
      id: "export-knowledge-data-summary",
      name: "Learning OS: Export KnowledgeData Summary",
      callback: () => {
        void exportKnowledgeDataSummary(this.knowledgeCommandContext());
      },
    });

    this.addCommand({
      id: "show-knowledge-data-summary",
      name: "Learning OS: Show KnowledgeData Global Summary",
      callback: () => {
        void showKnowledgeDataSummary(this.knowledgeCommandContext());
      },
    });

    this.addCommand({
      id: "backup-knowledge-data",
      name: "Learning OS: Backup KnowledgeData",
      callback: () => {
        void backupKnowledgeData(this.knowledgeCommandContext());
      },
    });

    this.addCommand({
      id: "open-ask-inbox",
      name: "Learning OS: Open Ask Inbox",
      callback: () => {
        void this.openAskInbox();
      },
    });

    this.addCommand({
      id: "clean-unused-learning-os-data",
      name: "Learning OS: Clean unused Learning OS data / 清理未使用的 Learning OS 数据",
      callback: () => {
        void this.openOrphanCleanup();
      },
    });

    this.addCommand({
      id: "ask-ai-about-selected-text",
      name: "Ask AI about selected text",
      editorCallback: (editor, view) => {
        const markdownView =
          view instanceof MarkdownView ? view : this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!markdownView) {
          new Notice("Open a Markdown note before asking Learning OS.");
          return;
        }
        void this.openAskModal(editor, markdownView);
      },
    });

    this.addCommand({
      id: "extract-ask-cards-current-note",
      name: "Extract Ask Cards from current note",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return false;
        if (checking) return true;
        const parsed = parseAskCards(view.editor.getValue());
        const errors = parsed.reduce((count, card) => count + card.errors.length, 0);
        new Notice(`Found ${parsed.length} Ask Card${parsed.length === 1 ? "" : "s"} (${errors} parse issue${errors === 1 ? "" : "s"}).`);
        return true;
      },
    });

    this.addCommand({
      id: "convert-legacy-ask-card-blocks-current-note",
      name: "Convert legacy ASK_CARD blocks in current note",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.file) return false;
        if (checking) return true;
        void this.convertLegacyAskCardsInView(view);
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor, view: MarkdownView) => {
        const selectedText = editor.getSelection();
        if (!selectedText || selectedText.trim().length === 0) return;

        menu.addItem((item) => {
          item
            .setTitle("Ask Learning OS about selection")
            .setIcon("message-circle-question")
            .onClick(() => void this.openAskModal(editor, view));
        });
      })
    );
    this.registerSelectionAskButton();

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile) {
          this.queueKnowledgeDataNoteSync(file);
        }
      })
    );

    await this.askJobService.initialize();
    if (this.settings.enableKnowledgeData) {
      void this.ensureKnowledgeDataInitialized();
    }
  }

  onunload(): void {
    this.hideFloatingAskButton();
    this.knowledgeSyncDebouncer.clearAll();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.refreshStores();
  }

  applyProviderPreset(preset: ProviderPreset): void {
    this.settings.providerPreset = preset;
    if (preset === "openai") {
      this.settings.providerMode = "openai-compatible";
      this.settings.providerBaseUrl = "https://api.openai.com";
      this.settings.providerChatCompletionsPath = "/v1/chat/completions";
      this.settings.providerModel = "gpt-4.1-mini";
    }
    if (preset === "deepseek") {
      this.settings.providerMode = "openai-compatible";
      this.settings.providerBaseUrl = "https://api.deepseek.com";
      this.settings.providerChatCompletionsPath = "/chat/completions";
      this.settings.defaultAskModel = this.settings.defaultAskModel || "deepseek-v4-flash";
      this.settings.deepAskModel = this.settings.deepAskModel || "deepseek-v4-pro";
      this.settings.providerModel = this.settings.defaultAskModel;
    }
    if (preset === "glm-zhipu") {
      this.settings.providerMode = "openai-compatible";
      this.settings.providerBaseUrl = "https://open.bigmodel.cn";
      this.settings.providerChatCompletionsPath = "/api/paas/v4/chat/completions";
      this.settings.providerModel = "glm-4-flash";
    }
    if (preset === "openrouter") {
      this.settings.providerMode = "openai-compatible";
      this.settings.providerBaseUrl = "https://openrouter.ai";
      this.settings.providerChatCompletionsPath = "/api/v1/chat/completions";
      this.settings.providerModel = "openai/gpt-4.1-mini";
    }
    if (preset === "claude") {
      this.settings.providerMode = "anthropic-compatible";
      this.settings.providerBaseUrl = "https://api.anthropic.com";
      this.settings.providerMessagesPath = "/v1/messages";
      this.settings.providerModel = "claude-3-5-haiku-latest";
    }
  }

  t(zh: string, en: string): string {
    return this.settings.uiLanguage === "en" ? en : zh;
  }

  private refreshStores(): void {
    this.fileStore = new FileStore(this.app, this.settings.dataFolder);
    this.clarificationStore = new ClarificationStore(this.fileStore, this.settings.dataFolder);
    this.askJobStore = new AskJobStore(this.fileStore, this.settings.dataFolder);
    this.askJobService = new AskJobService(
      this.askJobStore,
      this.clarificationStore,
      () => this.settings,
      {
        onChanged: () => void this.refreshAskInboxViews(),
        onReady: () => {
          new Notice(this.t("Learning OS：有 1 条 AI 回答待处理。", "Learning OS: 1 AI answer is ready for review."));
        },
        onNotice: (message) => {
          new Notice(message);
        },
        resolveLiveMergeContext: (job) => this.resolveLiveMergeContext(job),
      }
    );
  }

  private knowledgeCommandContext() {
    return {
      app: this.app,
      fileStore: this.fileStore,
      dataFolder: this.settings.dataFolder,
      listAskJobs: () => this.askJobStore.listJobs(),
    };
  }

  private async ensureKnowledgeDataInitialized(): Promise<void> {
    try {
      const db = await KnowledgeDb.fromFileStore(this.fileStore, this.settings.dataFolder);
      await saveKnowledgeDb(this.fileStore, this.settings.dataFolder, db);
      db.close();
    } catch (error) {
      console.warn("Learning OS KnowledgeData auto-initialize failed.", error);
    }
  }

  private async syncKnowledgeDataAfterApply(
    job: AskJob,
    result: ApplyAskJobProposalResult
  ): Promise<void> {
    if (!this.settings.enableKnowledgeData || !this.settings.autoSyncKnowledgeDataAfterApply) return;
    try {
      const db = await KnowledgeDb.fromFileStore(this.fileStore, this.settings.dataFolder);
      syncKnowledgeDataForNote(db, {
        notePath: job.notePath,
        markdown: result.markdown,
        mode: "apply",
        askJobs: [{ ...job, appliedItemIds: result.verification.appliedItemIds }],
        appliedItemIds: result.verification.appliedItemIds,
        trackManualEdits: this.settings.trackKnowledgeDataManualEdits,
        markMissing: true,
      });
      await saveKnowledgeDb(this.fileStore, this.settings.dataFolder, db);
      db.close();
    } catch (error) {
      console.warn("Learning OS KnowledgeData auto-sync after Apply failed.", error);
      new Notice("Learning OS applied successfully, but KnowledgeData auto-sync failed. Manual rebuild is still available.");
    }
  }

  private queueKnowledgeDataNoteSync(file: TFile): void {
    if (!this.settings.enableKnowledgeData || !this.settings.trackKnowledgeDataManualEdits) return;
    if (file.extension !== "md") return;

    this.knowledgeSyncDebouncer.queue(file.path, () => {
      this.enqueueKnowledgeDataSyncTask(async () => {
        await this.syncKnowledgeDataForModifiedNote(file);
      });
    });
  }

  private enqueueKnowledgeDataSyncTask(task: () => Promise<void>): void {
    this.knowledgeSyncQueue = this.knowledgeSyncQueue
      .then(task)
      .catch((error) => {
        console.warn("Learning OS KnowledgeData background sync failed.", error);
      });
  }

  private async syncKnowledgeDataForModifiedNote(file: TFile): Promise<void> {
    const markdown = await this.app.vault.read(file);
    if (!noteHasFinalLearningOsMarkers(markdown)) return;

    const db = await KnowledgeDb.fromFileStore(this.fileStore, this.settings.dataFolder);
    syncKnowledgeDataForNote(db, {
      notePath: file.path,
      markdown,
      mode: "note-modify",
      trackManualEdits: true,
      markMissing: true,
    });
    await saveKnowledgeDb(this.fileStore, this.settings.dataFolder, db);
    db.close();
  }

  private async openAskModal(editor: Editor, view: MarkdownView): Promise<void> {
    const selectedText = editor.getSelection();
    if (!selectedText || selectedText.trim().length === 0) {
      new Notice("Please select a sentence or phrase first.");
      return;
    }

    const collector = new SelectionContextCollector(this.settings);
    const context = collector.collect(editor, view);
    const markdown = editor.getValue();
    const selectionStart = positionToOffset(markdown, editor.getCursor("from"));
    const selectionEnd = positionToOffset(markdown, editor.getCursor("to"));
    const physicalSourceMode = detectAskSourceMode(markdown, selectionStart, selectionEnd);
    const selectedOriginalContext = resolveOriginalProseContext({
      markdown,
      selectionStart,
      selectionEnd,
      selectedText: selectedText.trim(),
    });
    const selectedSourceBlock =
      selectedOriginalContext.sourceBlock ??
      getSemanticSourceBlockAtSelection(markdown, selectionStart, selectionEnd);
    const physicalAnnotation =
      physicalSourceMode === "clarification-item"
        ? findClarificationNearSelection(markdown, selectionStart, selectionEnd)
        : null;
    const generatedAnnotation =
      physicalSourceMode === "generated-content-item"
        ? findGeneratedContentNearSelection(markdown, selectionStart, selectionEnd)
        : null;
    const associatedAnnotation =
      physicalAnnotation ??
      (physicalSourceMode === "normal-note"
        ? findClarificationForSourceBlock(markdown, selectedSourceBlock.start, selectedSourceBlock.end)
        : null);

    let existingRecord = associatedAnnotation
      ? await this.clarificationStore.readRecord(associatedAnnotation.clarificationId)
      : null;
    if (!existingRecord) {
      existingRecord = await this.clarificationStore.findByNotePathAndSourceHash(
        context.notePath,
        selectedSourceBlock.hash
      );
    }
    const promptOriginalContext =
      physicalSourceMode === "normal-note"
        ? selectedOriginalContext
        : resolveOriginalProseContext({
            markdown,
            selectedText: existingRecord?.sourceBlock ? undefined : selectedText.trim(),
            sourceBlock: existingRecord?.sourceBlock,
            sourceBlockHash: existingRecord?.sourceBlockHash,
            sourceStartOffset: existingRecord?.sourceStartOffset,
            sourceEndOffset: existingRecord?.sourceEndOffset,
          });
    const promptSourceBlock = promptOriginalContext.sourceBlock ?? selectedSourceBlock;
    context.askSourceMode = physicalSourceMode;
    context.sourceBlock = promptSourceBlock.text;
    context.sourceBlockHash = promptSourceBlock.hash;
    context.sourceStartOffset = promptSourceBlock.start;
    context.sourceEndOffset = promptSourceBlock.end;
    context.nearbyBefore = truncateContext(promptOriginalContext.nearbyBefore, this.settings.maxContextBeforeChars, "start");
    context.nearbyAfter = truncateContext(promptOriginalContext.nearbyAfter, this.settings.maxContextAfterChars, "end");
    context.answerLanguage = this.settings.answerLanguage;

    if (physicalAnnotation) {
      const blockMarkdown = markdown.slice(physicalAnnotation.blockStart, physicalAnnotation.blockEnd);
      const itemContext = learningOsItemContextFromBlock(
        blockMarkdown,
        physicalAnnotation.clarificationId,
        selectedText,
        existingRecord?.items ?? []
      );
      if (itemContext) {
        context.askSourceMode = "clarification-item";
        context.selectedLearningOsItem = itemContext.selected;
        context.siblingLearningOsItems = itemContext.siblings;
        context.originalSourceBlockBackground = promptSourceBlock.text || existingRecord?.sourceBlock || "";
      }
    } else if (generatedAnnotation) {
      const blockMarkdown = markdown.slice(generatedAnnotation.blockStart, generatedAnnotation.blockEnd);
      const itemContext = learningOsItemContextFromBlock(blockMarkdown, generatedAnnotation.generatedId, selectedText, []);
      if (itemContext) {
        context.askSourceMode = "generated-content-item";
        context.selectedLearningOsItem = itemContext.selected;
        context.siblingLearningOsItems = itemContext.siblings;
        context.originalSourceBlockBackground = promptSourceBlock.text || context.sourceBlock;
      }
    }

    if (associatedAnnotation && !existingRecord) {
      new Notice(`Found ${associatedAnnotation.clarificationId}, but its external JSON is missing. Saving will recreate it.`);
    }

    const existingTarget = existingRecord
      ? {
          clarificationId: existingRecord.id,
          targetItemId: associatedAnnotation
            ? findTargetItemId(markdown.slice(associatedAnnotation.blockStart, associatedAnnotation.blockEnd), selectedText, existingRecord.items)
            : undefined,
          record: existingRecord,
          visibleMarkdown: associatedAnnotation
            ? markdown.slice(associatedAnnotation.blockStart, associatedAnnotation.blockEnd)
            : buildClarificationBlock(existingRecord, this.settings),
        }
      : associatedAnnotation
      ? {
          clarificationId: associatedAnnotation.clarificationId,
          targetItemId: findTargetItemId(markdown.slice(associatedAnnotation.blockStart, associatedAnnotation.blockEnd), selectedText, []),
          record: existingRecord,
          visibleMarkdown: markdown.slice(associatedAnnotation.blockStart, associatedAnnotation.blockEnd),
        }
      : undefined;

    new AskModal(this.app, context, this.settings, {
      askInBackground: async (question: string, modelSelection?: AskModelRoutingSelection) => {
        await this.askJobService.createBackgroundJob({
          context,
          question,
          existing: existingTarget,
          modelSelection,
        });
      },
      askAndWait: async (question: string, modelSelection?: AskModelRoutingSelection) => {
        const job = await this.askJobService.createJobAndWait({
          context,
          question,
          existing: existingTarget,
          modelSelection,
        });
        if (job.status === "failed") {
          new Notice(job.error?.message ?? "AI request failed.");
        }
      },
      openInbox: async () => {
        await this.openAskInbox();
      },
    }, existingTarget ? { clarificationId: existingTarget.clarificationId } : undefined).open();
  }

  private registerSelectionAskButton(): void {
    const update = () => {
      window.setTimeout(() => this.updateFloatingAskButton(), 0);
    };
    this.registerDomEvent(document, "selectionchange", update);
    this.registerDomEvent(document, "mouseup", update);
    this.registerDomEvent(document, "keyup", update);
    this.registerDomEvent(document, "scroll", () => this.hideFloatingAskButton(), true);
  }

  private updateFloatingAskButton(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      this.hideFloatingAskButton();
      return;
    }
    const selectedText = view.editor.getSelection();
    if (!selectedText || selectedText.trim().length === 0) {
      this.hideFloatingAskButton();
      return;
    }

    const selection = window.getSelection();
    const rect =
      selection && selection.rangeCount > 0 ? selection.getRangeAt(0).getBoundingClientRect() : null;
    const fallbackRect = view.containerEl.getBoundingClientRect();
    const left = rect && rect.width > 0 ? rect.left + rect.width / 2 : fallbackRect.right - 72;
    const top = rect && rect.height > 0 ? rect.top - 36 : fallbackRect.top + 48;
    const button = this.ensureFloatingAskButton();
    button.style.left = `${Math.max(8, Math.min(window.innerWidth - 56, left - 18))}px`;
    button.style.top = `${Math.max(8, top)}px`;
    button.style.display = "block";
  }

  private ensureFloatingAskButton(): HTMLButtonElement {
    if (this.floatingAskButton) return this.floatingAskButton;
    const button = document.body.createEl("button", {
      cls: "learning-os-floating-ask-button",
      text: this.t("问", "Ask"),
    });
    button.setAttr("title", this.t("询问 Learning OS", "Ask Learning OS"));
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) return;
      this.hideFloatingAskButton();
      void this.openAskModal(view.editor, view);
    });
    this.floatingAskButton = button;
    return button;
  }

  private hideFloatingAskButton(): void {
    if (this.floatingAskButton) {
      this.floatingAskButton.style.display = "none";
    }
  }

  async openAskInbox(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(ASK_INBOX_VIEW_TYPE);
    if (leaves.length > 0) {
      this.app.workspace.revealLeaf(leaves[0]);
      await this.refreshAskInboxViews();
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: ASK_INBOX_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async refreshAskInboxViews(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(ASK_INBOX_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof AskInboxView) {
        await view.refresh();
      }
    }
  }

  async listAskJobs(): Promise<AskJob[]> {
    return this.askJobStore.listJobs();
  }

  async retryAskJob(job: AskJob, userQuestion?: string, modelSelection?: AskModelRoutingSelection): Promise<void> {
    await this.askJobService.retry(job, userQuestion, modelSelection);
  }

  async remergeAskJob(job: AskJob): Promise<void> {
    const liveContext = await this.resolveLiveMergeContext(job);
    if (liveContext?.existingRecord && liveContext.currentVisibleMarkdown) {
      await this.askJobService.rebase(job, liveContext.existingRecord, liveContext.currentVisibleMarkdown);
      return;
    }
    await this.askJobService.remerge(job, liveContext);
  }

  private async resolveLiveMergeContext(job: AskJob) {
    const backendRecord = job.existingClarificationId
      ? await this.clarificationStore.readRecord(job.existingClarificationId)
      : await this.clarificationStore.findByNotePathAndSourceHash(job.notePath, job.sourceBlockHash);
    const state = await resolveLiveClarificationState({
      app: this.app,
      job,
      fallbackItems: backendRecord?.items ?? job.existingItemsSnapshot ?? [],
    });
    const liveRecord = recordFromLiveClarificationState({
      state,
      job,
      backendRecord,
      settings: this.settings,
    });
    const sourceDeletedPolicy = sourceDeletedApplyPolicy({
      job,
      liveState: state,
      uiLanguage: this.settings.uiLanguage,
    });
    const warnings = [
      liveStateWarning(state, this.settings.uiLanguage),
      sourceDeletedPolicy.warning,
      generatedContentMissingWarning(job.userQuestion, job.rawAnswer ?? ""),
    ].filter((item): item is string => Boolean(item));

    return {
      existingRecord: liveRecord,
      currentVisibleMarkdown:
        state.kind === "block-live" || state.kind === "item-deleted" ? state.liveBlockMarkdown : undefined,
      reviewWarning: warnings.join("\n\n") || undefined,
      applyDisabledReason: sourceDeletedPolicy.applyDisabledReason,
    };
  }

  async archiveAskJob(job: AskJob): Promise<void> {
    await this.askJobService.archive(job);
  }

  async deleteAskJobRecord(job: AskJob): Promise<void> {
    await this.askJobStore.deleteJob(job.id);
    await this.refreshAskInboxViews();
  }

  async applyAskJob(job: AskJob, editedVisibleMarkdown?: string): Promise<ApplyAskJobProposalResult> {
    const result = await applyAskJobProposal({
      app: this.app,
      jobStore: this.askJobStore,
      clarificationStore: this.clarificationStore,
      settings: this.settings,
      job,
      editedVisibleMarkdown,
    });
    await this.syncKnowledgeDataAfterApply(job, result);
    await this.refreshAskInboxViews();
    return result;
  }

  async liveAwarePreviewJob(job: AskJob): Promise<AskJob> {
    if (!job.mergeProposal) return job;
    const backendRecord = job.existingClarificationId
      ? await this.clarificationStore.readRecord(job.existingClarificationId)
      : await this.clarificationStore.findByNotePathAndSourceHash(job.notePath, job.sourceBlockHash);
    const state = await resolveLiveClarificationState({
      app: this.app,
      job,
      fallbackItems: backendRecord?.items ?? job.existingItemsSnapshot ?? [],
    });
    const liveRecord = recordFromLiveClarificationState({
      state,
      job,
      backendRecord,
      settings: this.settings,
    });
    const preview = liveAwareProposalForState({
      job,
      liveState: state,
      liveRecord,
      settings: this.settings,
    });
    const sourceDeletedPolicy = sourceDeletedApplyPolicy({
      job,
      liveState: state,
      uiLanguage: this.settings.uiLanguage,
    });
    const warnings = [
      liveStateWarning(state, this.settings.uiLanguage),
      sourceDeletedPolicy.warning,
      generatedContentMissingWarning(job.userQuestion, job.rawAnswer ?? ""),
    ].filter((item): item is string => Boolean(item));
    if (!preview) {
      return {
        ...job,
        reviewWarning: warnings.join("\n\n") || job.reviewWarning,
        applyDisabledReason: sourceDeletedPolicy.applyDisabledReason ?? job.applyDisabledReason,
      };
    }
    return {
      ...job,
      reviewWarning: warnings.join("\n\n") || undefined,
      applyDisabledReason: sourceDeletedPolicy.applyDisabledReason,
      mergeProposal: {
        ...preview.proposal,
        clarificationId: preview.existingRecord?.id ?? preview.proposal.clarificationId,
        proposedVisibleMarkdown: preview.visible,
      },
      proposalVisibleMarkdownHash: undefined,
    };
  }

  async openOrphanCleanup(): Promise<void> {
    const markdownFiles = await Promise.all(
      this.app.vault.getMarkdownFiles().map(async (file) => ({
        path: file.path,
        content: await this.app.vault.read(file),
      }))
    );
    const plan = buildOrphanCleanupPlan({
      markdownFiles,
      clarificationRecords: await this.clarificationStore.listRecords(),
      askJobs: await this.askJobStore.listJobs(),
    });

    if (!hasCleanupFindings(plan)) {
      new Notice(this.t("没有发现未使用的 Learning OS 数据。", "No unused Learning OS data found."));
      return;
    }

    new OrphanCleanupModal(this.app, this, plan, {
      archiveSelected: async (cleanupPlan) => {
        for (const record of cleanupPlan.orphanClarifications) {
          await this.fileStore.moveFile(
            this.clarificationStore.recordPathForId(record.id),
            `${this.settings.dataFolder}/archive/clarifications/${record.id}.json`
          );
        }
        const jobsToArchive = cleanupJobsForArchive(cleanupPlan);
        for (const job of jobsToArchive) {
          await this.fileStore.moveFile(
            this.askJobStore.jobPath(job.id),
            `${this.settings.dataFolder}/archive/ask-jobs/${job.id}.json`
          );
        }
        new Notice(
          this.t(
            `已归档 ${cleanupPlan.orphanClarifications.length + jobsToArchive.length} 条记录。`,
            `Archived ${cleanupPlan.orphanClarifications.length + jobsToArchive.length} record(s).`
          )
        );
        await this.refreshAskInboxViews();
      },
      deleteSelected: async (cleanupPlan) => {
        for (const record of cleanupPlan.orphanClarifications) {
          await this.fileStore.deleteFile(this.clarificationStore.recordPathForId(record.id));
        }
        const jobsToDelete = cleanupJobsForDelete(cleanupPlan);
        for (const job of jobsToDelete) {
          await this.askJobStore.deleteJob(job.id);
        }
        new Notice(
          this.t(
            `已删除 ${cleanupPlan.orphanClarifications.length + jobsToDelete.length} 条记录。`,
            `Deleted ${cleanupPlan.orphanClarifications.length + jobsToDelete.length} record(s).`
          )
        );
        await this.refreshAskInboxViews();
      },
    }).open();
  }

  private async convertLegacyAskCardsInView(view: MarkdownView): Promise<void> {
    if (!view.file) return;
    const original = view.editor.getValue();
    const result = convertLegacyAskCards(original, view.file.path, this.settings);

    if (result.records.length === 0) {
      new Notice(
        result.skipped > 0
          ? `No legacy Ask Cards converted (${result.skipped} skipped).`
          : "No legacy ASK_CARD blocks found."
      );
      return;
    }

    const backupName = `${view.file.basename}-before-legacy-ask-card-conversion-${timestampSlug()}.md`;
    await this.fileStore.writeText(`${this.settings.dataFolder}/backups/${backupName}`, original);

    for (const record of result.records) {
      await this.clarificationStore.saveRecord(record, "created");
    }

    view.editor.setValue(result.markdown);
    new Notice(
      `Converted ${result.records.length} legacy Ask Card${result.records.length === 1 ? "" : "s"}${
        result.skipped ? ` (${result.skipped} skipped)` : ""
      }. Backup created.`
    );
  }

  private contextForCurrentNote(view: MarkdownView): SelectionContext {
    return {
      notePath: view.file?.path ?? "Untitled.md",
      noteTitle: view.file?.basename ?? "Untitled",
      selectedText: "",
      headingPath: [],
      currentHeading: null,
      parentHeading: null,
      nearbyBefore: "",
      nearbyAfter: "",
      frontmatter: {},
      detectedConceptIds: [],
      sourceBlock: "",
      sourceBlockHash: "",
      sourceSentenceTruncated: false,
      originalSelectionLength: 0,
    };
  }
}

function findTargetItemId(blockMarkdown: string, selectedText: string, fallbackItems: import("./types").ClarificationItem[]): string | undefined {
  const needle = selectedText.trim();
  if (!needle) return undefined;
  const liveItems = parseLiveClarificationItemsFromBlock(blockMarkdown, fallbackItems);
  return liveItems.find((item) => item.rawMarkdown.includes(needle) || item.item.explanation.includes(needle) || item.item.itemTitle.includes(needle))?.item.id;
}

function truncateContext(value: string, maxChars: number, side: "start" | "end"): string {
  if (value.length <= maxChars) return value;
  if (side === "start") return `...[truncated]\n${value.slice(Math.max(0, value.length - maxChars))}`;
  return `${value.slice(0, maxChars)}\n...[truncated]`;
}

interface GeneratedAnnotationMatch {
  generatedId: string;
  blockStart: number;
  blockEnd: number;
}

function findGeneratedContentNearSelection(
  markdown: string,
  selectionStart: number,
  selectionEnd: number
): GeneratedAnnotationMatch | null {
  const pattern = /<!--\s*learnos-generated-id:\s*(gen-[^>\s]+)\s*-->/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    const blockStart = findLearningOsCalloutStart(markdown, match.index);
    const blockEnd = findLearningOsCalloutEnd(markdown, match.index + match[0].length);
    if (selectionStart < blockEnd && blockStart < selectionEnd) {
      return { generatedId: match[1], blockStart, blockEnd };
    }
  }
  return null;
}

function learningOsItemContextFromBlock(
  blockMarkdown: string,
  containerId: string,
  selectedText: string,
  fallbackItems: import("./types").ClarificationItem[]
): {
  selected: NonNullable<SelectionContext["selectedLearningOsItem"]>;
  siblings: NonNullable<SelectionContext["siblingLearningOsItems"]>;
} | null {
  const needle = selectedText.trim();
  const liveItems = parseLiveClarificationItemsFromBlock(blockMarkdown, fallbackItems);
  if (liveItems.length === 0) return null;
  const selectedLiveItem =
    liveItems.find(
      (item) => needle && (item.rawMarkdown.includes(needle) || item.item.explanation.includes(needle) || item.item.itemTitle.includes(needle))
    ) ?? liveItems[0];
  return {
    selected: {
      containerId,
      itemId: selectedLiveItem.item.id,
      itemTitle: selectedLiveItem.item.itemTitle,
      itemContent: selectedLiveItem.item.explanation,
    },
    siblings: liveItems
      .filter((item) => item.item.id !== selectedLiveItem.item.id)
      .map((item) => ({
        itemId: item.item.id,
        itemTitle: item.item.itemTitle,
        itemContent: item.item.explanation,
      })),
  };
}

function findLearningOsCalloutStart(markdown: string, markerStart: number): number {
  let start = markdown.lastIndexOf("\n", markerStart - 1) + 1;
  while (start > 0) {
    const previousEnd = start - 1;
    const previousStart = markdown.lastIndexOf("\n", previousEnd - 1) + 1;
    const line = markdown.slice(previousStart, previousEnd);
    if (!line.trim().startsWith(">") && line.trim() !== "") break;
    start = previousStart;
  }
  return start;
}

function findLearningOsCalloutEnd(markdown: string, markerEnd: number): number {
  let cursor = markerEnd;
  while (cursor < markdown.length) {
    const nextBreak = markdown.indexOf("\n", cursor);
    if (nextBreak === -1) return markdown.length;
    const nextLineStart = nextBreak + 1;
    const nextLineEnd = markdown.indexOf("\n", nextLineStart);
    const line = markdown.slice(nextLineStart, nextLineEnd === -1 ? markdown.length : nextLineEnd);
    if (!line.trim().startsWith(">") && line.trim() !== "") return nextBreak + 1;
    cursor = nextLineEnd === -1 ? markdown.length : nextLineEnd;
  }
  return markdown.length;
}

function hasCleanupFindings(plan: OrphanCleanupPlan): boolean {
  return (
    plan.orphanClarifications.length > 0 ||
    plan.deletedItems.length > 0 ||
    plan.danglingItemMarkers.length > 0 ||
    plan.danglingMarkers.length > 0 ||
    plan.orphanJobs.length > 0 ||
    plan.askJobsMissingClarificationRecords.length > 0 ||
    plan.askJobsReferencingOrphanClarifications.length > 0 ||
    plan.appliedJobsMissingItemMarkers.length > 0 ||
    plan.archivedJobs.length > 0 ||
    plan.appliedJobsMissingMarkers.length > 0
  );
}
