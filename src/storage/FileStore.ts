import type { App } from "obsidian";

export class FileStore {
  constructor(private app: App, private dataFolder: string) {}

  async ensureDataFolders(): Promise<void> {
    await this.ensureFolder(this.dataFolder);
    await this.ensureFolder(`${this.dataFolder}/config`);
    await this.ensureFolder(`${this.dataFolder}/ask-cards`);
    await this.ensureFolder(`${this.dataFolder}/ask-jobs`);
    await this.ensureFolder(`${this.dataFolder}/clarifications`);
    await this.ensureFolder(`${this.dataFolder}/archive`);
    await this.ensureFolder(`${this.dataFolder}/archive/ask-jobs`);
    await this.ensureFolder(`${this.dataFolder}/archive/clarifications`);
    await this.ensureFolder(`${this.dataFolder}/backups`);
    await this.ensureFolder(`${this.dataFolder}/logs`);
    await this.ensureFolder(`${this.dataFolder}/generated`);
    await this.ensureFolder(`${this.dataFolder}/generated/ask-prompts`);
  }

  async exists(path: string): Promise<boolean> {
    return this.app.vault.adapter.exists(path);
  }

  async readText(path: string): Promise<string | null> {
    const adapter = this.app.vault.adapter;
    if (!(await adapter.exists(path))) return null;
    return adapter.read(path);
  }

  async writeText(path: string, content: string): Promise<void> {
    await this.ensureDataFolders();
    await this.ensureParentFolder(path);
    await this.app.vault.adapter.write(path, content);
  }

  async readJson<T>(path: string): Promise<T | null> {
    const content = await this.readText(path);
    if (content === null) return null;
    return JSON.parse(content) as T;
  }

  async writeJson(path: string, record: unknown): Promise<void> {
    await this.writeText(path, `${JSON.stringify(record, null, 2)}\n`);
  }

  async deleteFile(path: string): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (await adapter.exists(path)) {
      await adapter.remove(path);
    }
  }

  async moveFile(fromPath: string, toPath: string): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (!(await adapter.exists(fromPath))) return;
    await this.ensureParentFolder(toPath);
    if (await adapter.exists(toPath)) {
      await adapter.remove(toPath);
    }
    await adapter.rename(fromPath, toPath);
  }

  async appendJsonl(path: string, record: unknown): Promise<void> {
    await this.ensureDataFolders();
    const adapter = this.app.vault.adapter;
    const line = `${JSON.stringify(record)}\n`;

    if (await adapter.exists(path)) {
      const current = await adapter.read(path);
      await adapter.write(path, current.endsWith("\n") ? current + line : `${current}\n${line}`);
      return;
    }

    await adapter.write(path, line);
  }

  async listFiles(folder: string): Promise<string[]> {
    await this.ensureDataFolders();
    const adapter = this.app.vault.adapter;
    if (!(await adapter.exists(folder))) return [];
    const listed = await adapter.list(folder);
    return listed.files;
  }

  private async ensureFolder(path: string): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (await adapter.exists(path)) return;

    const parts = path.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!(await adapter.exists(current))) {
        await adapter.mkdir(current);
      }
    }
  }

  private async ensureParentFolder(path: string): Promise<void> {
    const slash = path.lastIndexOf("/");
    if (slash === -1) return;
    await this.ensureFolder(path.slice(0, slash));
  }
}
