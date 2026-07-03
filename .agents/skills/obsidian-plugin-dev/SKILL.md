---
name: obsidian-plugin-dev
description: Use when developing the Adaptive Learning OS Obsidian plugin, especially TypeScript plugin scaffold, Obsidian API, commands, modals, views, settings, editor context menu, and vault file access.
---

# Obsidian Plugin Development Skill

Follow this skill whenever writing or modifying Obsidian plugin code.

## Core rules

- Use TypeScript.
- Prefer the official Obsidian sample plugin structure.
- Use Obsidian APIs for vault access, workspace views, commands, modals, notices, ribbon icons, and settings.
- Use `Vault` / `TFile` / `MetadataCache` where appropriate.
- Avoid Node-only APIs unless the feature is explicitly desktop-only.
- Keep the plugin local-first.
- Never auto-send note contents to an AI provider.
- Never auto-apply AI edits without preview and user approval.
- Keep dependencies minimal.
- Ask before adding production dependencies.
- Prefer small, testable modules.

## Common implementation patterns

- Commands: register with `this.addCommand`.
- Settings: use `PluginSettingTab`.
- Modals: extend `Modal`.
- Custom views: extend `ItemView`.
- Editor right-click menu: use the `editor-menu` workspace event.
- File writes: use `app.vault.create`, `app.vault.modify`, `app.vault.adapter.write`, or project storage wrappers.
- Show friendly `Notice` messages after user actions.

## Required safety behavior

- If the user asks to send note content to AI, show what will be sent or respect the prompt-preview setting.
- If the user asks to write generated content into a note, show preview or insert only after explicit action.
- Never delete or overwrite user data without creating a clear backup or suggested patch.

## Verification

After changes:
- Run TypeScript build.
- Run tests if they exist.
- Manually verify plugin commands can be registered.
