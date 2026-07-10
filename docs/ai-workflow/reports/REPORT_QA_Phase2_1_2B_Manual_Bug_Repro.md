# REPORT QA Phase 2.1.2B Manual Bug Repro

QA target: Phase 2.1.2B manual bug reproduction verification

Repo path: `/Users/issiyua/Documents/Adaptive_Learning_OS`

Vault path: `/Users/issiyua/Desktop/Learning/Study`

Plugin runtime path checked: yes. `/Users/issiyua/Desktop/Learning/Study/.obsidian/plugins/adaptive-learning-os` is a symlink to `/Users/issiyua/Documents/Adaptive_Learning_OS`.

Node used: `/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`

## Files/tests inspected

- `docs/ai-workflow/incoming/QA_Phase2_1_2B_Manual_Bug_Repro.md`
- `tests/inlineDraftStaging.test.mjs`
- `tests/asyncInbox.test.mjs`
- `src/views/AskInboxState.ts`
- `src/views/AskInboxView.ts`
- `src/jobs/AskJobService.ts`
- `src/jobs/ApplyAskJobProposal.ts`
- `src/ask/InlineDraftStaging.ts`
- `src/ask/ClarificationMergeProposal.ts`

## Commands

- TypeScript: pass
- Full tests: pass, 171/171
- Focused tests: pass, 90/90
- Production build: pass
- `git diff --check`: pass

Commands run:

```bash
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/typescript/bin/tsc -noEmit -skipLibCheck
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --loader ./tests/ts-extension-loader.mjs --test tests/inlineDraftStaging.test.mjs tests/asyncInbox.test.mjs
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node esbuild.config.mjs production
git diff --check
```

## Manual bug verification

- Bug A generated block story edit suggestion empty: not reproduced in deterministic tests. Covered by `generated block generated request creates generated draft and applies into same generated block`, plus existing generated fallback tests in `asyncInbox.test.mjs`. Result: generated-content draft exists, proposal/apply path is non-empty, final item appends to the same generated block, original item remains once, draft removed.
- Bug B generated block clarification: not reproduced. Covered by `generated block clarification question creates clarification draft and applies as tip near generated block`. Result: clarification output is applyable and writes a `[!tip]- 💡 我的理解` block near the generated block without disabling Apply.
- Bug C tip clarification duplicates tip: not reproduced after adding exact Cloud Deployment regression. New test `tip clarification question appends without copying Cloud Deployment tip` verifies one tip, one `cloud-deployment-def`, one new `aws-def`, and no draft remnants.
- Bug D tip generated story edit suggestion empty / duplicate story body: not reproduced. Existing generated-from-tip tests verify generated-content draft/output and no copied tip. Added assertions verify unique story body appears exactly once after Apply for tip-generated and generated-block-generated paths.

## New tests added

- Added `tip clarification question appends without copying Cloud Deployment tip`.
- Added story-body count assertions to:
  - `applying generated draft from inside tip creates generated-content block without duplicating tip`
  - `generated block generated request creates generated draft and applies into same generated block`

## Expected failures

- None. New regression coverage passes.

## Confirmed blockers

- None found in deterministic QA.

## Non-blocking gaps

- No Obsidian UI smoke was performed. The manual reports are now covered by deterministic unit/integration tests, but a live vault smoke test could still catch rendering-only or stale UI state issues.
- Real AI response variance is not tested; deterministic fixtures simulate valid story/clarification content.
- Current worktree has broad staged Phase 2.1.2B changes from earlier work. This QA turn did not commit.

## Docs/context updated?

- No broad `docs/context` maintenance performed.
- Only this requested QA report was added under `docs/ai-workflow/reports/`.

## Ready for fix brief?

- No blocker fix brief needed from deterministic QA.
- Recommended next step: run optional Obsidian smoke for the four manual flows before commit/tag if the user wants UI-level confidence; otherwise proceed to review/stage/commit the Phase 2.1.2B changes plus the added QA regressions.
