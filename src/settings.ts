import { App, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_DATA_FOLDER } from "./constants";
import type AdaptiveLearningOsPlugin from "./main";
import type { LearningOsSettings } from "./types";

export const DEFAULT_SETTINGS: LearningOsSettings = {
  schemaVersion: 1,
  dataFolder: DEFAULT_DATA_FOLDER,
  defaultLanguage: "Chinese",
  uiLanguage: "zh",
  answerLanguage: "auto",
  maxSelectedTextChars: 1000,
  maxContextBeforeChars: 800,
  maxContextAfterChars: 800,
  insertMode: "after-paragraph",
  storeFullAnswerInLog: true,
  storeFullAnswerInNote: false,
  showPromptPreview: true,
  clarificationInsertionStyle: "callout-collapsed",
  showQuestionInVisibleClarification: false,
  providerMode: "manual",
  providerPreset: "openai",
  providerBaseUrl: "https://api.openai.com",
  providerChatCompletionsPath: "/v1/chat/completions",
  providerMessagesPath: "/v1/messages",
  providerModel: "gpt-4.1-mini",
  defaultAskModel: "deepseek-v4-flash",
  deepAskModel: "deepseek-v4-pro",
  modelRoutingMode: "suggest",
  providerApiKey: "",
  providerTemperature: 0.2,
  providerMaxTokens: 1200,
  previewPromptBeforeSend: true,
  maxConcurrentAskJobs: 2,
};

export class LearningOsSettingTab extends PluginSettingTab {
  plugin: AdaptiveLearningOsPlugin;

  constructor(app: App, plugin: AdaptiveLearningOsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Adaptive Learning OS" });

    new Setting(containerEl)
      .setName(this.plugin.t("界面语言", "UI language"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("zh", "中文")
          .addOption("en", "English")
          .setValue(this.plugin.settings.uiLanguage)
          .onChange(async (value) => {
            this.plugin.settings.uiLanguage = value as LearningOsSettings["uiLanguage"];
            await this.plugin.saveSettings();
            this.display();
          })
      );

    new Setting(containerEl)
      .setName(this.plugin.t("回答语言", "Answer language"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("auto", this.plugin.settings.uiLanguage === "zh" ? "Auto / 自动" : "Auto")
          .addOption("zh", "中文")
          .addOption("en", "English")
          .setValue(this.plugin.settings.answerLanguage)
          .onChange(async (value) => {
            this.plugin.settings.answerLanguage = value as LearningOsSettings["answerLanguage"];
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Data folder")
      .setDesc("Vault folder for local Learning OS data.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_DATA_FOLDER)
          .setValue(this.plugin.settings.dataFolder)
          .onChange(async (value) => {
            this.plugin.settings.dataFolder = value.trim() || DEFAULT_DATA_FOLDER;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default answer language")
      .setDesc("Used in generated manual prompts.")
      .addText((text) =>
        text
          .setPlaceholder("Chinese")
          .setValue(this.plugin.settings.defaultLanguage)
          .onChange(async (value) => {
            this.plugin.settings.defaultLanguage = value.trim() || "Chinese";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Max selected text characters")
      .setDesc("Longer selections are truncated in prompts and Ask Cards.")
      .addText((text) =>
        text
          .setPlaceholder("1000")
          .setValue(String(this.plugin.settings.maxSelectedTextChars))
          .onChange(async (value) => {
            const parsed = Number(value);
            if (Number.isFinite(parsed) && parsed > 0) {
              this.plugin.settings.maxSelectedTextChars = parsed;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Insert mode")
      .setDesc("Where new Ask Cards are inserted.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("after-paragraph", "After selected paragraph")
          .addOption("cursor", "At cursor")
          .setValue(this.plugin.settings.insertMode)
          .onChange(async (value) => {
            this.plugin.settings.insertMode = value as LearningOsSettings["insertMode"];
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Ask clarification insertion style")
      .setDesc("What appears in the note body. Full data is stored externally.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("callout-collapsed", "Callout collapsed")
          .addOption("inline", "Inline")
          .addOption("hidden-only", "Hidden id only")
          .setValue(this.plugin.settings.clarificationInsertionStyle)
          .onChange(async (value) => {
            this.plugin.settings.clarificationInsertionStyle =
              value as LearningOsSettings["clarificationInsertionStyle"];
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show question in visible clarification")
      .setDesc("Off by default so notes stay concise.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showQuestionInVisibleClarification)
          .onChange(async (value) => {
            this.plugin.settings.showQuestionInVisibleClarification = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Provider mode")
      .setDesc("AI is only called when you explicitly click Ask AI.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("manual", "Manual")
          .addOption("openai-compatible", "OpenAI-compatible")
          .addOption("anthropic-compatible", "Anthropic-compatible")
          .addOption("custom", "Custom")
          .setValue(this.plugin.settings.providerMode)
          .onChange(async (value) => {
            this.plugin.settings.providerMode = value as LearningOsSettings["providerMode"];
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Provider preset")
      .setDesc("Editable defaults for compatible chat completion APIs.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("openai", "OpenAI")
          .addOption("deepseek", "DeepSeek")
          .addOption("glm-zhipu", "GLM / Zhipu")
          .addOption("openrouter", "OpenRouter")
          .addOption("claude", "Claude / Anthropic")
          .addOption("custom", "Custom")
          .setValue(this.plugin.settings.providerPreset)
          .onChange(async (value) => {
            this.plugin.applyProviderPreset(value as LearningOsSettings["providerPreset"]);
            await this.plugin.saveSettings();
            this.display();
          })
      );

    new Setting(containerEl)
      .setName("Base URL")
      .setDesc("Example: https://api.openai.com or https://api.deepseek.com")
      .addText((text) =>
        text.setValue(this.plugin.settings.providerBaseUrl).onChange(async (value) => {
          this.plugin.settings.providerBaseUrl = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Chat completions path")
      .setDesc("Example: /v1/chat/completions or /chat/completions")
      .addText((text) =>
        text.setValue(this.plugin.settings.providerChatCompletionsPath).onChange(async (value) => {
          this.plugin.settings.providerChatCompletionsPath = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Anthropic messages path")
      .setDesc("Used for Anthropic-compatible mode. Example: /v1/messages")
      .addText((text) =>
        text.setValue(this.plugin.settings.providerMessagesPath).onChange(async (value) => {
          this.plugin.settings.providerMessagesPath = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Model")
      .addText((text) =>
        text.setValue(this.plugin.settings.providerModel).onChange(async (value) => {
          this.plugin.settings.providerModel = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(this.plugin.t("默认 Ask 模型", "Default Ask model"))
      .setDesc(this.plugin.t("Auto / Flash 默认使用的低成本模型。", "Low-cost model used by Auto / Flash."))
      .addText((text) =>
        text.setValue(this.plugin.settings.defaultAskModel).onChange(async (value) => {
          this.plugin.settings.defaultAskModel = value.trim() || "deepseek-v4-flash";
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(this.plugin.t("Deep 模型", "Deep model"))
      .setDesc(this.plugin.t("Pro 路由和 Inbox Pro 重生成使用的模型。", "Model used for Pro routing and Inbox Pro regeneration."))
      .addText((text) =>
        text.setValue(this.plugin.settings.deepAskModel).onChange(async (value) => {
          this.plugin.settings.deepAskModel = value.trim() || "deepseek-v4-pro";
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(this.plugin.t("模型路由模式", "Model routing mode"))
      .setDesc(this.plugin.t("当前不会静默自动升级到 Pro。", "The plugin will not silently upgrade to Pro."))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("manual", this.plugin.t("Manual only", "Manual only"))
          .addOption("suggest", this.plugin.t("Suggest Pro", "Suggest Pro"))
          .addOption("auto", this.plugin.t("Auto route with budget cap（未来）", "Auto route with budget cap (future)"))
          .setValue(this.plugin.settings.modelRoutingMode)
          .onChange(async (value) => {
            this.plugin.settings.modelRoutingMode = value as LearningOsSettings["modelRoutingMode"];
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("API key")
      .setDesc("Stored locally in Obsidian plugin settings; not a dedicated secret manager.")
      .addText((text) =>
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.providerApiKey)
          .onChange(async (value) => {
            this.plugin.settings.providerApiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Temperature")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.providerTemperature)).onChange(async (value) => {
          const parsed = Number(value);
          if (Number.isFinite(parsed)) {
            this.plugin.settings.providerTemperature = parsed;
            await this.plugin.saveSettings();
          }
        })
      );

    new Setting(containerEl)
      .setName("Max tokens")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.providerMaxTokens)).onChange(async (value) => {
          const parsed = Number(value);
          if (Number.isFinite(parsed) && parsed > 0) {
            this.plugin.settings.providerMaxTokens = parsed;
            await this.plugin.saveSettings();
          }
        })
      );

    new Setting(containerEl)
      .setName("Preview prompt before send")
      .setDesc("Ask AI shows the outgoing prompt before calling the provider.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.previewPromptBeforeSend).onChange(async (value) => {
          this.plugin.settings.previewPromptBeforeSend = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(this.plugin.t("最大并发后台提问数", "Max concurrent Ask jobs"))
      .setDesc(this.plugin.t("超过此数量的问题会排队等待。", "Extra questions stay queued until a slot is free."))
      .addText((text) =>
        text.setValue(String(this.plugin.settings.maxConcurrentAskJobs)).onChange(async (value) => {
          const parsed = Number(value);
          if (Number.isFinite(parsed) && parsed > 0) {
            this.plugin.settings.maxConcurrentAskJobs = Math.floor(parsed);
            await this.plugin.saveSettings();
          }
        })
      );
  }
}
