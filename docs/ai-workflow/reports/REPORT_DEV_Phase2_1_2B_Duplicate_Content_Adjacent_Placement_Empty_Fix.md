# REPORT_DEV_Phase2_1_2B_Duplicate_Content_Adjacent_Placement_Empty_Fix

Date: 2026-07-10
Repo: `/Users/issiyua/Documents/Adaptive_Learning_OS`
Vault: `/Users/issiyua/Desktop/Learning/Study`

## Phase / Task

Executed the narrow Phase 2.1.2B fix for:

- duplicated generated body after tip-source generated Apply;
- adjacent tip/note placement instability;
- remaining empty generated suggestions for valid example/story answers;
- D1 unrelated duplicate and D2 ambiguous target behavior preservation.

No large `docs/context` update, commit, tag, or push was performed.

## Real Jobs Inspected

Real vault artifacts inspected under:

- `/Users/issiyua/Desktop/Learning/Study/.learning-os/ask-jobs`
- `/Users/issiyua/Desktop/Learning/Study/.learning-os/logs`
- `/Users/issiyua/Desktop/Learning/Study/Phase2_1_2B/POST_FIX_Phase2_1_2B_Master_Test.md`

Key jobs:

- `job-20260710-174130-dxiks6`
  - question: `编一个小故事，帮助我理解`
  - source mode: `clarification-item`
  - result: generated-content proposal/draft non-empty, applied, but real note showed duplicated story body residue below the generated block.
- `job-20260710-180255-lgllyc`
  - question: `举个例子说明`
  - source mode: `normal-note`
  - result: non-empty raw/parsed answer about an intelligent customer-service Agent, but proposal was empty due generated satisfaction false rejection.
- `job-20260710-180315-b7zblf`
  - question: `生成一个小故事解释`
  - source mode: `normal-note`
  - result: non-empty raw/parsed Function Calling story, including Unicode compatibility ideographs such as `⼀`, but proposal was empty due generated satisfaction false rejection.
- `job-20260710-174936-9nnzp5`
  - question: `举一个例子呗，帮我理解`
  - source mode: `generated-content-item`
  - result: non-empty generated-content append shape used as related real example fixture.

## Root Cause A — Duplicated Generated Body

Exact cause:

Inline draft/callout block range detection did not support Markdown blockquote lazy continuation lines. If a live draft body contained continuation text not prefixed by `>`, the draft block range could stop after the first paragraph. Apply then inserted the final generated block and removed only the detected part of the draft, leaving the later draft body as unmarked text/blockquote residue.

Before:

- generated final block could be correct;
- draft marker removed;
- part of draft body could remain below the final block, creating visible duplicate generated content.

After:

- inline draft block range detection accepts safe lazy continuation lines until a real boundary;
- generated/callout range detection in apply/live resolver uses the same boundary behavior;
- regression test verifies `UNIQUE-STORY-SENTENCE-ALPHA/BETA` each appears exactly once after draft removal and all draft markers are gone.

## Root Cause B — Remaining Empty Suggestion

Exact cause:

Generated satisfaction checking treated task words such as `举个`, `说明`, and `解释` as answer keywords. Valid answers that provided a concrete example/story but did not repeat those instruction words were rejected. The second real failure also used Unicode compatibility ideographs, so visually normal Chinese text did not normalize to the same internal characters.

Unicode normalization used:

- Added NFKC normalization before intent/satisfaction matching.

Intent acceptance before:

- `举个例子说明` with a concrete Agent/order-query example could be rejected.
- `生成一个小故事解释` with a Function Calling story could be rejected.

Intent acceptance after:

- Example-like requests are accepted when the answer contains a concrete scenario, actor/system, steps, or outcome.
- Story-like requests are accepted when the answer has narrative structure or enough sentence development.
- Empty/refusal/unrelated hard-keyword answers are still rejected.
- Existing hard-keyword protection for requests like CS2/NiKo remains.

## Root Cause C — Adjacent Callout Placement

Exact cause:

Normal-note draft staging trusted stored offsets even when the note had shifted. In adjacent callout scenarios, stale offsets could put drafts above or away from the live source. Also, source/draft/generated callout parsers could disagree on block ends.

Placement rules after fix:

- Normal-note staging uses stored offsets only when the live slice still equals `sourceBlock`.
- If offsets are stale, staging falls back to live source text search.
- Generated source + generated request appends to the source generated block.
- Generated source + clarification inserts a tip directly below the source generated block.
- Tip source + clarification merges/appends to the source tip.
- Tip source + generated request inserts generated output below the source tip and does not duplicate body.

## Files Changed

- `src/ask/AskIntent.ts`
- `src/ask/InlineDraftBlock.ts`
- `src/ask/InlineDraftStaging.ts`
- `src/jobs/ApplyAskJobProposal.ts`
- `src/jobs/LiveClarificationState.ts`
- `tests/asyncInbox.test.mjs`
- `tests/inlineDraftStaging.test.mjs`
- `main.js` from production build

## Tests Added

Valid example/story prompts:

- `举个例子说明`
- `生成一个小故事解释`
- `编一个小故事帮助我理解`
- `测试一下，编一个小故事`
- `编一个简短故事`
- `再补充一个例子`

Unicode normalization:

- ordinary Chinese story answer;
- compatibility-ideograph story answer using characters like `⼀`, `⽅`, `⼩`.

Adjacent callout matrix:

- tip → note, Ask tip, generated request;
- tip → note, Ask tip, clarification request;
- note → tip, Ask note, generated request;
- note → tip, Ask note, clarification request.

Duplicate body count:

- fixed unique sentence fixture ensures final body appears once and draft residue is removed.

D1/D2 regression:

- Existing D1 unrelated historical duplicate success test remains passing.
- Existing D2 ambiguous target rollback/draft-preserved/accurate error test remains passing.

## Verification

TypeScript:

- `PATH=/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH /Users/issiyua/Documents/Adaptive_Learning_OS/node_modules/.bin/tsc -noEmit -skipLibCheck`
- Result: pass.

Focused tests:

- `node --loader ./tests/ts-extension-loader.mjs --test tests/asyncInbox.test.mjs`
- Result: 71/71 pass.

- `node --loader ./tests/ts-extension-loader.mjs --test tests/inlineDraftStaging.test.mjs`
- Result: 35/35 pass.

- `node --loader ./tests/ts-extension-loader.mjs --test tests/paragraphClarification.test.mjs tests/askWorkflowUx.test.mjs`
- Result: 64/64 pass.

Full tests:

- `node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs`
- Result: 188/188 pass.

Production build:

- `node esbuild.config.mjs production`
- Result: pass.

git diff check:

- `git diff --check`
- Result: pass.

## Build Artifact

`main.js` after production build:

- mtime: `Jul 10 18:41:28 2026`
- epoch mtime: `1783701688`
- SHA-256: `86c8baba95136c4809d4c7522fbac5958bf02bcf12bc4fdc53b28437be0bd526`

## Obsidian Reload

Reload status: not completed.

Reason:

Creating the required minimal smoke file in the real vault required elevated filesystem permission. The escalation request was rejected by the platform because the current Codex usage limit was reached. Because of that same limitation, I could not safely continue to reload or automate Obsidian. I did not attempt a workaround.

## Live Smoke

Requested live smoke items were not completed:

- tip → note generated: not completed in UI.
- note → tip generated: not completed in UI.
- note → tip clarification: not completed in UI.
- `举个例子说明`: not completed in UI.
- `生成一个小故事解释`: not completed in UI.

Automated deterministic coverage for these paths is complete and passing, but this report does not claim real UI Ask/Apply smoke passed.

## Known Limitations

- Live Obsidian reload and UI smoke remain blocked by the platform escalation/use-limit failure.
- The fix does not attempt to clean old duplicated content already present in user notes. It only prevents new duplicate-body residue and empty-proposal failures.

Docs/context updated? no/deferred

Commit created? no

Ready for QA? code/tests/build yes; live UI QA still needed after permissions/usage allow Obsidian reload and smoke.

Recommended next step:

Run the five live smoke scenarios in `DEV_SMOKE_Duplicate_Content_Adjacent_Empty.md` or a similar minimal note after reloading Obsidian with the `main.js` hash above.

