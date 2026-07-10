# COMMIT / FINALIZE Phase 2.1.2B — 提交、阶段收尾与阶段守卫

任务类型：提交与阶段收尾任务  
项目：Adaptive Learning OS  
阶段：Phase 2.1.2B — Natural Inline Draft Staging

项目路径：

```text
/Users/issiyua/Documents/Adaptive_Learning_OS
```

Obsidian Vault：

```text
/Users/issiyua/Desktop/Learning/Study
```

最终报告输出：

```text
/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/reports/REPORT_FINALIZE_Phase2_1_2B.md
```

---

# 0. 当前前提

用户已完成最终真实手动测试，并明确确认：

```text
全部 Pass。
```

当前最后一轮开发报告：

```text
docs/ai-workflow/reports/REPORT_DEV_Phase2_1_2B_Callout_Boundary_Source_Mapping_Timing.md
```

最后一次正式构建记录：

```text
main.js SHA-256:
62d69a8f367a36481c97bc3888f9ff73211157f7662d660852b163345af93b4a
```

最后一次自动测试记录：

```text
196/196 tests passed
```

本任务目标：

```text
1. 重新验证最终状态；
2. 审核并整理本阶段变更；
3. 更新必要的阶段文档；
4. 建立阶段守卫；
5. 归档已完成任务；
6. 创建一个正式 commit；
7. 不 push、不 tag。
```

---

# 1. 严格范围

允许：

```text
重新运行测试
重新 production build
检查 git diff
修正文档中的路径、状态或明显错字
整理 docs/ai-workflow/incoming
创建阶段收尾报告
创建阶段守卫文档
创建 git commit
```

禁止：

```text
实现新功能
修改产品行为
重构 Ask / Inbox / Apply 逻辑
开始 KnowledgeData Foundation
自动清理用户 Vault
删除真实 Ask job 或日志
push
tag
force push
rebase 已共享历史
```

如果验证过程中发现需要修改运行时代码：

```text
立即停止提交流程；
不要偷偷修代码；
不要 commit；
写入报告并返回用户进入新的开发修复阶段。
```

---

# 2. 创建阶段守卫

创建：

```text
/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/PHASE_GUARD_Phase2_1_2B.md
```

必须记录以下冻结行为：

```text
1. Normal note Ask 可生成 clarification 或 generated draft。
2. clarification-item：
   - clarification request 更新当前 tip；
   - generated request 在当前 tip 下方创建 generated block。
3. generated-content-item：
   - generated request 追加到当前 generated block；
   - clarification request 在当前 generated block 下方创建 tip。
4. Apply 使用 live draft。
5. Draft 被删除时 Apply 安全 no-op。
6. Apply 后 draft marker 和 draft body 不残留。
7. 相邻 tip/note 不得被解析为一个巨大 container。
8. selection 必须映射到真实 containerId + itemId。
9. siblingLearningOsItems 仅来自同一 container。
10. 复杂 Callout 中 draft 和 final 均围绕真实 source。
11. duplicate-marker：
    - 无关历史重复不阻止安全 Apply；
    - 当前 target 歧义时安全 rollback，draft 保留。
12. Normal-note 新 item 不得使用固定 item-1。
13. Inbox 中“原文”显示本次实际 Ask 来源。
14. generated example/story 有效回答不得误判为 empty。
15. Unicode compatibility characters 不得导致错误拒绝。
16. Ask job 记录 processing stage 和 timing diagnostics。
17. KnowledgeData 忽略 draft，仅处理正式 marker。
```

记录后续回归门槛：

```text
任何后续阶段修改 Ask / Inbox / Draft / Apply / Callout parser，
必须运行：
- focused tests
- full tests
- production build
- 真实 Obsidian smoke
```

至少列出：

```text
tests/asyncInbox.test.mjs
tests/inlineDraftStaging.test.mjs
tests/paragraphClarification.test.mjs
tests/askWorkflowUx.test.mjs
```

并记录：

```text
后续阶段不得在没有 Bug Inventory、DEV brief 和用户明确同意的情况下，
静默改变本阶段冻结行为。
```

---

# 3. 检查工作区

执行：

```bash
cd /Users/issiyua/Documents/Adaptive_Learning_OS

git rev-parse --show-toplevel
git branch --show-current
git status --short
git diff --name-status
git diff --stat
git diff --check
```

分类所有变更：

```text
A. Phase 2.1.2B 运行时代码
B. Phase 2.1.2B 测试
C. production build artifact
D. Phase 2.1.2B docs / reports / task briefs
E. 与本阶段无关的变更
F. 未跟踪文件
```

E 类文件：

```text
不要 stage
不要删除
在最终报告中列出
```

无法判断归属的文件：

```text
不要猜
不要 stage
在报告中标为“需要用户确认”
```

---

# 4. 代码范围审查

重点检查：

```text
src/ask/
src/jobs/
src/views/
src/types.ts
src/main.ts
tests/
main.js
docs/ai-workflow/
```

执行：

```bash
git diff -- src/ask
git diff -- src/jobs
git diff -- src/views
git diff -- src/types.ts
git diff -- src/main.ts
git diff -- tests
```

确认不存在：

```text
临时 console.log
调试代码
硬编码真实 Vault 路径
针对 Observability / Monitoring / Deployment 的生产特判
被关闭的安全检查
跳过测试
```

搜索：

```bash
rg -n   'console\.log|TODO|FIXME|Observability|Monitoring|Deployment|FINAL_QA|DEV_SMOKE|/Users/issiyua/Desktop/Learning/Study'   src tests
```

测试 fixture 中出现这些词可以接受，生产代码特判不可接受。

---

# 5. 最终验证

## TypeScript

```bash
./node_modules/.bin/tsc --noEmit --skipLibCheck
```

## Focused tests

```bash
node --loader ./tests/ts-extension-loader.mjs --test   tests/asyncInbox.test.mjs   tests/inlineDraftStaging.test.mjs   tests/paragraphClarification.test.mjs   tests/askWorkflowUx.test.mjs
```

## Full tests

```bash
node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs
```

## Production build

```bash
node esbuild.config.mjs production
```

## Diff check

```bash
git diff --check
```

记录：

```text
Focused test count
Full test count
main.js mtime
main.js size
main.js SHA-256
```

任一步失败：

```text
停止
不 commit
写报告
```

---

# 6. 文档批量更新

## 更新工作流 README

更新：

```text
docs/ai-workflow/README.md
```

至少记录：

```text
Phase 2.1.2B：Completed / Finalized
最终真实 QA：Pass
最终自动测试：本次实际运行结果
最终 build hash
最终报告路径
阶段守卫路径
下一阶段候选：KnowledgeData Foundation
```

## 更新 canonical 状态 / handoff

搜索：

```bash
rg -n   'Phase 2\.1\.2B|Natural Inline Draft Staging|KnowledgeData Foundation|current phase|当前阶段'   docs .
```

只更新真正的 canonical 状态文件或 handoff 文件。

不要：

```text
重写历史报告
复制状态到大量旧文档
制造多个互相冲突的“当前状态”
```

最终状态必须明确：

```text
Phase 2.1.2B finalized
Ask / Inbox / Draft / Apply baseline frozen
下一阶段尚未开始
KnowledgeData Foundation 仅为下一阶段候选
```

---

# 7. 归档 incoming

创建：

```text
docs/ai-workflow/archive/Phase2_1_2B/
```

将已经完成且明确属于本阶段的任务文件从：

```text
docs/ai-workflow/incoming/
```

移动到：

```text
docs/ai-workflow/archive/Phase2_1_2B/
```

包括：

```text
DEV
FIX
MANUAL_QA
测试任务
已完成的 Bug Inventory 副本
```

不要移动：

```text
尚未执行的任务
下一阶段文件
无法确认归属的文件
```

不要删除历史报告。

可创建：

```text
docs/ai-workflow/archive/Phase2_1_2B/README.md
```

记录：

```text
已归档文件
最终开发报告
最终阶段守卫
最终提交信息
```

---

# 8. Stage 前审查

执行：

```bash
git status --short
git diff --cached --name-status
git diff --cached --stat
git diff --cached --check
```

只 stage：

```text
本阶段运行时代码
本阶段测试
main.js
本阶段最终文档
阶段守卫
归档移动
最终收尾报告
```

不要直接使用：

```bash
git add .
```

应逐路径添加，并在添加前确认没有无关变更。

---

# 9. 创建 commit

建议 commit message：

```text
feat(ask): finalize Phase 2.1.2B inline draft workflow
```

建议 body：

```text
- stabilize live inline draft Apply
- enforce exact callout source mapping
- preserve duplicate-marker safety
- fix Inbox source display and generated intent handling
- add timing diagnostics and regression coverage
```

禁止：

```text
git push
git tag
git commit --amend
```

---

# 10. Commit 后检查

执行：

```bash
git rev-parse HEAD
git show --stat --oneline --decorate HEAD
git status --short
```

确认：

```text
commit 已创建
commit 内容仅属于 Phase 2.1.2B
没有误提交无关文件
未 push
未 tag
```

工作区若仍有变更：

```text
列出剩余文件
说明为什么未提交
不要擅自处理
```

---

# 11. 最终报告

写入：

```text
docs/ai-workflow/reports/REPORT_FINALIZE_Phase2_1_2B.md
```

报告格式：

```text
Phase:
Phase 2.1.2B — Natural Inline Draft Staging

Final status:
- finalized / blocked

User manual QA:
- all pass

Branch:

Pre-commit verification:
- TypeScript:
- focused tests:
- full tests:
- production build:
- git diff --check:

Build artifact:
- main.js mtime:
- main.js size:
- main.js SHA-256:

Phase guard:
- path:
- frozen behaviors recorded:
- regression gate recorded:

Docs updated:
- files:

Archived:
- files/directories:

Unrelated changes excluded:
- files:

Committed files:
- files:

Commit:
- hash:
- message:

Push performed?
- no

Tag created?
- no

Post-commit git status:

Residual risks:

Next phase:
- KnowledgeData Foundation candidate
- not started

Recommended next action:
- review commit result
- then create KnowledgeData Foundation Phase K1 brief
```

注意：

```text
最终报告必须包含在 commit 中。
```

为了避免 amend 或第二个 commit，报告中的 commit hash 可写：

```text
Commit hash:
Captured after commit in terminal output; see final Codex response.
```

最终 Codex 回复必须给出真实 commit hash。

---

# 12. 失败处理

以下任一情况发生时不得 commit：

```text
测试失败
build 失败
git diff --check 失败
发现运行时代码仍需修复
无法分类的大量无关变更
阶段守卫无法准确反映当前行为
canonical 状态文档冲突且无法安全判断
```

失败时：

```text
保留工作区
不回滚
不 stash
不删除
写报告
返回用户
```

---

# 13. 完成标准

全部满足才算完成：

```text
1. TypeScript 通过
2. focused tests 全部通过
3. full tests 全部通过
4. production build 通过
5. git diff --check 通过
6. 无调试代码或生产硬编码
7. Phase 2.1.2B 标记为 finalized
8. 阶段守卫创建完成
9. 已完成 incoming 文件归档
10. 无关变更未提交
11. 正式 commit 已创建
12. commit 内容经过检查
13. 不 push
14. 不 tag
15. 最终报告完成
16. 下一阶段尚未开始
