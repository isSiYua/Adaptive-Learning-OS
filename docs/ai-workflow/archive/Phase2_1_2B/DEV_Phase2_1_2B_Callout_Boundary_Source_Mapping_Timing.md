# DEV / FIX Phase 2.1.2B — Callout 边界、真实 Source 映射与 Ask 耗时诊断

任务类型：统一开发修复任务  
项目：Adaptive Learning OS

项目路径：

```text
/Users/issiyua/Documents/Adaptive_Learning_OS
```

Obsidian Vault：

```text
/Users/issiyua/Desktop/Learning/Study
```

真实手动测试报告：

```text
/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/incoming/MANUAL_QA_Phase2_1_2B_Final_Source_Local_Apply(1).md
```

建议重点读取的真实笔记：

```text
/Users/issiyua/Desktop/Learning/Study/Phase2_1_2B/FINAL_QA_Source_Local_Apply.md
```

建议重点读取的真实 Ask jobs：

```text
job-20260710-205415-bh7d4d
job-20260710-204650-2jn03k
job-20260710-210210-aws4bf
job-20260710-210530-gufarz
```

禁止修改：

```text
/Users/issiyua/Desktop/Learning/Study/How to Use AI.md
```

开发报告输出：

```text
/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/reports/REPORT_DEV_Phase2_1_2B_Callout_Boundary_Source_Mapping_Timing.md
```

---

# 0. 本轮目标

本轮只修复以下已确认问题：

```text
P0-1：
复杂连续 tip / note / tip / note 结构中，
程序会把多个相邻 Callout 错误合并成一个巨大容器。

P0-2：
选中某个真实 item 后，
Ask job 记录的 containerId、itemId、sourceBlock 可能属于另一个 Callout。

P0-3：
由于 source 映射错误，
draft 和 final block 会出现在错误位置。

P1-1：
Inbox“原文”虽然在简单场景已修复，
但复杂结构中会跟随错误的 selectedLearningOsItem，仍可能显示错误内容。

P1-2：
部分 Ask 长时间停留在“处理中”，
真实案例耗时约十分钟以上。
需要记录各阶段耗时，定位慢在哪里。
```

本轮不修复：

```text
新的学习功能
KnowledgeData 新功能
Review Scheduler
PDF/PPT 导入
自动整理旧笔记
大范围 UI 重构
```

不要 commit、tag 或 push。

---

# 1. 已经通过的行为，禁止回归

以下真实手动测试已通过：

```text
Tip → Generated 正文不再重复
Normal note item-1 duplicate-marker 已修复
Tip 二次 Ask 的 Inbox“原文”在简单场景正确
Generated 二次 Ask 的 Inbox“原文”在简单场景正确
Note → Generated 正常追加到原 generated block
“举个例子说明”不再 empty
“生成一个小故事解释”不再 empty
D1 无关历史 duplicate 不阻塞安全 Apply
D2 target marker 重复时安全 rollback
```

---

# 2. 真实失败证据

## 2.1 Observability 被错误识别为 Deployment

用户实际选中：

```text
Observability block 中的“解系统内”
```

真实 sourceBlock：

```text
> **Observability** 用于理解系统内部运行状态。
```

但 Ask job 中却记录：

```text
askSourceMode: clarification-item

selectedLearningOsItem:
  containerId:
  clar-20260710-204944-470-d0jyoc-b-复杂-callout-集合-检查本地插入位置

  itemId:
  deployment-1

  itemTitle:
  Deployment

  itemContent:
  将应用程序或服务从开发/测试环境发布到目标运行环境……
```

Prompt 主上下文也错误变成 Deployment。

结果：

```text
AI 生成的是 Deployment 故事
draft 出现在 Observability 上方
final block 也出现在错误位置
Inbox 原文也会跟着错误 source
```

---

## 2.2 Monitoring 被错误映射到 Caching generated block

用户实际选中：

```text
Monitoring block 中的 Monitoring
```

真实 item 应该属于：

```text
gen-final-b5
item-final-b5
```

但 Ask job 中却记录：

```text
askSourceMode:
generated-content-item

selectedLearningOsItem:
  containerId: gen-final-b2
  itemId: item-final-b5
  itemTitle: Monitoring

sourceBlock:
  整个 Caching generated block
```

并且 `siblingLearningOsItems` 错误包含该区域里几乎所有 tip / note item：

```text
Authentication
Caching
Deployment
Observability
Monitoring
Cost Control
多个故事
```

这证明 parser 把多个相邻 Callout 当成一个容器。

---

## 2.3 Deployment 同样映射到错误容器

用户实际选中：

```text
Deployment note 中的“是把应用发布到目标环境”
```

但 Ask job 中：

```text
selectedLearningOsItem.containerId = gen-final-b2
sourceBlock = Caching generated block
selectedLearningOsItem.itemId = item-final-b4
```

draft 和 final clarification 都插入到 Caching 附近，而不是 Deployment 下方。

---

# 3. 根因方向

高概率根因：

```text
Callout block range parser 为了支持 lazy continuation line
变得过于宽松。

遇到下一个同级：

> [!tip]
> [!note]
> [!todo]

时没有正确终止当前 Callout。

导致：

多个相邻 Callout
→ 被解析成同一个大 block
→ item lookup 在错误大 block 中搜索
→ containerId 与 sourceBlock 错配
→ draft/final/Inbox 全部跟着错误 source
```

必须通过真实 Markdown 和真实 job 验证，不要直接假设。

---

# 4. Callout 边界必须遵守的规则

## 4.1 新同级 Callout 必须结束当前 Callout

当前 blockquote Callout 中，遇到新的同级 Callout header：

```markdown
> [!tip]
> [!note]
> [!todo]
> [!warning]
> [!example]
```

必须立即结束前一个 Callout。

不能把后一个 Callout 继续算进前一个。

---

## 4.2 Lazy continuation line 仍需支持

中文解释：

```text
Lazy continuation line：
Callout 内有些后续行没有继续写 `>`，
但仍属于前一个引用块正文。
```

需要支持：

```markdown
> [!note]
> 第一段

第二段仍属于当前正文
```

但不能因此跨过下一个明确 Callout header。

优先级：

```text
明确的新 Callout header
> 普通 lazy continuation line
```

---

## 4.3 Heading、分隔线和普通段落边界

当前 Callout 应在以下情况结束：

```text
新的同级 Callout header
新的 Markdown heading
明确的水平分隔线
不属于当前引用块的普通段落
文件结束
```

具体实现要与现有 Markdown 行为保持一致。

---

# 5. 选区到真实 Source 的映射规则

## 5.1 映射顺序

用户产生选区后，必须：

```text
1. 获取 selection 的真实字符 offset；
2. 找到包含该 offset 的最内层 Learning OS item；
3. 由该 item 反向确定所属 container；
4. 验证 item marker 确实位于该 container 范围内；
5. 验证 selectedText 确实位于该 item 可见文本中；
6. 生成 selectedLearningOsItem；
7. 再构造 Ask job 和 Prompt。
```

不能：

```text
先找附近最近的 Callout
再猜用户选中了哪个 item
```

---

## 5.2 必须保持一致的字段

以下字段必须指向同一个真实 source：

```text
askSourceMode
sourceBlock
sourceBlockHash
sourceStartOffset
sourceEndOffset
selectedLearningOsItem.containerId
selectedLearningOsItem.itemId
selectedLearningOsItem.itemTitle
selectedLearningOsItem.itemContent
existingClarificationId
targetClarificationId
targetItemId
siblingLearningOsItems
Prompt 中的 selected item
Inbox 中的“原文”
draft target metadata
Apply target metadata
```

不能出现：

```text
sourceBlock = Observability
selected item = Deployment
container = 另一个 tip
```

---

## 5.3 运行时验证

Ask job 写入前，增加一致性验证：

```text
selected item marker 必须位于 container range 内
selected text 必须属于 selected item visible text
containerId 必须存在且唯一
itemId 必须存在且唯一
source mode 必须与 container 类型一致
```

如果验证失败：

```text
不要静默选错 source
不要继续调用模型
应显示明确错误：
“无法准确定位本次选中的 Learning OS item，请重新选择后重试。”
```

---

# 6. siblingLearningOsItems 修复

当前错误：

```text
一个 Callout 的 sibling 列表包含后续多个 Callout 的所有 item。
```

正确规则：

```text
siblingLearningOsItems
只允许包含同一个 containerId 内的 item。
```

例如：

```text
gen-final-b2
只包含该 generated block 内的 Caching 和其追加故事。

不能包含：
Observability
Deployment
Monitoring
Cost Control
其他 tip / note
```

增加断言：

```text
每个 sibling item marker offset
必须位于同一 container start/end 范围内。
```

---

# 7. Draft 与 Final 的 source 锁定规则

## 7.1 创建 Ask 时保存已验证 source identity

建议保存：

```text
sourceContainerId
sourceItemId
sourceContainerType
sourceItemHash
sourceContainerHash
selectionOffset
```

## 7.2 Draft 创建前重新验证

创建 draft 前：

```text
根据 containerId + itemId 在 live note 中重新定位
验证 item hash 或可见文本
```

失败时：

```text
安全失败，不得用附近 block 替代。
```

## 7.3 Apply 前再次验证

Apply 前：

```text
重新读取 live note
重新定位同一个 containerId + itemId
确认 source 未被删除或歧义
```

不得：

```text
根据连续 Callout cluster 重新猜 source
```

---

# 8. 正确插入规则

## clarification-item + generated-content

```text
新 generated note 紧邻当前 source tip 下方。
```

## clarification-item + clarification

```text
更新 / append 到当前 source tip。
```

## generated-content-item + generated-content

```text
append 到当前 source generated block。
```

## generated-content-item + clarification

```text
新 clarification tip 紧邻当前 source generated block 下方。
```

## normal-note

```text
保持现有 source-local output cluster 逻辑。
```

复杂区域中不能把所有连续 Callout 当成一个大 cluster。

---

# 9. Ask 长时间“处理中”的耗时诊断

## 9.1 真实现象

真实 Observability Ask：

```text
created:
2026-07-10T20:46:50+02:00

proposal / draft:
约 20:57

updated:
约 21:00
```

总耗时约十分钟以上。

最终结果正确，但用户长时间看到“处理中”。

---

## 9.2 必须记录的阶段时间

在 Ask job diagnostics 中增加：

```text
queuedAt
providerRequestStartedAt
providerResponseReceivedAt
parseCompletedAt
proposalBuildStartedAt
proposalBuildCompletedAt
draftStageStartedAt
draftStageCompletedAt
jobCompletedAt
```

并计算：

```text
queueDurationMs
providerDurationMs
parseDurationMs
proposalDurationMs
draftStageDurationMs
totalDurationMs
```

---

## 9.3 失败与重试信息

如果有：

```text
provider retry
rate limit
timeout
JSON parse retry
merge fallback
file lock wait
note modification retry
```

必须记录：

```text
retryCount
retryReason
lastRetryAt
```

---

## 9.4 UI 状态

Inbox 对处理中任务应至少能显示：

```text
正在等待模型
正在解析回答
正在生成编辑建议
正在写入 draft
```

本轮不要求完整进度条重构。

最低要求：

```text
job diagnostics 能明确定位慢在哪个阶段；
如果总耗时超过合理阈值，Inbox 能显示当前阶段或超时提示。
```

建议阈值：

```text
超过 60 秒显示“处理时间较长”
超过 provider timeout 时明确失败
不能无限处理中
```

---

# 10. 必须新增的自动测试

## 10.1 Callout 边界矩阵

构造：

```text
tip A
note B
tip C
note D
note E
tip F
note G
```

每个 Callout 都有不同 containerId 和 itemId。

对每个 item 执行 source lookup。

断言：

```text
返回正确 containerId
返回正确 itemId
sourceBlock 只包含当前 Callout
sibling items 只属于当前 Callout
```

---

## 10.2 Lazy continuation + 新 Callout

Fixture：

```markdown
> [!tip]
> 第一段

无 > 的 lazy continuation

> [!note]
> 第二个 Callout
```

断言：

```text
第一段和 lazy continuation 属于 tip
note 不属于 tip
```

---

## 10.3 真实失败回归

使用以下真实形状：

```text
选中 Observability 子串“解系统内”
必须得到：
containerId = clar-final-b3
itemId = item-final-b3
itemTitle = Observability
```

不能得到 Deployment。

---

```text
选中 Monitoring
必须得到：
containerId = gen-final-b5
itemId = item-final-b5
```

不能得到 gen-final-b2。

---

```text
选中 Deployment
必须得到：
containerId = gen-final-b4
itemId = item-final-b4
```

不能得到 Caching block。

---

## 10.4 Source 一致性失败

人为构造：

```text
sourceBlock 属于 Observability
selected item 属于 Deployment
```

断言：

```text
job 创建失败
不调用模型
错误明确
```

---

## 10.5 Draft/Apply source 锁定

创建 Ask 后，在 source 周围插入其他 Callout。

断言：

```text
draft 仍定位到原 containerId/itemId
Apply 仍定位到原 containerId/itemId
不会改用最近 Callout
```

---

## 10.6 性能诊断字段

断言：

```text
每个阶段时间字段存在
duration 非负
totalDuration 与阶段时间合理
retry 被记录
```

---

## 10.7 已通过行为回归

必须继续通过：

```text
Tip → Generated 正文唯一
item-1 normal-note fix
Inbox simple tip/generated source display
Note → Generated
Generated → Clarification
“举个例子说明”
“生成一个小故事解释”
D1
D2
deleted draft no-op
repeat clarification merge
```

---

# 11. 建议检查的代码

重点检查：

```text
src/main.ts
src/ask/InlineDraftBlock.ts
src/ask/InlineDraftStaging.ts
src/jobs/AskJobService.ts
src/jobs/ApplyAskJobProposal.ts
src/jobs/LiveClarificationState.ts
src/views/AskInboxState.ts
src/views/AskInboxView.ts
src/types.ts
```

测试：

```text
tests/inlineDraftStaging.test.mjs
tests/asyncInbox.test.mjs
tests/paragraphClarification.test.mjs
tests/askWorkflowUx.test.mjs
```

---

# 12. 真实运行记录

必须读取：

```text
/Users/issiyua/Desktop/Learning/Study/.learning-os/ask-jobs/job-20260710-205415-bh7d4d.json
/Users/issiyua/Desktop/Learning/Study/.learning-os/ask-jobs/job-20260710-204650-2jn03k.json
/Users/issiyua/Desktop/Learning/Study/.learning-os/ask-jobs/job-20260710-210210-aws4bf.json
/Users/issiyua/Desktop/Learning/Study/.learning-os/ask-jobs/job-20260710-210530-gufarz.json
```

如果文件名略有差异，使用：

```bash
rg -n \
  '205415-bh7d4d|204650-2jn03k|210210-aws4bf|210530-gufarz|Observability|Monitoring|Deployment' \
  /Users/issiyua/Desktop/Learning/Study/.learning-os/ask-jobs \
  /Users/issiyua/Desktop/Learning/Study/.learning-os/logs
```

---

# 13. 开发后的真实 Obsidian 测试

## 13.1 构建与重载

必须：

```text
1. production build
2. 记录 main.js mtime 和 SHA-256
3. 完全退出 Obsidian
4. 重新打开 Study Vault
5. 确认插件最新版本已加载
```

---

## 13.2 最小 Live Smoke 文件

创建：

```text
/Users/issiyua/Desktop/Learning/Study/Phase2_1_2B/DEV_SMOKE_Callout_Boundary_Source_Mapping.md
```

只包含：

```text
tip A
note B
tip C
note D
note E
tip F
```

不要复制完整旧测试笔记。

---

## 13.3 必须执行

### Live A

从中间的 Observability tip 选中一部分文字。

检查 Ask job：

```text
containerId 正确
itemId 正确
sourceBlock 正确
Inbox 原文正确
draft 位于正确 source
final 位于正确 source
```

### Live B

从 Monitoring generated block 选中内容。

检查：

```text
containerId = Monitoring 所属 generated block
不是 Caching block
sibling items 只属于该 block
```

### Live C

从 Deployment generated block 选中内容。

检查：

```text
draft/final 紧邻 Deployment
不会插入 Caching 附近
```

### Live D

触发一次正常 Ask。

检查 job diagnostics：

```text
各阶段耗时字段存在
```

如果 UI 自动化无法可靠完成：

```text
明确报告未完成
不要声称通过
```

---

# 14. 禁止事项

不要：

```text
通过“最近 Callout”猜 source
把连续 Callout 当成一个 container
删除 lazy continuation 支持
只针对 Observability/Monitoring/Deployment 硬编码
自动清理用户旧笔记
更新大 docs/context
commit
tag
push
```

---

# 15. 验证命令

```bash
cd /Users/issiyua/Documents/Adaptive_Learning_OS

node ./node_modules/typescript/bin/tsc -noEmit -skipLibCheck

node --loader ./tests/ts-extension-loader.mjs --test \
  tests/asyncInbox.test.mjs \
  tests/inlineDraftStaging.test.mjs \
  tests/paragraphClarification.test.mjs \
  tests/askWorkflowUx.test.mjs

node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs

node esbuild.config.mjs production

git diff --check
```

系统 Node 不可用时，使用 Codex 自带 Node，并记录路径。

---

# 16. 开发报告

写入：

```text
/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/reports/REPORT_DEV_Phase2_1_2B_Callout_Boundary_Source_Mapping_Timing.md
```

报告必须包含：

```text
Phase / task:

Real jobs inspected:
- Observability:
- Monitoring:
- Deployment:
- slow job:

Root cause A — Callout boundary:
- exact parser bug:
- lazy continuation rule:
- new Callout stop rule:

Root cause B — Source mapping:
- old lookup path:
- new offset-to-item mapping:
- consistency validation:

Root cause C — sibling pollution:
- before:
- after:

Root cause D — draft/final placement:
- before:
- after:

Root cause E — long processing:
- slowest stage:
- timing fields added:
- timeout/retry behavior:

Files changed:

Tests added:
- boundary matrix:
- lazy continuation:
- real Observability regression:
- Monitoring regression:
- Deployment regression:
- mismatch failure:
- timing diagnostics:
- preserved previous regressions:

Verification:
- TypeScript:
- Focused tests:
- Full tests:
- Production build:
- git diff --check:

Obsidian reload:
- main.js mtime:
- SHA-256:
- reload method:
- reload time:

Live smoke:
- Observability:
- Monitoring:
- Deployment:
- diagnostics:

Known limitations:

Docs/context updated? no/deferred
Commit created? no
Ready for final QA? yes/no
Recommended next step:
```

---

# 17. 完成标准

全部满足才算完成：

```text
1. 相邻 Callout 不再被合并成一个大容器
2. Lazy continuation 仍正常
3. Observability 映射到 clar-final-b3 / item-final-b3
4. Monitoring 映射到 gen-final-b5 / item-final-b5
5. Deployment 映射到 gen-final-b4 / item-final-b4
6. sourceBlock、containerId、itemId、Prompt、Inbox 一致
7. sibling items 仅来自同一 container
8. draft 和 final 都围绕真实 source
9. source 不一致时安全失败
10. Ask 各阶段耗时被记录
11. 长时间处理中不再无诊断
12. 已通过功能不回归
13. 自动测试全部通过
14. production build 通过
15. 插件重新加载
16. 尽可能完成真实 UI smoke
17. 不 commit
