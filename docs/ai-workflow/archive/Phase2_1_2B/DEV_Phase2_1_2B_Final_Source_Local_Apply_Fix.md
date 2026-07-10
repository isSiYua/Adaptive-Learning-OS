# DEV / FIX Phase 2.1.2B — 最终定位、重复正文、错误 Marker 与 Inbox 来源显示

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

本轮真实手动测试报告：

```text
/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/incoming/MANUAL_QA_Phase2_1_2B_Final_Post_Fix_Chinese(1).md
```

建议重点读取的真实笔记：

```text
/Users/issiyua/Desktop/Learning/Study/Phase2_1_2B/FINAL_QA_Phase2_1_2B.md
/Users/issiyua/Desktop/Learning/Study/Phase2_1_2B/POST_FIX_Phase2_1_2B_Master_Test.md
/Users/issiyua/Desktop/Learning/Study/测试.md
```

禁止修改：

```text
/Users/issiyua/Desktop/Learning/Study/How to Use AI.md
```

开发报告输出：

```text
/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/reports/REPORT_DEV_Phase2_1_2B_Final_Source_Local_Apply_Fix.md
```

---

# 0. 本轮只修复四个已确认问题

## P0-1：Tip → Generated 后正文残留并重复

真实现象：

```text
Apply 后生成的 [!note]- ✍️ AI 生成内容 block 正常，
但 draft 正文的一部分或大部分在 block 下方再次出现。
```

这不是 AI 生成两次，而是 Apply 后旧 draft body 未被完整删除。

---

## P0-2：复杂 Tip / Note 集合中最终 block 插入到错误位置

真实现象：

```text
在一长串 tip / note / tip / note / note / tip 结构中，
从中间某个 tip 或 note 发起 Ask。

draft 出现位置通常正常，
但 Apply 后 final block 被插入整个连续 Learning OS block 集合的末尾，
而不是本次真正选中的 source block 下方。
```

这是严重定位错误。

---

## P0-3：Normal note Ask 出现错误的 `item-1` duplicate-marker 回滚

真实现象：

用户在普通原文中选中：

```text
竞赛算法
```

原文：

```text
竞赛算法、高级动态规划、线段树、树状数组、高级图论。
```

Ask：

```text
这是啥
```

Apply 报错：

```text
Apply duplicate-marker check failed:
writing this proposal would duplicate Learning OS markers
(items item-1).
The note was rolled back.
```

这是 normal-note Ask，不应莫名复用或制造 `item-1`。

必须检查对应真实 Ask job、proposal、draft、target 和 Apply 前后 Markdown。

---

## P2-1：Inbox 中“原文”显示错误

真实现象：

```text
Normal note 发起 Ask：
“原文”显示普通段落，正确。

Tip / Generated block 中继续 Ask：
“原文”仍显示最初普通段落，错误。
```

正确规则：

```text
normal-note：
显示本次选中文本所在的普通原文段落。

clarification-item：
显示本次实际选中的 tip item 内容。

generated-content-item：
显示本次实际选中的 generated item 内容。
```

原始普通段落可以作为后台上下文保留，但不能继续冒充本次 Ask 的“原文”。

---

# 1. 已通过路径，禁止回归

本轮开发必须保持以下真实手动测试结果：

```text
Q2 Note → Generated：Pass
新内容正确追加到原 generated block。

Q3 Note → Clarification：Pass
新 tip 正确出现在 source note 下方。

Q4 “举个例子说明”：Pass
编辑建议非空，draft 正常，Apply 可用。

Q5 “生成一个小故事解释”：Pass
编辑建议非空，draft 正常，Apply 可用。

D1 无关历史 duplicate marker：Pass
旧重复不阻塞当前安全 Apply。

D2 target marker 本身重复：Pass
安全 rollback，draft 保留，错误提示准确。
```

不要再次修改已经稳定的 generated satisfaction 逻辑，除非修复需要且有完整回归测试。

---

# 2. Bug A：Tip → Generated 后正文残留

## 2.1 真实失败结构

真实结果类似：

```markdown
> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: ... -->
>
> <!-- learnos-item-id: ... -->
> **小故事帮助我理解** 第一段
> 第二段
> 第三段
> ...
> 最后一段

> 第二段
> 第三段
> ...
> 最后一段
```

说明：

```text
final block 正常；
draft marker 已消失；
但 draft body 从某一段开始残留。
```

## 2.2 重点检查

检查以下文件：

```text
src/ask/InlineDraftBlock.ts
src/ask/InlineDraftStaging.ts
src/jobs/ApplyAskJobProposal.ts
src/jobs/LiveClarificationState.ts
```

重点确认：

```text
1. Markdown blockquote lazy continuation line 是否被完整识别；
2. draft block range 是否包含所有无 `>` 前缀的延续行；
3. blank line 后仍属于同一 callout body 的内容是否被提前截断；
4. Apply 是否先插入 final，再用旧 offset 删除 draft；
5. draft range 是否在 note 修改后重新定位；
6. source block / draft block / final block 是否共用了不同 parser；
7. 删除 draft 时是否只删除 marker 区间，未删除完整正文。
```

## 2.3 必须实现的规则

Apply 后：

```text
draft-id 出现 0 次
draft-job-id 出现 0 次
draft-kind 出现 0 次
draft body 残留 0 次
final generated item marker 出现 1 次
final generated body 出现 1 次
```

不能通过全文字符串去重解决。

必须从：

```text
draft block 精确范围
live draft 重新定位
一次性 Apply 顺序
```

层面修复。

## 2.4 推荐实现顺序

```text
1. 通过 draft-id / job-id 重新定位 live draft；
2. 使用统一 parser 获取完整 draft block；
3. 重新定位 live source / target；
4. 在内存中构造最终 Markdown；
5. 完整移除 draft block；
6. 插入 final block；
7. 检查 marker 和正文唯一性；
8. 一次性写回；
9. 任一步失败则 rollback，并保留 draft。
```

---

# 3. Bug B：复杂连续 Callout 的 source-local 插入错误

## 3.1 当前错误

当笔记结构为：

```text
tip
note
tip
note
note
tip
note
...
```

用户在中间某个 tip 中 Ask generated request。

当前程序有时：

```text
把后面所有连续 Learning OS callout 当成一个大 cluster；
把 final block 插到整个 cluster 最末尾；
导致结果远离真正 source。
```

## 3.2 正确产品规则

### clarification-item + generated request

```text
在本次 source tip 紧邻下方创建 generated note。
```

### clarification-item + clarification request

```text
更新 / append 到本次 source tip。
```

### generated-content-item + generated request

```text
append 到本次 source generated block。
```

### generated-content-item + clarification request

```text
在本次 source generated block 紧邻下方创建 clarification tip。
```

### normal-note

```text
在本次 source paragraph 下方建立或追加该 source 的 output cluster。
```

## 3.3 关键限制

不能再把：

```text
连续出现的全部 [!tip] / [!note]
```

默认视为同一个 source 的 output cluster。

必须优先依赖：

```text
askSourceMode
source container id
source item id
source block hash
live source text
source block range
```

关联本次 source。

## 3.4 Source-local cluster 定义

对于 normal-note，可以使用 source-local output cluster：

```text
仅包含明确属于该 normal source 的 output block。
```

对于 clarification-item / generated-content-item：

```text
不得扫描并跨越多个不相关 callout。
```

如果需要创建新 block：

```text
插入点 = 当前 source block 的完整结束位置之后。
```

如果 source generated block 已存在：

```text
generated request 直接 append 到该 block 内部。
```

---

# 4. Bug C：`item-1` duplicate-marker 错误

## 4.1 必须读取真实失败 job

在以下目录搜索：

```text
/Users/issiyua/Desktop/Learning/Study/.learning-os/ask-jobs/
/Users/issiyua/Desktop/Learning/Study/.learning-os/logs/
```

关键词：

```text
竞赛算法
这是啥
item-1
测试.md
```

建议命令：

```bash
rg -n \
  '竞赛算法|这是啥|item-1|测试\.md' \
  /Users/issiyua/Desktop/Learning/Study/.learning-os/ask-jobs \
  /Users/issiyua/Desktop/Learning/Study/.learning-os/logs
```

## 4.2 必须确认的真实字段

```text
job id
askSourceMode
sourceBlock
sourceBlockHash
selectedText
proposal operation
proposal targetContainerId
proposal targetItemId
proposed item id
draft item id
final item id
before marker counts
after marker counts
ambiguous target fields
```

## 4.3 可能根因方向

必须用真实数据确认，不要直接假设。

重点排查：

```text
1. normal-note fallback proposal 默认生成固定 `item-1`；
2. parser 把结构化 AI 结果中的数组序号转成 `item-1`；
3. proposed item id 生成失败时使用非唯一 fallback；
4. Apply 错误复用了附近已有 item marker；
5. source-local target 解析错误，把 normal note 误识别为 Learning OS item；
6. before/after duplicate check 正确发现了本次 proposal 真正新增 `item-1`；
7. draft item id 与 final item id 转换过程错误。
```

## 4.4 正确规则

Normal-note 新建 clarification / generated item：

```text
必须生成全局足够唯一的 item id；
不得使用 item-1、item-2 这类固定序号；
不得复用 nearby Learning OS item id；
不得从 AI 返回内容直接信任一个未验证的 item id。
```

建议 final item id 继续使用：

```text
时间戳 + question slug
或现有项目统一的唯一 ID 生成器
```

## 4.5 duplicate guard 必须保持

不能为了让这次 Apply 成功而关闭 duplicate-marker 检查。

正确结果：

```text
修复 proposal / item id 生成或 target 定位；
duplicate guard 继续阻止真实重复。
```

---

# 5. Bug D：Inbox “原文”显示本次实际来源

## 5.1 当前错误数据绑定

Inbox 卡片当前可能始终使用：

```text
job.sourceBlock
```

作为“原文”。

但对于：

```text
clarification-item
generated-content-item
```

用户本次 Ask 的直接来源其实是 Learning OS item。

## 5.2 正确显示规则

新增或统一一个显示字段，例如：

```text
displaySourceText
currentAskSourceText
selectedItemSource
```

具体命名由现有架构决定。

显示逻辑：

```text
normal-note：
  sourceBlock

clarification-item：
  本次选中的 clarification item 完整可见文本

generated-content-item：
  本次选中的 generated item 完整可见文本
```

“选中文本”仍显示：

```text
selectedText
```

“原文”显示：

```text
selectedText 所在的当前 item / 当前普通段落
```

## 5.3 原始学习上下文

如果产品仍需要展示最初普通段落，可以另加：

```text
原始学习上下文
```

但本轮不要求新增 UI 区块。

最低要求：

```text
“原文”不再错误显示最初普通段落。
```

## 5.4 历史记录兼容

旧 Ask job 可能没有新字段。

旧记录显示时：

```text
优先使用现有 item snapshot；
没有时 fallback 到 sourceBlock；
不能报错。
```

---

# 6. 必须新增的自动测试

## 6.1 Draft 正文残留

建立真实结构测试：

```text
tip source
generated draft
多段 blockquote
列表
粗体
blank line
lazy continuation line
```

Apply 后断言：

```text
每个唯一正文句子只出现 1 次
所有 draft marker 出现 0 次
无 marker 的残留 blockquote 出现 0 次
```

至少使用：

```text
UNIQUE-JWT-STORY-ALPHA
UNIQUE-JWT-STORY-BETA
UNIQUE-JWT-STORY-GAMMA
```

## 6.2 复杂相邻 Callout 定位矩阵

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

分别从：

```text
tip A
note B
tip C
note D
tip F
```

发起 Ask。

断言：

```text
clarification-item + generated：
紧邻本次 tip 下方

generated-content-item + generated：
append 到本次 note

generated-content-item + clarification：
紧邻本次 note 下方

不会统一追加到整个连续 callout 集合的末尾
不会跨越下一个不相关 source
```

## 6.3 `item-1` 回归测试

使用真实失败 job 形状：

```text
selectedText: 竞赛算法
sourceMode: normal-note
sourceBlock: 竞赛算法、高级动态规划、线段树、树状数组、高级图论。
question: 这是啥
```

断言：

```text
proposal item id 不是 item-1
final item id 唯一
Apply 成功
duplicate guard 不误报
```

再增加负向测试：

```text
proposal 真正复用已有 item id
→ 仍然 rollback
```

## 6.4 Inbox source display

覆盖：

```text
normal-note
clarification-item
generated-content-item
```

断言：

```text
Normal：
原文 = normal source block

Tip：
原文 = 当前 clarification item 文本

Generated：
原文 = 当前 generated item 文本
```

历史 job 缺少新字段：

```text
安全 fallback，不报错
```

## 6.5 保留已有回归

必须继续通过：

```text
Q2 Note → Generated
Q3 Note → Clarification
Q4 举个例子说明
Q5 生成一个小故事解释
D1 unrelated duplicate
D2 ambiguous target
T8 deleted draft no-op
T11 repeat clarification merge
```

---

# 7. 需要检查的代码

重点检查：

```text
src/ask/InlineDraftBlock.ts
src/ask/InlineDraftStaging.ts
src/ask/AskIntent.ts
src/jobs/ApplyAskJobProposal.ts
src/jobs/LiveClarificationState.ts
src/jobs/AskJobService.ts
src/views/AskInboxState.ts
src/views/AskInboxView.ts
src/types.ts
```

测试：

```text
tests/asyncInbox.test.mjs
tests/inlineDraftStaging.test.mjs
tests/paragraphClarification.test.mjs
tests/askWorkflowUx.test.mjs
```

---

# 8. 开发后的真实 Obsidian 测试

## 8.1 先构建，再重新加载插件

必须：

```text
1. production build
2. 记录 main.js mtime 和 SHA-256
3. 完全退出 Obsidian
4. 重新打开 Study Vault
   或 Disable → Enable 插件
5. 再做真实 Ask / Apply
```

没有重新加载插件，UI 测试无效。

## 8.2 创建最小测试文件

建议：

```text
/Users/issiyua/Desktop/Learning/Study/Phase2_1_2B/DEV_SMOKE_Final_Source_Local_Apply_Fix.md
```

不要复制整个旧 Master Test。

## 8.3 必须执行的 Live Smoke

### Live A：Tip → Generated

```text
从 tip item Ask：
编一个小故事帮助我理解
```

检查：

```text
final block 在 source tip 下方
正文只出现一次
draft body 无残留
```

### Live B：复杂 Callout 集合

创建：

```text
tip → note → tip → note → note → tip
```

从中间 tip Ask generated request。

检查：

```text
final block 紧邻当前 tip 下方
不会跑到整个集合最末尾
```

### Live C：Normal `竞赛算法`

```text
选中：竞赛算法
Ask：这是啥
```

检查：

```text
Apply 成功
不再出现 item-1 duplicate-marker
```

### Live D：Inbox Tip source

从 tip item 发起 Ask。

检查 Inbox：

```text
选中文本正确
原文显示当前 tip item，而不是最初普通段落
```

### Live E：Inbox Generated source

从 generated item 发起 Ask。

检查 Inbox：

```text
原文显示当前 generated item
```

如果 UI 自动化仍无法可靠执行：

```text
明确写未完成
不要声称通过
```

---

# 9. 禁止事项

不要：

```text
关闭 duplicate-marker guard
通过全文字符串去重修复正文重复
清理用户旧笔记
强制所有连续 callout 归为同一 cluster
只对 item-1 做字符串替换
只对“竞赛算法”做特判
删除旧 Ask job
更新大 docs/context
commit
tag
push
```

---

# 10. 验证命令

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

系统 Node 不可用时，使用 Codex 自带 Node，并记录完整路径。

---

# 11. 开发报告格式

写入：

```text
/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/reports/REPORT_DEV_Phase2_1_2B_Final_Source_Local_Apply_Fix.md
```

报告必须包含：

```text
Phase / task:

Real failed jobs inspected:
- duplicated body job:
- complex placement job:
- item-1 job:
- inbox source-display jobs:

Root cause A — draft body residue:
- exact cause:
- parser/range behavior before:
- behavior after:

Root cause B — complex source-local placement:
- exact cause:
- cluster logic before:
- source-local rules after:

Root cause C — item-1:
- exact origin of item-1:
- proposal behavior before:
- behavior after:
- duplicate safety preserved?:

Root cause D — Inbox source display:
- old field:
- new display rule:
- old job fallback:

Files changed:

Tests added:
- multi-paragraph/lazy continuation draft removal:
- complex callout matrix:
- item-1 normal-note regression:
- Inbox source-mode display:
- preserved Q2/Q3/Q4/Q5/D1/D2:

Verification:
- TypeScript:
- Focused tests:
- Full tests:
- Production build:
- git diff --check:

Obsidian reload:
- main.js mtime:
- main.js SHA-256:
- reload method:
- reload time:

Live smoke:
- Tip → Generated duplicate body:
- Complex source-local placement:
- 竞赛算法 / 这是啥:
- Inbox Tip 原文:
- Inbox Generated 原文:

Known limitations:

Docs/context updated? no/deferred
Commit created? no
Ready for final QA? yes/no
Recommended next step:
```

---

# 12. 完成标准

全部满足才算完成：

```text
1. Tip → Generated 正文只出现一次
2. draft body 不残留
3. 复杂连续 callout 中 final block 紧邻真实 source
4. 不再把整个连续 callout 集合视为一个大 cluster
5. “竞赛算法 / 这是啥”不再生成或复用 item-1
6. duplicate-marker 安全检查仍有效
7. Inbox Tip Ask 的“原文”显示当前 tip item
8. Inbox Generated Ask 的“原文”显示当前 generated item
9. Q2/Q3/Q4/Q5 保持通过
10. D1/D2 保持通过
11. 自动测试全部通过
12. production build 通过
13. 插件重新加载
14. 尽可能完成真实 UI smoke
15. 不 commit
