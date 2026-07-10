# Phase 2.1.2B QA Report

Date: 2026-07-05

## Path handling

- Project repo path: `/Users/issiyua/Documents/Adaptive_Learning_OS` OK.
- Obsidian test vault path: `/Users/issiyua/Desktop/Learning/Study` OK.
- Plugin runtime path: `/Users/issiyua/Desktop/Learning/Study/.obsidian/plugins/adaptive-learning-os`.
- Runtime type: symlink to `/Users/issiyua/Documents/Adaptive_Learning_OS`.
- UI smoke used latest build: not run. Production build was run against the symlinked repo.
- Vault runtime files committed: no.

## Baseline

- Commit: `3eeccf5`.
- Node runtime: `/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`.
- Initial automated baseline before QA fix:
  - TypeScript: pass.
  - full tests: pass, 148/148.
  - production build: pass.
  - `git diff --check`: pass.

## Automated verification after QA fix

- TypeScript: pass.
- full tests: pass, 151/151.
- production build: pass.
- `git diff --check`: pass.
- Focused inline draft tests: pass, 8/8.

Commands run:

```bash
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/typescript/bin/tsc -noEmit -skipLibCheck
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs
/Users/issiyua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node esbuild.config.mjs production
git diff --check
```

## QA matrix

- A. Setting/regression: pass. Default off in `src/settings.ts`; off path covered by `inline draft staging off leaves Inbox-only Apply unchanged`.
- B. Normal note draft: pass after fix. Draft creation, no final item marker, deleted draft no-op, and post-Apply draft removal regression covered.
- C. Tip draft: pass after fix. Tip draft creation, live edited draft apply, target missing, and post-Apply draft removal regression covered.
- D. Generated draft: partial pass. Generated draft creation and post-Apply draft removal regression covered; generated target-deleted case should still get a direct test.
- E. Adjacent callout preservation: partial pass. Existing parser tests cover adjacent inline draft boundaries; exact E1/E2 preservation matrix should get direct tests.
- F. Sibling preservation: partial pass. Existing live merge tests cover manual edit/delete safety generally; inline-draft-specific sibling tests are still needed.
- G. Source/target resolution: partial pass. Source deleted and target missing behavior is partly covered; draft moved is not automated.
- H. Multiple drafts: not automated.
- I. Regenerate existing draft: partial pass. Existing live draft detection is covered; regenerate replacement UX is not fully covered.
- J. KnowledgeData boundaries: pass for draft ignored before Apply and Apply sync. Deleted draft no-sync is behaviorally no-op but should get a direct DB assertion.
- K. UI/status: partial pass. State/status strings covered lightly; Computer Use smoke not run.

## Blocker bug found and fixed

Title: Apply removed inline draft using stale pre-Apply offsets, corrupting the final block.

Reproduction:

1. Enable inline draft staging.
2. Create a normal-note, tip, or generated-content inline draft.
3. Click Apply.
4. Apply writes/replaces the final block before the draft, then removes the draft using the draft's old `blockStart/blockEnd`.

Expected:

- Final Learning OS block remains structurally complete.
- Draft block is removed.
- No partial `learnos-draft-*` markers remain.

Actual before fix:

- Draft removal sliced the newly inserted/replaced final block.
- Output could start mid-marker, e.g. `6 -->` or `urce-block-hash: ...`, leaving malformed callout content.
- This matches the user-reported broken tip block symptom.

Severity: blocker.

Fix applied:

- `src/ask/InlineDraftBlock.ts`: `removeInlineDraftBlock()` now re-finds the live draft by `learnos-draft-id` or `learnos-draft-job-id` in the latest markdown before deleting.
- If an identity-bearing draft is no longer found, it leaves markdown unchanged instead of cutting by stale offsets.
- `tests/inlineDraftStaging.test.mjs`: added normal, tip, and generated-content regression tests for post-Apply draft removal.

## Non-blocking polish / remaining QA gaps

- Add direct tests for generated target deleted.
- Add direct tests for adjacent generated+tip preservation E1/E2.
- Add inline-draft-specific sibling edited/deleted tests.
- Add multiple drafts under same target.
- Add direct KnowledgeData assertion for deleted draft Apply no-sync.
- Optional Obsidian Computer Use smoke can be run after these deterministic gaps are closed.

## Conclusion

- Ready to continue development: yes, with the small blocker fix included.
- Ready to commit: yes for the current Phase 2.1.2B implementation plus QA fix, after reviewing the existing broad uncommitted implementation/doc diff.
- Recommended minimum fix scope if continuing QA: only add the missing deterministic tests above; no feature expansion.
