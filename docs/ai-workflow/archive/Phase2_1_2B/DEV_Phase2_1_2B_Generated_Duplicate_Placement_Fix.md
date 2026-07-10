# DEV / FIX Phase 2.1.2B — Generated Proposal Reliability, Duplicate Guard Delta, Deterministic Placement

项目：Adaptive Learning OS  
任务类型：统一开发修复任务  
执行模型：Codex 5.5  
项目路径：

```text
/Users/issiyua/Documents/Adaptive_Learning_OS
```

Obsidian Vault：

```text
/Users/issiyua/Desktop/Learning/Study
```

用户真实测试笔记：

```text
/Users/issiyua/Desktop/Learning/Study/Phase2_1_2B/Phase2_1_2B_Master_TestPhase2_1_2B_Master_TestA1_Normal_Clarification未命名 2.md
```

输入 Bug Inventory：

```text
/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/reports/BUG_INVENTORY_Phase2_1_2B_Full_Manual_QA.md
```

开发报告输出：

```text
/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/reports/REPORT_DEV_Phase2_1_2B_Generated_Duplicate_Placement_Fix.md
```

---

# 0. 本轮目标

本轮只修复 Phase 2.1.2B 已经通过真实 Obsidian 手动测试确认的 Bug。

必须统一解决：

```text
P0-1：Generated-content 请求被错误判为“不满足要求”
      → AI 回答和解析结果有效
      → 合并理由错误
      → 编辑建议 empty
      → 没有 draft
      → Apply 不可用

P0-2：笔记中历史存在的无关 duplicate marker
      会阻塞当前本来安全的 Apply

P1-1：Normal-note 来源的新 tip/note block
      插入位置和顺序不稳定
      必须稳定地位于被选中内容下方

P2-1：Target marker 本身重复时，
      应显示“目标不唯一”的准确错误，
      不能与“当前 proposal 新制造重复”混为一谈
```

不要在本轮实现：

```text
自动合并所有 tip block
自动合并所有 generated block
全 Vault duplicate repair
KnowledgeData 全面清理
Review / Note Check / Context Pack Builder
PDF / PPT ingestion
向量数据库
新 Web 功能
大范围 Ask workflow 重构
```

---

# 1. 执行原则

## 1.1 用户手工测试是本轮事实来源

不要因为现有 deterministic tests 通过就否定用户真实观察。

用户已经在真实 Obsidian 中确认：

```text
T2 Normal → Story：Fail
T6 Tip → Story：Fail
T7 第一个 Story Ask：Fail
T9 “再补充一个例子”：Fail
T12 多个带元指令的 Story Ask：Fail
C1 历史无关 duplicate：Fail
```

真实成功路径也已经确认：

```text
T1 Normal → Clarification：Pass
T3 Generated → Clarification：Pass
T4 Generated → Story：Pass
T5 Tip → Clarification：Pass
T8 删除 draft 后 no-op：Pass
T11 重复解释 existing item 的语义合并：Pass
Inbox UI / Sticky Apply：Pass
```

修复不能破坏这些已通过路径。

## 1.2 本轮不要 commit

除非用户之后明确要求，否则：

```text
不要 git commit
不要 tag
不要 push
```

## 1.3 不更新大 docs/context

只允许：

```text
代码
测试
必要的小型 fixture
production build
本轮 compact implementation report
```

不要更新：

```text
docs/context/*
master plan
handoff docs
大范围架构文档
archive
```

---

# 2. 开始前必须读取

请先读取：

```text
docs/ai-workflow/reports/BUG_INVENTORY_Phase2_1_2B_Full_Manual_QA.md
docs/ai-workflow/reports/REPORT_DEV_Phase2_1_2B_Runtime_Artifact_Hardening.md
docs/ai-workflow/reports/REPORT_QA_Phase2_1_2B_Live_Obsidian_Smoke.md
```

检查相关代码：

```text
src/ask/AskIntent.ts
src/ask/ClarificationMergeProposal.ts
src/ask/InlineDraftStaging.ts
src/ask/InlineDraftBlock.ts
src/jobs/AskJobService.ts
src/jobs/ApplyAskJobProposal.ts
src/jobs/LiveClarificationState.ts
src/views/AskInboxState.ts
src/views/AskInboxView.ts
src/main.ts
src/types.ts
tests/asyncInbox.test.mjs
tests/inlineDraftStaging.test.mjs
tests/paragraphClarification.test.mjs
tests/askWorkflowUx.test.mjs
```

同时检查真实 runtime artifacts：

```text
/Users/issiyua/Desktop/Learning/Study/.learning-os/ask-jobs/
/Users/issiyua/Desktop/Learning/Study/.learning-os/logs/
/Users/issiyua/Desktop/Learning/Study/.learning-os/clarifications/
```

优先搜索这些真实问题文本：

```text
编一个小故事帮助我理解它
编一个小故事帮助我理解
编一个简短故事
再补充一个例子
测试一下，编一个小故事
测试一下，编一个故事
再编一个完全不同的故事
```

建议：

```bash
rg -n \
  '编一个小故事帮助我理解它|编一个小故事帮助我理解|编一个简短故事|再补充一个例子|测试一下，编一个小故事|测试一下，编一个故事|再编一个完全不同的故事' \
  /Users/issiyua/Desktop/Learning/Study/.learning-os/ask-jobs \
  /Users/issiyua/Desktop/Learning/Study/.learning-os/logs
```

必须使用真实失败 job 的字段形状建立 regression fixtures，不要只构造理想化 payload。

---

# 3. 真实测试文件使用规则

用户允许使用：

```text
/Users/issiyua/Desktop/Learning/Study/Phase2_1_2B/Phase2_1_2B_Master_TestPhase2_1_2B_Master_TestA1_Normal_Clarification未命名 2.md
```

但开发测试前必须先保护原始数据。

## 3.1 先建立备份

在同目录创建只读备份：

```text
Phase2_1_2B_Master_Test_before_DEV_fix_backup.md
```

如果同名已存在，使用时间戳后缀。

## 3.2 创建开发测试副本

优先创建：

```text
/Users/issiyua/Desktop/Learning/Study/Phase2_1_2B/DEV_Phase2_1_2B_Runtime_Fix_Test.md
```

要求：

```text
普通 live smoke 使用开发测试副本
原用户测试笔记主要用于读取、比对和提取真实 fixture
不得批量修改整个 Vault
不得修改 How to Use AI.md
不得删除用户原测试结果
```

绝对禁止修改：

```text
/Users/issiyua/Desktop/Learning/Study/How to Use AI.md
```

---

# 4. P0-1：修复 Generated-content false rejection

## 4.1 已确认的失败模式

真实失败 job 具有：

```text
raw AI answer：非空
parsed answer：key_answer / suggested_takeaway 非空
answer 语义上已经完成故事、例子或类比请求
merge reason 却错误显示：
  “AI 回答没有包含你要求的内容……”
proposedVisibleMarkdown：空
inline draft：不存在
Apply：disabled
```

真实失败示例包括：

```text
Normal note：
  编一个小故事帮助我理解它

Tip：
  编一个小故事帮助我理解

Generated item：
  编一个简短故事
  再补充一个例子

Normal note / long paragraph：
  测试一下，编一个小故事
  测试一下，编一个故事
```

## 4.2 强线索：元指令和修饰词被过度字面匹配

真实测试显示：

```text
“测试一下，编一个小故事” → 失败
“编一个小故事” → 成功

“测试一下，编一个故事” → 失败
“编一个故事” → 成功

“测试一下，这是什么？” → 成功
```

这说明 generated satisfaction checker 很可能没有正确区分：

```text
核心任务：
  编故事
  生成例子
  给类比
  补充内容
  改写
  扩写

元指令 / 语气 / 修饰词：
  测试一下
  帮助我理解
  简短
  完全不同
  再
  一下
  给我
```

不要要求 AI answer 必须逐字包含这些元指令。

## 4.3 必须建立的 acceptance 规则

对于 `outputKind = generated-content`：

### 应接受

如果满足以下条件：

```text
AI answer 非空
不是拒绝
不是报错
不是明显无关
不是占位符
具有可用正文
语义上完成核心 generated intent
```

则必须：

```text
生成 non-empty proposal
生成 non-empty proposedVisibleMarkdown
生成 inline draft
Apply enabled
```

### 不应误拒绝

不能因为 AI answer 没有逐字出现：

```text
测试一下
帮助我理解
简短
不同
再
一下
```

就判定失败。

### 仍应拒绝

以下情况必须继续失败：

```text
空答案
纯拒绝
只说“无法回答”
完全答非所问
只有元数据没有正文
明显没有完成核心生成任务
```

## 4.4 建议的分层判定

实现不必完全按此命名，但逻辑应覆盖：

```text
1. parse generated intent
2. 提取核心任务类型
3. 将元指令和软修饰词标记为 non-blocking
4. 检查 answer 是否有 usable generated body
5. satisfaction checker 不确定时：
   使用安全 fallback proposal
6. 只有明确 unusable 时才 empty/failed
```

建议将约束分为：

```text
hard constraints：
  必须是故事
  必须是例子
  必须比较 A/B
  必须输出列表
  必须包含指定实体（用户明确要求时）

soft modifiers：
  简短
  详细一点
  帮助我理解
  测试一下
  再
  不同
```

soft modifier 不满足时，不应使 proposal 完全为空。

## 4.5 Proposal completeness invariant

不得存在：

```text
status = completed/pending
AI answer 非空
parsed answer 非空
editable suggestion empty
inline draft 不存在
Apply disabled
```

此时只能：

```text
A. 构造安全 fallback proposal；
或
B. 将 job 标为明确失败并写入真实原因。
```

不能保持当前这种半成功状态。

## 4.6 真实 fallback 内容

若 structured proposal item 缺失或 malformed，但 AI answer 可用：

```text
generated item title：
  从 question 或 answer 生成简洁标题

generated body：
  使用完整 answer 正文

proposedVisibleMarkdown：
  必须非空

proposal operation：
  依据 source mode 决定 add-item / add-sibling-item / create-block
```

不要只使用 `suggested_takeaway` 替代完整故事正文。

---

# 5. P0-2：修复 duplicate marker guard

## 5.1 当前错误

真实 C1：

```text
Apply 前：
  item-old-duplicate 已出现两次

当前 proposal：
  与 item-old-duplicate 无关

Apply 后：
  item-old-duplicate 仍然只是两次
```

但当前仍 rollback：

```text
Apply duplicate-marker check failed
```

## 5.2 正确算法：比较 before / after

不要只检查：

```text
Apply 后是否存在任何 duplicate marker
```

必须收集：

```text
beforeCounts
afterCounts
```

并区分：

```text
newDuplicates
worsenedDuplicates
preExistingUnchangedDuplicates
ambiguousTargetMarkers
```

## 5.3 必须 rollback

以下情况必须失败：

```text
A. beforeCount <= 1 且 afterCount > 1
   当前 Apply 新制造重复

B. afterCount > beforeCount 且 afterCount > 1
   当前 Apply 加重历史重复

C. proposal 新 item 复用已存在 final item id

D. 当前 target item id 出现多次

E. 当前 target clarification id 出现多次

F. 当前 target generated id 出现多次

G. 当前 Apply 复制整个旧 block
```

## 5.4 不应 rollback

以下情况允许 Apply：

```text
笔记中有与当前 target 无关的历史 duplicate
当前 Apply 后其 count 没有增加
当前 target 本身唯一
当前新 marker 唯一
```

允许后可记录 warning，但不要显示 blocker Notice。

## 5.5 C2 的准确错误

当 target item 本身重复时，当前安全 rollback 行为是正确的。

必须保留：

```text
Apply 失败
note rollback
draft 保留
job 不标记 applied
```

但错误提示应改为：

```text
Apply failed: the target Learning OS marker appears multiple times,
so the target block is ambiguous: item-c2-target.
```

不要继续显示：

```text
writing this proposal would duplicate markers
```

---

# 6. P1-1：稳定的 block 插入位置与顺序

## 6.1 用户明确产品要求

```text
新生成的正式 block 应出现在用户选中内容的下方。
```

多个独立 tip/note block 可以接受，不要求本轮自动合并。

但位置和顺序不能随机。

## 6.2 Normal-note source 的规则

对于 normal paragraph / normal source block：

```text
1. 定位用户发起 Ask 时的 source block。
2. 找到该 source block 后紧邻的 Learning OS output cluster。
3. 将新的 final block 追加到 cluster 末尾。
4. 顺序按成功 Apply 的顺序排列。
5. 不要每次都插回同一个 anchor 导致倒序或穿插。
```

`Learning OS output cluster` 可定义为：

```text
source block 后连续出现的：
  [!tip]- 💡 我的理解
  [!note]- ✍️ AI 生成内容
  当前 source 的 draft/final output

遇到下一个普通正文、标题或非关联 block 时停止。
```

需要根据现有数据结构采用安全实现，不要误吞相邻但不相关的内容。

## 6.3 Tip source

```text
clarification request：
  append/update 明确 live tip target

generated request：
  不复制 tip
  在该 tip/source block 下方的稳定位置创建 generated note
```

## 6.4 Generated source

```text
generated request：
  append 到同一 live generated block，或稳定创建关联 generated block

clarification request：
  在 source generated block 下方稳定创建 clarification tip
```

## 6.5 Draft 被移动后的语义

T10 已明确产品决策：

```text
移动 draft 只改变审阅位置
不改变 final target
```

因此：

```text
Apply 后 final 内容仍应回到原 source 下方
```

这不是 bug，必须保留。

## 6.6 顺序测试

对同一 source 连续成功 Apply：

```text
Q1
Q2
Q3
```

最终 block 应稳定为：

```text
source
Q1 final block
Q2 final block
Q3 final block
```

不要变成：

```text
source
Q3
Q1
Q2
```

---

# 7. 必须新增/更新的 deterministic tests

## 7.1 Generated prompt matrix

至少覆盖：

```text
编一个小故事
编一个故事
编一个小故事帮助我理解它
编一个小故事帮助我理解
编一个简短故事
再编一个完全不同的故事
再补充一个例子
测试一下，编一个小故事
测试一下，编一个故事
```

对每个 usable AI answer，断言：

```text
proposal 非空
proposedVisibleMarkdown 非空
inline draft 可生成
Apply enabled
```

## 7.2 Source mode matrix

覆盖：

```text
normal-note + generated request
clarification-item + generated request
generated-content-item + generated request
```

## 7.3 Unusable answer

覆盖：

```text
空答案
明确拒绝
完全无关
```

断言：

```text
不生成伪造 item
Apply disabled 或 job failed
错误原因明确
```

## 7.4 Duplicate before/after delta

必须有：

```text
A. unrelated historical duplicate unchanged → Apply success
B. new duplicate introduced → rollback
C. historical duplicate worsened → rollback
D. target item ambiguous → rollback + draft preserved
E. target container ambiguous → rollback + draft preserved
F. clean note → normal success
```

## 7.5 Placement/order

必须有真实 markdown fixture：

```text
normal paragraph
apply output 1
apply output 2
apply output 3
next heading
```

断言：

```text
三个 final block 均位于 source 下方
按 Apply 顺序排列
不会越过 next heading
```

覆盖：

```text
tip → generated
generated → clarification
moved draft → final still at original source target
```

## 7.6 已通过路径 regression

必须继续通过：

```text
T1 Normal → Clarification
T3 Generated → Clarification
T4 Generated → Story
T5 Tip → Clarification
T8 Delete Draft → no-op
T11 Repeat Clarification → merge/update existing
Inbox no duplicate UI
Sticky Apply one instance
```

---

# 8. 使用用户真实文件做开发后 Live Test

自动测试通过后，必须做真实 Obsidian UI smoke。

## 8.1 关键提醒：必须重新加载插件

项目 plugin 目录是 symlink：

```text
/Users/issiyua/Desktop/Learning/Study/.obsidian/plugins/adaptive-learning-os
  -> /Users/issiyua/Documents/Adaptive_Learning_OS
```

`main.js` production build 完成后，Obsidian 当前进程仍可能运行旧版本。

因此在每次 live UI smoke 前，必须：

```text
1. 运行 production build
2. 确认 main.js 已更新
3. 重新加载插件
4. 再开始 UI 测试
```

## 8.2 可接受的重新加载方式

优先使用其中一种：

### 方法 A：关闭并重新启用插件

```text
Obsidian Settings
→ Community plugins
→ Adaptive Learning OS
→ Disable
→ 等待插件完全卸载
→ Enable
```

### 方法 B：完全退出并重启 Obsidian

```text
Quit Obsidian
确认进程退出
重新打开 Vault
```

### 方法 C：Obsidian 官方 reload command

如果当前版本 Command Palette 中存在可靠的 Reload App 命令，可使用。

## 8.3 报告中必须记录

```text
production build 完成时间
main.js mtime 或 hash
实际使用的 reload 方法
reload 完成时间
live smoke 开始时间
```

如果没有重新加载插件，live smoke 结果无效。

## 8.4 权限

用户表示已经授予 Codex 操作其他软件的权限。

因此必须尝试：

```text
Computer Use / macOS UI automation
```

如果仍不可用：

```text
明确报告具体失败原因
不要声称完成 live smoke
```

---

# 9. Live smoke 测试内容

在开发测试副本中执行。

## 9.1 Generated false rejection 核心矩阵

至少执行：

```text
1. Normal source：
   测试一下，编一个小故事

2. Tip source：
   编一个小故事帮助我理解

3. Generated source：
   编一个简短故事

4. Generated source：
   再补充一个例子
```

每项 Pass：

```text
AI answer 有内容
编辑建议非空
draft 出现
Apply 可点
Apply 成功
final block 类型正确
```

## 9.2 T7 两个 Draft

必须完整执行：

```text
同一 generated target
→ 第一个 story draft
→ 不 Apply
→ 第二个 different story draft
→ Apply 第一个
→ 第二个仍保留
→ Apply 第二个
```

Pass：

```text
两个 draft 独立
两个 final item id 唯一
互不删除
```

## 9.3 C1 unrelated duplicate

在最小测试副本中放：

```text
item-old-duplicate × 2
```

然后对无关正常段落 Ask/Apply。

Pass：

```text
Apply 成功
历史重复仍为 2 次
没有变成 3 次
```

## 9.4 C2 ambiguous target

放两个相同 target item id。

Pass：

```text
Apply 安全失败
draft 保留
错误提示明确为 target ambiguous
```

## 9.5 Placement/order

对同一个 normal paragraph 连续成功 Apply 三次：

```text
解释
故事
再解释一个术语
```

Pass：

```text
三个 final block 都位于 source 下方
按 Apply 顺序排列
不会随机穿插到其他 section
```

---

# 10. 真实测试文件清理规则

开发测试完成后：

```text
不要删除用户原始测试笔记
不要删除备份
可以保留 DEV 测试副本供后续 QA
不要把 Vault 文件 git add 到项目 repo
```

不要自动清理用户的历史 duplicate marker。

---

# 11. 验证命令

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

全局 Node 不可用时，使用 Codex bundled Node，并报告完整路径。

---

# 12. 代码质量要求

```text
不要通过关闭 satisfaction checker 解决
不要无条件把任意 answer 变成可 Apply
不要移除 duplicate-marker safety
不要用 hard-coded prompt string 特判“测试一下”
不要只修一个具体中文句子
不要把所有 output 强制合并到一个 block
不要依赖 stale source offsets
```

修复必须是：

```text
意图级
schema 级
before/after invariant 级
live target 级
```

---

# 13. Compact implementation report

完成后输出并写入：

```text
/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/reports/REPORT_DEV_Phase2_1_2B_Generated_Duplicate_Placement_Fix.md
```

报告格式：

```text
Phase / task:

Real failed jobs inspected:
- job ids:
- prompts:
- source modes:

Root cause P0-1:
Generated acceptance behavior before:
Generated acceptance behavior after:

Root cause P0-2:
Duplicate guard before:
Duplicate guard after:

Placement behavior before:
Placement behavior after:

Files changed:

Tests/fixtures added:
- generated prompt matrix:
- source mode matrix:
- duplicate delta:
- placement order:
- regression coverage:

Verification:
- TypeScript:
- Focused tests:
- Full tests:
- Production build:
- git diff --check:

Obsidian runtime:
- plugin symlink confirmed:
- main.js mtime/hash:
- reload method:
- reload completed:
- UI automation available:

Live smoke:
- Normal “测试一下，编一个小故事”:
- Tip “编一个小故事帮助我理解”:
- Generated “编一个简短故事”:
- Generated “再补充一个例子”:
- Two drafts:
- C1 unrelated duplicate:
- C2 ambiguous target:
- Placement/order:

Known limitations:

Docs/context updated? no/deferred
Commit created? no
Ready for separate QA? yes/no

Recommended next step:
```

---

# 14. 完成标准

只有全部满足才算开发任务完成：

```text
1. generated false rejection root cause 已定位
2. 不是只针对一个中文 prompt 打补丁
3. T2/T6/T7/T9/T12 类型请求都有 regression tests
4. unrelated historical duplicate 不再阻塞安全 Apply
5. new/worsened duplicate 仍会 rollback
6. ambiguous target 仍安全失败且提示准确
7. normal source 输出稳定位于选中内容下方
8. 多次 Apply 顺序稳定
9. production build 通过
10. Obsidian 插件已重新加载
11. 至少执行一次真实 UI smoke
12. 不 commit
13. 输出 compact implementation report
