---
name: ai-provider-abstraction
description: Use when implementing AI calls, provider settings, prompt generation, OpenAI-compatible endpoints, DeepSeek/OpenAI presets, manual provider, and safety checks.
---

# AI Provider Abstraction Skill

Never hardcode a single AI provider.

## Required interface

All AI calls must go through an `AiProvider` interface.

Minimum providers:

1. `ManualClipboardProvider`
2. `OpenAICompatibleProvider`

OpenAI-compatible settings:

- base URL
- chat completions path
- model
- API key
- temperature
- max tokens

## Presets

Provide editable presets, not hardcoded secrets:

- OpenAI
- DeepSeek
- Custom OpenAI-compatible endpoint
- Ollama can be stubbed for v0.2

## Safety

- Never send notes automatically.
- User must explicitly click `Ask AI`, `Run AI Check`, or equivalent.
- Provide prompt preview setting.
- If API fails, show generated prompt and allow manual copy.
- Store no real API keys in committed files.
- Warn users that Obsidian plugin settings are local but not a dedicated secret manager.

## Response handling

Prefer JSON response format when prompting AI, but parse best-effort if the model returns plain text.

Ask responses should produce:

- raw answer
- key answer
- suggested personal takeaway
- mastery signal
- review needed flag
