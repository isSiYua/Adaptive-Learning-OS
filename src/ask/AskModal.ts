import { Modal, Notice } from "obsidian";
import { ManualClipboardProvider } from "../ai/ManualClipboardProvider";
import type { App } from "obsidian";
import type { LearningOsSettings, SelectionContext } from "../types";

interface AskModalCallbacks {
  askInBackground: (question: string) => Promise<void>;
  askAndWait: (question: string) => Promise<void>;
  openInbox: () => Promise<void>;
}

interface AskModalExistingState {
  clarificationId: string;
}

export class AskModal extends Modal {
  private questionEl!: HTMLTextAreaElement;
  private promptEl!: HTMLTextAreaElement;
  private manualProvider = new ManualClipboardProvider();

  constructor(
    app: App,
    private context: SelectionContext,
    private settings: LearningOsSettings,
    private callbacks: AskModalCallbacks,
    private existing?: AskModalExistingState
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("learning-os-modal");
    contentEl.createEl("h2", { text: this.t("Ask Learning OS", "Ask Learning OS") });

    this.addReadonlyField(this.t("选中的文本", "Selected text"), this.context.selectedText);
    this.addReadonlyField(this.t("源段落 / Context", "Source block / Context"), this.context.sourceBlock);
    this.addReadonlyField(
      this.t("状态", "Status"),
      this.existing
        ? `${this.t("将更新已有 clarification", "Will update existing clarification")}: ${
            this.existing.clarificationId
          }`
        : this.t("将创建新的 paragraph-level clarification", "Will create a new paragraph-level clarification")
    );

    this.questionEl = this.addTextarea(this.t("你的问题", "Your question"), "");

    const actions = contentEl.createDiv({ cls: "learning-os-actions" });
    actions
      .createEl("button", { text: this.t("后台提问", "Ask in background"), cls: "mod-cta" })
      .addEventListener("click", async () => {
        await this.submitBackground();
      });
    actions.createEl("button", { text: this.t("提问并等待", "Ask and wait") }).addEventListener(
      "click",
      async () => {
        await this.submitAndWait();
      }
    );
    actions.createEl("button", { text: this.t("打开收件箱", "Open Inbox") }).addEventListener("click", async () => {
      await this.callbacks.openInbox();
      this.close();
    });
    actions.createEl("button", { text: this.t("取消", "Cancel") }).addEventListener("click", () => this.close());

    contentEl.createEl("h3", { text: this.t("高级 / fallback", "Advanced / fallback") });
    this.promptEl = this.addTextarea(this.t("Prompt 预览", "Prompt preview"), "", true);
    this.promptEl.addClass("learning-os-prompt");

    const fallbackActions = contentEl.createDiv({ cls: "learning-os-actions" });
    fallbackActions.createEl("button", { text: this.t("预览 prompt", "Preview prompt") }).addEventListener("click", () => {
      this.refreshPrompt();
    });
    fallbackActions.createEl("button", { text: this.t("复制 prompt", "Copy prompt") }).addEventListener("click", async () => {
      await this.copyPrompt();
    });

    this.refreshPrompt();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async submitBackground(): Promise<void> {
    const question = this.questionEl.value.trim();
    if (!question) {
      new Notice(this.t("请先输入问题。", "Add your question first."));
      this.questionEl.focus();
      return;
    }

    await this.callbacks.askInBackground(question);
    new Notice(
      this.t(
        "已提交后台提问，完成后会出现在 Learning OS 收件箱。",
        "Question sent to background. The answer will appear in Learning OS Inbox."
      )
    );
    this.close();
  }

  private async submitAndWait(): Promise<void> {
    const question = this.questionEl.value.trim();
    if (!question) {
      new Notice(this.t("请先输入问题。", "Add your question first."));
      this.questionEl.focus();
      return;
    }

    await this.callbacks.askAndWait(question);
    await this.callbacks.openInbox();
    this.close();
  }

  private refreshPrompt(): string {
    const prompt = this.manualProvider.buildPrompt({
      userQuestion: this.questionEl.value.trim() || "(No question entered yet.)",
      selectedText: this.context.selectedText,
      context: { ...this.context, answerLanguage: this.settings.answerLanguage },
      language: this.settings.answerLanguage,
      responseStyle: "normal",
    });
    this.promptEl.value = prompt;
    return prompt;
  }

  private async copyPrompt(): Promise<void> {
    const prompt = this.refreshPrompt();
    await navigator.clipboard.writeText(prompt);
    new Notice(this.t("Prompt 已复制。", "Prompt copied."));
  }

  private addReadonlyField(label: string, value: string): void {
    const field = this.contentEl.createDiv({ cls: "learning-os-field" });
    field.createEl("label", { text: label });
    field.createDiv({ cls: "learning-os-readonly", text: value });
  }

  private addTextarea(label: string, placeholder: string, readonly = false): HTMLTextAreaElement {
    const field = this.contentEl.createDiv({ cls: "learning-os-field" });
    field.createEl("label", { text: label });
    const textarea = field.createEl("textarea", {
      cls: "learning-os-textarea",
      attr: { placeholder },
    });
    textarea.readOnly = readonly;
    return textarea;
  }

  private t(zh: string, en: string): string {
    return this.settings.uiLanguage === "en" ? en : zh;
  }
}
