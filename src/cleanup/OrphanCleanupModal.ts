import { Modal } from "obsidian";
import type { App } from "obsidian";
import type AdaptiveLearningOsPlugin from "../main";
import type { OrphanCleanupPlan } from "./OrphanCleanup";

export class OrphanCleanupModal extends Modal {
  constructor(
    app: App,
    private plugin: AdaptiveLearningOsPlugin,
    private plan: OrphanCleanupPlan,
    private callbacks: {
      archiveSelected: (plan: OrphanCleanupPlan) => Promise<void>;
      deleteSelected: (plan: OrphanCleanupPlan) => Promise<void>;
    }
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("learning-os-modal");
    contentEl.createEl("h2", {
      text: this.plugin.t("清理未使用的 Learning OS 数据", "Clean unused Learning OS data"),
    });

    contentEl.createDiv({
      cls: "learning-os-readonly",
      text: this.plugin.t(
        "这是清理预览。默认操作会把相关后端记录移到 archive，让它们从 Inbox 历史中消失；不会删除笔记内容或日志。失效 note marker 只会列出，不会自动修改笔记。",
        "This is a cleanup preview. The default action moves related backend records to archive so they disappear from Inbox history; it will not delete note content or logs. Dangling note markers are listed only and notes are not edited automatically."
      ),
    });

    this.renderSummary();
    this.renderList(
      this.plugin.t("孤儿理解记录", "Orphan clarification records"),
      this.plan.orphanClarifications.map((record) => `${record.id} · ${record.notePath}`)
    );
    this.renderList(
      this.plugin.t("已应用但原文标记已删除的提问记录", "Applied ask jobs whose note marker is missing"),
      this.plan.appliedJobsMissingMarkers.map(formatJob)
    );
    this.renderList(
      this.plugin.t("引用缺失理解记录的提问记录", "Ask jobs referencing missing clarification records"),
      this.plan.askJobsMissingClarificationRecords.map(formatJob)
    );
    this.renderList(
      this.plugin.t("引用孤儿理解记录的提问记录", "Ask jobs linked to orphan clarification records"),
      this.plan.askJobsReferencingOrphanClarifications.map(formatJob)
    );
    this.renderList(
      this.plugin.t("失效 note marker（仅预览，不自动删除）", "Dangling note markers (preview only, not auto-removed)"),
      this.plan.danglingMarkers.map((marker) => `${marker.id} · ${marker.notePath} · ${marker.marker}`)
    );
    this.renderList(
      this.plugin.t("可清除归档记录", "Archived job records ready to purge"),
      this.plan.archivedJobs.map(formatJob)
    );

    const actions = contentEl.createDiv({ cls: "learning-os-actions" });
    actions.createEl("button", { text: this.plugin.t("归档选中项", "Archive selected"), cls: "mod-cta" }).addEventListener(
      "click",
      async () => {
        await this.callbacks.archiveSelected(this.plan);
        this.close();
      }
    );
    actions.createEl("button", { text: this.plugin.t("永久删除选中项", "Permanently delete selected") }).addEventListener(
      "click",
      async () => {
        if (
          !confirm(
            this.plugin.t(
              "这会永久删除选中的 Learning OS 后台记录，但不会删除你的笔记正文。确定继续吗？",
              "This will permanently delete selected Learning OS backend records, but will not delete your note content. Continue?"
            )
          )
        ) {
          return;
        }
        await this.callbacks.deleteSelected(this.plan);
        this.close();
      }
    );
    actions.createEl("button", { text: this.plugin.t("取消", "Cancel") }).addEventListener("click", () => {
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderSummary(): void {
    const summary = this.contentEl.createDiv({ cls: "learning-os-cleanup-summary" });
    const rows = [
      [this.plugin.t("孤儿理解记录", "Orphan clarifications"), this.plan.orphanClarifications.length],
      [this.plugin.t("已应用但原文标记已删除的提问记录", "Applied jobs missing markers"), this.plan.appliedJobsMissingMarkers.length],
      [this.plugin.t("引用缺失理解记录的提问记录", "Jobs missing clarification records"), this.plan.askJobsMissingClarificationRecords.length],
      [this.plugin.t("引用孤儿理解记录的提问记录", "Jobs linked to orphan clarifications"), this.plan.askJobsReferencingOrphanClarifications.length],
      [this.plugin.t("失效 note marker", "Dangling note markers"), this.plan.danglingMarkers.length],
      [this.plugin.t("可清除归档记录", "Archived records"), this.plan.archivedJobs.length],
    ] as Array<[string, number]>;

    for (const [label, count] of rows) {
      summary.createDiv({ text: `${label}: ${count}` });
    }
  }

  private renderList(label: string, items: string[]): void {
    const field = this.contentEl.createDiv({ cls: "learning-os-field" });
    field.createEl("label", { text: label });
    const textarea = field.createEl("textarea", { cls: "learning-os-textarea learning-os-parsed-result" });
    textarea.readOnly = true;
    textarea.value = items.length > 0 ? items.join("\n") : "(none)";
  }
}

function formatJob(job: { id: string; status: string; notePath: string; created?: string; updated?: string }): string {
  return `${job.id} · ${job.status} · ${job.notePath} · ${job.created ?? "(no created)"} / ${job.updated ?? "(no updated)"}`;
}
