import { ItemView, MarkdownRenderer, MarkdownView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import {
  INBOX_STATUS_GROUPS,
  INBOX_TABS,
  actionSetForJob,
  applyDisabledReasonForJob,
  displayAnswerForJob,
  displayProcessingStatusForJob,
  displaySourceTextForJob,
  emptyStateKind,
  jobsForGroup,
  jobsForTab,
  inboxRenderModel,
  nextJobIdInTab,
  nextReadyJobIdAfterApply,
  readyCount,
  resolveSelectedJobIdForTab,
  uniqueJobsById,
} from "./AskInboxState";
import { findSourceAnchor } from "./AskSourceNavigation";
import { generatedContentMissingWarning } from "../ask/AskIntent";
import { inlineDraftStatusMessage } from "../ask/InlineDraftStaging";
import type AdaptiveLearningOsPlugin from "../main";
import type { AskJob } from "../types";
import type { InboxTabId } from "./AskInboxState";

export const ASK_INBOX_VIEW_TYPE = "learning-os-ask-inbox";

export class AskInboxView extends ItemView {
  private selectedJobId: string | null = null;
  private showHistory = false;
  private activeTab: InboxTabId = "ready";
  private currentJobs: AskJob[] = [];
  private proposalDrafts = new Map<string, string>();
  private refreshGeneration = 0;
  private stickyApplyButton: HTMLButtonElement | null = null;
  private stickyApplyJobId: string | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: AdaptiveLearningOsPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return ASK_INBOX_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.plugin.t("Learning OS 收件箱", "Learning OS Inbox");
  }

  getIcon(): string {
    return "inbox";
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const generation = ++this.refreshGeneration;
    const jobs = uniqueJobsById(await this.plugin.listAskJobs());
    if (generation !== this.refreshGeneration) return;

    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("learning-os-inbox");
    contentEl.createEl("h2", { text: this.getDisplayText() });
    this.stickyApplyButton = null;
    this.stickyApplyJobId = null;

    this.currentJobs = jobs;
    if (this.activeTab === "history" && !this.showHistory) {
      this.activeTab = "ready";
    }
    this.selectedJobId = resolveSelectedJobIdForTab(this.currentJobs, this.selectedJobId, this.activeTab);

    this.renderToolbar(contentEl);
    this.renderStatusTabs(contentEl);

    const emptyKind = emptyStateKind(this.currentJobs);
    if (emptyKind === "no-jobs") {
      this.renderEmpty(contentEl, this.plugin.t("还没有 AI 提问记录。", "No AI ask jobs yet."));
      return;
    }

    this.renderCurrentNavigation(contentEl);
    this.renderSelectedDetail(contentEl);
    this.renderCurrentTabList(contentEl);
  }

  private renderToolbar(parent: HTMLElement): void {
    const toolbar = parent.createDiv({ cls: "learning-os-inbox-toolbar" });
    toolbar.createEl("button", { text: this.plugin.t("刷新", "Refresh") }).addEventListener("click", () => {
      void this.refresh();
    });

    const historyLabel = this.showHistory
      ? this.plugin.t("隐藏历史记录", "Hide history")
      : this.plugin.t("显示历史记录", "Show history");
    toolbar.createEl("button", { text: historyLabel }).addEventListener("click", async () => {
      this.showHistory = !this.showHistory;
      if (!this.showHistory) {
        if (this.activeTab === "history") this.activeTab = "ready";
        this.selectedJobId = resolveSelectedJobIdForTab(this.currentJobs, this.selectedJobId, this.activeTab);
      } else {
        this.activeTab = "history";
        this.selectedJobId = resolveSelectedJobIdForTab(this.currentJobs, null, "history");
      }
      await this.refresh();
    });
    const cleanupButton = toolbar.createEl("button", { text: this.plugin.t("清理未使用记录", "Clean unused records") });
    cleanupButton.setAttr(
      "title",
      this.plugin.t(
        "扫描笔记中的 learnos-clarification-id 标记，清理没有对应笔记内容的后台记录。",
        "Scan learnos-clarification-id markers in notes and clean backend records with no matching note content."
      )
    );
    cleanupButton.addEventListener("click", async () => {
      await this.plugin.openOrphanCleanup();
    });

    toolbar.createSpan({
      cls: "learning-os-count",
      text: `${this.plugin.t("待处理", "Ready to review")} (${readyCount(this.currentJobs)})`,
    });
  }

  private renderStatusTabs(parent: HTMLElement): void {
    const tabs = parent.createDiv({ cls: "learning-os-status-summary learning-os-tab-row" });
    for (const tab of INBOX_TABS) {
      if (tab.id === "history" && !this.showHistory) continue;
      const tabJobs = jobsForTab(this.currentJobs, tab.id);
      const button = tabs.createEl("button", {
        cls: `learning-os-tab${this.activeTab === tab.id ? " is-active" : ""}`,
        text: `${this.plugin.t(tab.zh, tab.en)} (${tabJobs.length})`,
      });
      button.addEventListener("click", async () => {
        this.activeTab = tab.id;
        if (tab.id === "history") this.showHistory = true;
        this.selectedJobId = resolveSelectedJobIdForTab(this.currentJobs, null, this.activeTab);
        await this.refresh();
      });
    }
  }

  private renderCurrentNavigation(parent: HTMLElement): void {
    const tabJobs = jobsForTab(this.currentJobs, this.activeTab);
    const tab = INBOX_TABS.find((item) => item.id === this.activeTab);
    const label = tab ? this.plugin.t(tab.zh, tab.en) : this.plugin.t("待处理", "Ready");
    const selectedIndex = tabJobs.findIndex((job) => job.id === this.selectedJobId);
    const nav = parent.createDiv({ cls: "learning-os-current-nav learning-os-job-action-bar--sticky" });
    nav.setAttr("data-learnos-inbox-section", "sticky-actions");
    nav.createEl("strong", {
      text: `${label} (${tabJobs.length === 0 ? 0 : Math.max(0, selectedIndex + 1)}/${tabJobs.length})`,
    });
    const previousButton = nav.createEl("button", { text: this.plugin.t("上一条", "Previous") });
    previousButton.disabled = selectedIndex <= 0;
    previousButton.addEventListener("click", async () => {
      if (selectedIndex > 0) {
        this.selectedJobId = tabJobs[selectedIndex - 1].id;
        await this.refresh();
      }
    });
    const nextButton = nav.createEl("button", { text: this.plugin.t("下一条", "Next") });
    nextButton.disabled = selectedIndex < 0 || selectedIndex + 1 >= tabJobs.length;
    nextButton.addEventListener("click", async () => {
      if (selectedIndex >= 0 && selectedIndex + 1 < tabJobs.length) {
        this.selectedJobId = tabJobs[selectedIndex + 1].id;
        await this.refresh();
      }
    });
    this.renderStickyApplyButton(nav);
  }

  private renderStickyApplyButton(parent: HTMLElement): void {
    const model = inboxRenderModel(this.currentJobs, this.selectedJobId, this.activeTab);
    if (!model.showStickyApply || !model.selectedJob) return;
    const job = model.selectedJob;
    const applyButton = parent.createEl("button", {
      text: this.plugin.t("应用建议", "Apply proposal"),
      cls: "mod-cta learning-os-sticky-apply-button",
    });
    applyButton.setAttr("data-learnos-inbox-action", "apply");
    applyButton.setAttr("data-learnos-job-id", job.id);
    this.stickyApplyButton = applyButton;
    this.stickyApplyJobId = job.id;
    this.updateStickyApplyButton(job);
    applyButton.addEventListener("click", async () => {
      const selectedJob = this.currentJobs.find((item) => item.id === this.selectedJobId);
      if (!selectedJob || selectedJob.status !== "completed") return;
      await this.applyReadyJob(selectedJob, this.proposalDrafts.get(selectedJob.id));
    });
  }

  private updateStickyApplyButton(job: AskJob): void {
    if (!this.stickyApplyButton || this.stickyApplyJobId !== job.id) return;
    this.stickyApplyButton.disabled = Boolean(applyDisabledReasonForJob(job));
  }

  private renderCurrentTabList(parent: HTMLElement): void {
    const tabJobs = jobsForTab(this.currentJobs, this.activeTab);
    const tab = INBOX_TABS.find((item) => item.id === this.activeTab);
    const section = parent.createDiv({ cls: "learning-os-inbox-section learning-os-tab-list" });
    section.createEl("h3", {
      text: tab ? `${this.plugin.t(tab.zh, tab.en)} (${tabJobs.length})` : this.plugin.t("记录", "Records"),
    });
    if (tabJobs.length === 0) {
      this.renderTabEmpty(section, this.activeTab);
      return;
    }
    if (this.activeTab === "history") {
      for (const group of INBOX_STATUS_GROUPS.filter((item) => item.history)) {
        const groupJobs = jobsForGroup(this.currentJobs, group);
        if (groupJobs.length === 0) continue;
        const subsection = section.createDiv({ cls: "learning-os-history-group" });
        subsection.createEl("h4", { text: `${this.plugin.t(group.zh, group.en)} (${groupJobs.length})` });
        const list = subsection.createDiv({ cls: "learning-os-job-list" });
        for (const job of groupJobs) {
          this.renderJobSummary(list, job);
        }
      }
      return;
    }
    const list = section.createDiv({ cls: "learning-os-job-list" });
    for (const job of tabJobs) {
      this.renderJobSummary(list, job);
    }
  }

  private renderJobSummary(parent: HTMLElement, job: AskJob): void {
    const item = parent.createDiv({
      cls: `learning-os-job-summary learning-os-job-${job.status}${
        this.selectedJobId === job.id ? " is-selected" : ""
      }`,
    });
    item.createEl("strong", { text: truncate(job.userQuestion, 100) });
    item.createDiv({ cls: "learning-os-job-summary-meta", text: `${job.notePath} · ${job.status}` });
    item.addEventListener("click", async () => {
      this.selectedJobId = job.id;
      await this.refresh();
    });
  }

  private renderSelectedDetail(parent: HTMLElement): void {
    const job = this.selectedJobId ? this.currentJobs.find((item) => item.id === this.selectedJobId) : null;
    if (!job) return;

    const actionSet = actionSetForJob(job);
    if (actionSet === "ready") {
      this.renderReadyDetail(parent, job);
      return;
    }
    if (actionSet === "failed") {
      this.renderFailedDetail(parent, job);
      return;
    }
    if (actionSet === "history") {
      this.renderHistoryDetail(parent, job);
      return;
    }
    this.renderRunningDetail(parent, job);
  }

  private renderReadyDetail(parent: HTMLElement, job: AskJob): void {
    const card = this.createDetailCard(parent, job);
    card.setAttr("data-learnos-inbox-section", "pending-detail");
    const warningEl = card.createDiv({ cls: "learning-os-readonly learning-os-review-warning" });
    const setWarning = (message?: string) => {
      warningEl.setText(message ?? "");
      warningEl.style.display = message ? "" : "none";
    };
    const generationWarning = (nextJob: AskJob) =>
      generatedContentMissingWarning(nextJob.userQuestion, nextJob.parsedAnswer?.answer ?? nextJob.rawAnswer ?? "");
    const combinedWarning = (nextJob: AskJob) =>
      [
        inlineDraftStatusMessage(nextJob, this.plugin.settings.uiLanguage),
        nextJob.reviewWarning,
        nextJob.applyDisabledReason,
        generationWarning(nextJob),
      ].filter(Boolean).join("\n\n") ||
      undefined;
    setWarning(
      combinedWarning(job)
    );
    this.markdownCopyableArea(
      card,
      this.plugin.t("AI 回答", "AI answer"),
      displayAnswerForJob(job),
      "learning-os-ai-answer",
      this.plugin.t("复制 AI 回答", "Copy AI answer"),
      job,
      job.rawAnswer ?? ""
    );
    this.markdownCopyableArea(
      card,
      this.plugin.t("解析结果", "Parsed answer"),
      [
        job.parsedAnswer?.key_answer ? `key_answer: ${job.parsedAnswer.key_answer}` : "",
        job.parsedAnswer?.suggested_takeaway
          ? `suggested_takeaway: ${job.parsedAnswer.suggested_takeaway}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      "learning-os-parsed-result",
      this.plugin.t("复制解析结果", "Copy parsed result"),
      job
    );
    this.markdownCopyableArea(
      card,
      this.plugin.t("合并理由", "Merge reason"),
      job.mergeProposal?.reasoning ?? "",
      "learning-os-merge-reason",
      this.plugin.t("复制合并理由", "Copy merge reason"),
      job
    );

    const field = card.createDiv({ cls: "learning-os-field" });
    const proposalHeader = field.createDiv({ cls: "learning-os-copyable-header" });
    proposalHeader.createEl("label", { text: this.plugin.t("编辑建议", "Edit proposal") });
    const proposalPreview = field.createDiv({ cls: "learning-os-markdown-rendered learning-os-markdown-preview learning-os-proposal-preview" });
    const proposalEl = field.createEl("textarea", {
      cls: "learning-os-textarea learning-os-proposal-editor",
    });
    proposalEl.value = this.proposalDrafts.get(job.id) ?? job.mergeProposal?.proposedVisibleMarkdown ?? "";
    proposalEl.addEventListener("input", () => {
      this.proposalDrafts.set(job.id, proposalEl.value);
    });
    proposalHeader.createEl("button", { text: this.plugin.t("复制编辑建议", "Copy proposal") }).addEventListener("click", async () => {
      await this.copyText(proposalEl.value, this.plugin.t("编辑建议已复制。", "Proposal copied."));
    });
    proposalHeader.createEl("button", { text: this.plugin.t("刷新预览", "Refresh preview") }).addEventListener("click", () => {
      void this.renderMarkdownPreview(proposalPreview, proposalEl.value, job.notePath);
    });
    void this.renderMarkdownPreview(proposalPreview, proposalEl.value, job.notePath);
    const actions = card.createDiv({ cls: "learning-os-actions" });
    this.updateStickyApplyButton(job);
    if (!this.proposalDrafts.has(job.id)) {
      void this.plugin.liveAwarePreviewJob(job).then((previewJob) => {
        if (this.selectedJobId !== job.id || this.proposalDrafts.has(job.id)) return;
        const liveProposal = previewJob.mergeProposal?.proposedVisibleMarkdown ?? proposalEl.value;
        proposalEl.value = liveProposal;
        this.proposalDrafts.set(job.id, liveProposal);
        setWarning(combinedWarning(previewJob));
        this.updateStickyApplyButton(previewJob);
        void this.renderMarkdownPreview(proposalPreview, liveProposal, job.notePath);
      });
    }
    actions
      .createEl("button", { text: this.plugin.t("编辑建议", "Edit proposal") })
      .addEventListener("click", () => proposalEl.focus());
    actions
      .createEl("button", { text: this.plugin.t("重新按问题生成", "Regenerate for question") })
      .addEventListener("click", async () => {
        this.proposalDrafts.delete(job.id);
        await this.plugin.retryAskJob(job);
        await this.refresh();
      });
    actions
      .createEl("button", { text: this.plugin.t("使用 Pro 重新生成", "Regenerate with Pro") })
      .addEventListener("click", async () => {
        this.proposalDrafts.delete(job.id);
        await this.plugin.retryAskJob(job, undefined, {
          choice: "pro",
          routingReason: "user-regenerate-with-pro",
          rerunOfJobId: job.id,
        });
        await this.refresh();
      });
    actions
      .createEl("button", { text: this.plugin.t("让 AI 重新合并", "Ask AI to re-merge") })
      .addEventListener("click", async () => {
        if (
          this.proposalDrafts.has(job.id) &&
          this.proposalDrafts.get(job.id) !== (job.mergeProposal?.proposedVisibleMarkdown ?? "") &&
          !confirm(
            this.plugin.t(
              "你已经手动修改了编辑建议。重新合并会覆盖这些修改，是否继续？",
              "You have manually edited the proposal. Re-merge will overwrite those edits. Continue?"
            )
          )
        ) {
          return;
        }
        this.proposalDrafts.delete(job.id);
        await this.plugin.remergeAskJob(job);
        await this.refresh();
      });
    this.addOpenArchiveActions(actions, job);
  }

  private renderFailedDetail(parent: HTMLElement, job: AskJob): void {
    const card = this.createDetailCard(parent, job);
    this.meta(card, this.plugin.t("错误", "Error"), job.error?.message ?? "Unknown error");
    const questionField = card.createDiv({ cls: "learning-os-field" });
    questionField.createEl("label", { text: this.plugin.t("编辑问题并重试", "Edit question and retry") });
    const questionEl = questionField.createEl("textarea", { cls: "learning-os-textarea" });
    questionEl.value = job.userQuestion;

    const prompt = card.createDiv({ cls: "learning-os-field" });
    prompt.createEl("label", { text: "Prompt" });
    const promptEl = prompt.createEl("textarea", { cls: "learning-os-textarea learning-os-prompt" });
    promptEl.value = job.prompt;
    promptEl.readOnly = true;

    const actions = card.createDiv({ cls: "learning-os-actions" });
    actions.createEl("button", { text: this.plugin.t("重试", "Retry"), cls: "mod-cta" }).addEventListener(
      "click",
      async () => {
        await this.plugin.retryAskJob(job);
        await this.refresh();
      }
    );
    actions.createEl("button", { text: this.plugin.t("编辑问题并重试", "Edit question and retry") }).addEventListener(
      "click",
      async () => {
        await this.plugin.retryAskJob(job, questionEl.value);
        await this.refresh();
      }
    );
    actions.createEl("button", { text: this.plugin.t("使用 Pro 重试", "Retry with Pro") }).addEventListener(
      "click",
      async () => {
        await this.plugin.retryAskJob(job, questionEl.value, {
          choice: "pro",
          routingReason: "user-regenerate-with-pro",
          rerunOfJobId: job.id,
        });
        await this.refresh();
      }
    );
    actions.createEl("button", { text: this.plugin.t("复制 prompt", "Copy prompt") }).addEventListener(
      "click",
      async () => {
        await navigator.clipboard.writeText(job.prompt);
        new Notice(this.plugin.t("Prompt 已复制。", "Prompt copied."));
      }
    );
    this.addOpenArchiveActions(actions, job);
  }

  private renderHistoryDetail(parent: HTMLElement, job: AskJob): void {
    const card = this.createDetailCard(parent, job, "learning-os-history-detail");
    card.createDiv({
      cls: "learning-os-readonly",
      text: this.plugin.t(
        "这里显示的是 AI 提问记录。归档或删除这条记录不会删除笔记里的“我的理解”内容。",
        "This is an AI ask job record. Archiving or deleting it will not remove the clarification from the note."
      ),
    });
    this.copyableArea(
      card,
      this.plugin.t("查看记录", "View record"),
      JSON.stringify(job, null, 2),
      "learning-os-parsed-result",
      this.plugin.t("复制解析结果", "Copy parsed result")
    );
    const actions = card.createDiv({ cls: "learning-os-actions" });
    this.addOpenArchiveActions(actions, job, job.status !== "archived");
    const deleteButton = actions.createEl("button", { text: this.plugin.t("删除记录", "Delete job record") });
    deleteButton.setAttr(
      "title",
      this.plugin.t("只删除这条 AI 提问历史，不删除笔记内容。", "Only deletes this AI ask history. It does not delete note content.")
    );
    deleteButton.addEventListener(
      "click",
      async () => {
        if (
          !confirm(
            this.plugin.t(
              "这只会删除这条 AI 提问记录，不会删除笔记中的“我的理解”内容。确定继续吗？",
              "This only deletes this AI ask job record. It will not remove the clarification from the note. Continue?"
            )
          )
        ) {
          return;
        }
        this.selectedJobId = nextJobIdInTab(this.currentJobs, job.id, this.activeTab);
        await this.plugin.deleteAskJobRecord(job);
        new Notice(this.plugin.t("AI 提问记录已删除。", "AI ask job record deleted."));
        await this.refresh();
      }
    );
  }

  private renderRunningDetail(parent: HTMLElement, job: AskJob): void {
    const card = this.createDetailCard(parent, job);
    this.meta(
      card,
      this.plugin.t("状态", "Status"),
      displayProcessingStatusForJob(job)
    );
    const actions = card.createDiv({ cls: "learning-os-actions" });
    this.addOpenArchiveActions(actions, job, false);
  }

  private createDetailCard(parent: HTMLElement, job: AskJob, extraClass = ""): HTMLElement {
    const card = parent.createDiv({
      cls: `learning-os-job learning-os-job-detail learning-os-job-${job.status} ${extraClass}`,
    });
    const header = card.createDiv({ cls: "learning-os-job-header" });
    header.createEl("strong", { text: truncate(job.userQuestion, 120) });
    header.createSpan({ text: ` · ${job.status}` });
    this.meta(card, this.plugin.t("选中文本", "Selected text"), job.selectedText);
    this.meta(card, this.plugin.t("原文", "Source block"), displaySourceTextForJob(job));
    this.meta(card, this.plugin.t("笔记", "Note"), job.notePath);
    this.meta(card, this.plugin.t("标题路径", "Heading path"), job.headingPath.join(" > ") || "(none)");
    this.meta(card, this.plugin.t("模型", "Provider/model"), `${job.providerMode}${job.model ? ` / ${job.model}` : ""}`);
    this.meta(
      card,
      this.plugin.t("模型路由", "Model routing"),
      [job.modelRoutingMode, job.routingReason, job.rerunOfJobId ? `rerun: ${job.rerunOfJobId}` : ""]
        .filter(Boolean)
        .join(" / ") || "(none)"
    );
    this.meta(card, this.plugin.t("时间", "Created/updated"), `${job.created} / ${job.updated}`);
    return card;
  }

  private addOpenArchiveActions(actions: HTMLElement, job: AskJob, showArchive = true): void {
    actions.createEl("button", { text: this.plugin.t("打开原文", "Open source note") }).addEventListener(
      "click",
      async () => {
        await this.openSourceForJob(job);
      }
    );
    if (showArchive) {
      const archiveButton = actions.createEl("button", { text: this.plugin.t("归档记录", "Archive job record") });
      archiveButton.setAttr(
        "title",
        this.plugin.t("从默认历史列表中隐藏，后台保留。", "Hide from the default history list while keeping the backend record.")
      );
      archiveButton.addEventListener("click", async () => {
        await this.plugin.archiveAskJob(job);
        this.selectedJobId = nextJobIdInTab(this.currentJobs, job.id, this.activeTab);
        await this.refresh();
      });
    }
  }

  private renderTabEmpty(parent: HTMLElement, tabId: InboxTabId): void {
    const messages: Record<InboxTabId, string> = {
      running: this.plugin.t("当前没有正在处理的后台提问。", "No ask jobs are currently running."),
      ready: this.plugin.t("没有待处理的 AI 回答。", "No AI answers are waiting for review."),
      failed: this.plugin.t("当前没有失败的提问。", "No failed ask jobs."),
      history: this.plugin.t("没有历史记录。", "No history records."),
    };
    this.renderEmpty(
      parent,
      messages[tabId],
      this.plugin.t(
        "你可以继续阅读并用右键 Ask Learning OS 提交后台提问。",
        "Continue reading and use Ask Learning OS to send questions in the background."
      )
    );
  }

  private renderEmpty(parent: HTMLElement, message: string, helper?: string): void {
    const empty = parent.createDiv({ cls: "learning-os-empty" });
    empty.createDiv({ text: message });
    if (helper) {
      empty.createDiv({ cls: "learning-os-empty-helper", text: helper });
    }
  }

  private copyableArea(
    parent: HTMLElement,
    label: string,
    value: string,
    extraClass: string,
    copyLabel: string
  ): HTMLTextAreaElement {
    const field = parent.createDiv({ cls: "learning-os-field" });
    const header = field.createDiv({ cls: "learning-os-copyable-header" });
    header.createEl("label", { text: label });
    header.createEl("button", { text: copyLabel }).addEventListener("click", async () => {
      await this.copyText(value, this.plugin.t("已复制。", "Copied."));
    });
    const textarea = field.createEl("textarea", {
      cls: `learning-os-textarea learning-os-large-textarea learning-os-copyable-block ${extraClass}`,
    });
    textarea.value = value || "";
    textarea.readOnly = true;
    return textarea;
  }

  private markdownCopyableArea(
    parent: HTMLElement,
    label: string,
    value: string,
    extraClass: string,
    copyLabel: string,
    job: AskJob,
    rawValue = value
  ): HTMLElement {
    const field = parent.createDiv({ cls: "learning-os-field" });
    const header = field.createDiv({ cls: "learning-os-copyable-header" });
    header.createEl("label", { text: label });
    header.createEl("button", { text: copyLabel }).addEventListener("click", async () => {
      await this.copyText(value, this.plugin.t("已复制。", "Copied."));
    });
    const rendered = field.createDiv({
      cls: `learning-os-markdown-rendered learning-os-markdown-preview ${extraClass}`,
    });
    void this.renderMarkdownPreview(rendered, value || "(empty)", job.notePath);
    const raw = field.createEl("details", { cls: "learning-os-raw-details" });
    const rawSummary = raw.createEl("summary", { text: this.plugin.t("Raw 原文", "Raw") });
    rawSummary.createEl("button", { text: this.plugin.t("复制 Raw", "Copy raw") }).addEventListener("click", async (event) => {
      event.preventDefault();
      await this.copyText(rawValue, this.plugin.t("Raw 已复制。", "Raw copied."));
    });
    const textarea = raw.createEl("textarea", {
      cls: `learning-os-textarea learning-os-large-textarea learning-os-copyable-block ${extraClass}`,
    });
    textarea.value = rawValue || "";
    textarea.readOnly = true;
    return rendered;
  }

  private async renderMarkdownPreview(container: HTMLElement, value: string, sourcePath: string): Promise<void> {
    container.empty();
    await MarkdownRenderer.render(this.app, value || "(empty)", container, sourcePath, this);
  }

  private async openSourceForJob(job: AskJob): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(job.notePath);
    if (!(file instanceof TFile)) {
      new Notice(`Source note not found: ${job.notePath}`);
      return;
    }

    const markdown = await this.app.vault.read(file);
    const anchor = findSourceAnchor(markdown, job);
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
    const view = leaf.view instanceof MarkdownView ? leaf.view : this.app.workspace.getActiveViewOfType(MarkdownView);

    if (view && anchor.kind !== "none") {
      const position = { line: anchor.line, ch: anchor.ch };
      view.editor.setCursor(position);
      view.editor.scrollIntoView({ from: position, to: position }, true);
      view.editor.focus();
    }

    if (anchor.kind === "item") {
      new Notice(this.plugin.t("已定位到对应的理解项。", "Jumped to the related clarification item."));
      return;
    }
    if (anchor.kind === "clarification") {
      new Notice(this.plugin.t("未找到具体 item，已定位到理解块。", "Item anchor not found; jumped to the clarification block."));
      return;
    }
    if (anchor.kind === "source-offset" || anchor.kind === "selected-text") {
      new Notice(this.plugin.t("已定位到原文附近。", "Jumped near the source text."));
      return;
    }
    new Notice(this.plugin.t("未找到对应位置，已打开原文。", "Could not find the anchor; opened the source note."));
  }

  private async applyReadyJob(job: AskJob, editedVisibleMarkdown?: string): Promise<void> {
    try {
      const disabledReason = applyDisabledReasonForJob(job);
      if (disabledReason) {
        new Notice(disabledReason);
        return;
      }
      const nextSelected = nextReadyJobIdAfterApply(this.currentJobs, job.id);
      const result = await this.plugin.applyAskJob(job, editedVisibleMarkdown ?? job.mergeProposal?.proposedVisibleMarkdown ?? "");
      this.proposalDrafts.delete(job.id);
      this.selectedJobId = nextSelected;
      new Notice(
        result.safeMerged
          ? this.plugin.t("检测到旧建议，已安全合并到当前内容。", "Stale proposal safely merged into current content.")
          : this.plugin.t("建议已应用到笔记。", "Proposal applied to note.")
      );
      await this.refresh();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Apply failed.");
    }
  }

  private async copyText(value: string, message: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    new Notice(message);
  }

  private meta(parent: HTMLElement, label: string, value: string): void {
    const field = parent.createDiv({ cls: "learning-os-job-meta" });
    field.createEl("span", { cls: "learning-os-job-label", text: label });
    field.createDiv({ cls: "learning-os-readonly", text: value || "(empty)" });
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}
