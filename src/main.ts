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
import { getSourceBlockAtSelection, getSourceBlockBeforeOffset } from "./editor/SourceBlock";
import { AskJobService } from "./jobs/AskJobService";
import { applyAskJobProposal, findLiveClarificationMatch } from "./jobs/ApplyAskJobProposal";
import { DEFAULT_SETTINGS, LearningOsSettingTab } from "./settings";
import { AskJobStore } from "./storage/AskJobStore";
import { ClarificationStore } from "./storage/ClarificationStore";
import { FileStore } from "./storage/FileStore";
import { timestampSlug } from "./utils/dates";
import { ASK_INBOX_VIEW_TYPE, AskInboxView } from "./views/AskInboxView";
import type { Editor, Menu } from "obsidian";
import type { AskJob, LearningOsSettings, ProviderPreset, SelectionContext } from "./types";
import type { OrphanCleanupPlan } from "./cleanup/OrphanCleanup";
import type { ApplyAskJobProposalResult } from "./jobs/ApplyAskJobProposal";

export default class AdaptiveLearningOsPlugin extends Plugin {
  settings: LearningOsSettings = DEFAULT_SETTINGS;
  private fileStore!: FileStore;
  private clarificationStore!: ClarificationStore;
  private askJobStore!: AskJobStore;
  private askJobService!: AskJobService;

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

    await this.askJobService.initialize();
  }

  onunload(): void {}

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
      this.settings.providerModel = "deepseek-chat";
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
      }
    );
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
    const selectedSourceBlock = getSourceBlockAtSelection(markdown, selectionStart, selectionEnd);
    let annotation = findClarificationNearSelection(markdown, selectionStart, selectionEnd);
    if (!annotation) {
      annotation = findClarificationForSourceBlock(
        markdown,
        selectedSourceBlock.start,
        selectedSourceBlock.end
      );
    }

    let existingRecord = annotation
      ? await this.clarificationStore.readRecord(annotation.clarificationId)
      : null;
    if (!existingRecord) {
      existingRecord = await this.clarificationStore.findByNotePathAndSourceHash(
        context.notePath,
        selectedSourceBlock.hash
      );
    }
    const sourceBlock = existingRecord
      ? {
          start: existingRecord.sourceStartOffset ?? getSourceBlockBeforeOffset(markdown, annotation?.blockStart ?? selectionStart).start,
          end: existingRecord.sourceEndOffset ?? getSourceBlockBeforeOffset(markdown, annotation?.blockStart ?? selectionStart).end,
          text: existingRecord.sourceBlock,
          hash: existingRecord.sourceBlockHash,
        }
      : selectedSourceBlock;
    context.sourceBlock = sourceBlock.text;
    context.sourceBlockHash = sourceBlock.hash;
    context.sourceStartOffset = sourceBlock.start;
    context.sourceEndOffset = sourceBlock.end;
    context.answerLanguage = this.settings.answerLanguage;

    if (annotation && !existingRecord) {
      new Notice(`Found ${annotation.clarificationId}, but its external JSON is missing. Saving will recreate it.`);
    }

    const existingTarget = existingRecord
      ? {
          clarificationId: existingRecord.id,
          targetItemId: annotation
            ? findTargetItemId(markdown.slice(annotation.blockStart, annotation.blockEnd), selectedText, existingRecord.items)
            : undefined,
          record: existingRecord,
          visibleMarkdown: annotation
            ? markdown.slice(annotation.blockStart, annotation.blockEnd)
            : buildClarificationBlock(existingRecord, this.settings),
        }
      : annotation
      ? {
          clarificationId: annotation.clarificationId,
          targetItemId: findTargetItemId(markdown.slice(annotation.blockStart, annotation.blockEnd), selectedText, []),
          record: existingRecord,
          visibleMarkdown: markdown.slice(annotation.blockStart, annotation.blockEnd),
        }
      : undefined;

    new AskModal(this.app, context, this.settings, {
      askInBackground: async (question: string) => {
        await this.askJobService.createBackgroundJob({
          context,
          question,
          existing: existingTarget,
        });
      },
      askAndWait: async (question: string) => {
        const job = await this.askJobService.createJobAndWait({
          context,
          question,
          existing: existingTarget,
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

  async retryAskJob(job: AskJob, userQuestion?: string): Promise<void> {
    await this.askJobService.retry(job, userQuestion);
  }

  async remergeAskJob(job: AskJob): Promise<void> {
    const sourceFile = this.app.vault.getAbstractFileByPath(job.notePath);
    if (sourceFile instanceof TFile) {
      const markdown = await this.app.vault.read(sourceFile);
      const match = findLiveClarificationMatch(markdown, job);
      const currentVisibleMarkdown = match ? markdown.slice(match.blockStart, match.blockEnd) : "";
      const latestRecord = job.existingClarificationId
        ? await this.clarificationStore.readRecord(job.existingClarificationId)
        : await this.clarificationStore.findByNotePathAndSourceHash(job.notePath, job.sourceBlockHash);
      if (latestRecord && currentVisibleMarkdown) {
        await this.askJobService.rebase(job, latestRecord, currentVisibleMarkdown);
        return;
      }
    }
    await this.askJobService.remerge(job);
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
    await this.refreshAskInboxViews();
    return result;
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
