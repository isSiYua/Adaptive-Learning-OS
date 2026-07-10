# DEV / FIX Phase 2.1.2B — 生成内容重复、相邻 Callout 定位与剩余 Empty 修复

项目：Adaptive Learning OS  
任务类型：统一开发修复任务  

项目路径：

```text
/Users/issiyua/Documents/Adaptive_Learning_OS
```

Obsidian Vault：

```text
/Users/issiyua/Desktop/Learning/Study
```

建议读取的修复后测试笔记：

```text
/Users/issiyua/Desktop/Learning/Study/Phase2_1_2B/POST_FIX_Phase2_1_2B_Master_Test.md
```

禁止修改：

```text
/Users/issiyua/Desktop/Learning/Study/How to Use AI.md
```

开发报告输出：

```text
/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/reports/REPORT_DEV_Phase2_1_2B_Duplicate_Content_Adjacent_Placement_Empty_Fix.md
```

---

# 0. 本轮已经确认的状态

已经通过真实手动测试：

```text
D1：
笔记中存在与当前操作无关的历史重复 item marker，
当前安全 Apply 仍然成功。
结论：Pass。

D2：
当前 target item marker 本身出现两次，
Apply 安全失败，note 回滚，draft 保留，
并显示“目标不唯一”提示。
结论：Pass。
```

不要破坏 D1、D2 已经正确的行为。

当前剩余问题集中为三类：

```text
P0-1：
Tip source → Generated request
Apply 后生成的 [!note] block 正常，
但 block 正文会在 block 下方再次复制一遍。

P0-2：
某些明确有效的“举例 / 小故事”回答，
仍被错误判为没有完成请求，
导致编辑建议 empty、无 draft、Apply 不可用。

P1：
相邻的 [!note] / [!tip] 结构中，
输出位置仍然不稳定：
有时生成在 source block 上方，
有时生成到离 source 很远的位置。
```

本轮只修复以上问题。

不要实现新功能，不要扩大范围，不要 commit。

---

# 1. 真实 Bug A：生成内容被写入两次

## 1.1 用户真实复现条件

常见结构：

```markdown
> [!tip]- 💡 我的理解
> ...
> source item

> [!note]- ✍️ AI 生成内容
> ...
```

用户在前面的 tip block 中选中内容，Ask 一个生成类问题，例如：

```text
编一个小故事，帮助我理解
```

Apply 后出现：

```text
1. 一个正常的 [!note]- ✍️ AI 生成内容 block
2. 同一故事正文紧跟在该 block 下方，再出现一次
3. 第二份正文没有新的 generated container marker
4. 第二份正文仍然带 blockquote `>` 前缀
```

真实结果类似：

```markdown
> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: ... -->
>
> <!-- learnos-item-id: ... -->
> **小故事** 第一段
> 第二段
> 第三段

> 第二段
> 第三段
```

也就是：

```text
同一个 AI 正文一部分或大部分出现两次。
```

出现频率较高。

## 1.2 已观察到的结构矩阵

### 情况 A

```text
tip block → note block
在 tip block 中 Ask 解释类问题
```

结果：

```text
正常，没有明显 Bug。
```

### 情况 B

```text
tip block → note block
在 tip block 中 Ask 生成类问题
```

结果：

```text
生成的 note block 正常，
但正文在下方重复一次。
```

### 情况 C

```text
note block → tip block
在 note block 中 Ask 生成类问题
```

结果：

```text
生成结果内容正常，
但输出位置错误，出现在 source note block 上方。
```

### 情况 D

```text
note block → tip block
在 note block 中 Ask 解释类问题
```

结果：

```text
生成的 tip 内容正常，
但位置错误，出现在 source note block 很远的上方。
```

---

# 2. Bug A 的修复要求

## 2.1 必须先复现并做前后 Markdown 差异分析

不要直接猜根因。

请检查真实对应 Ask job、draft 和日志：

```text
/Users/issiyua/Desktop/Learning/Study/.learning-os/ask-jobs/
/Users/issiyua/Desktop/Learning/Study/.learning-os/logs/
```

搜索问题文本：

```text
编一个小故事
帮助我理解
```

并检查：

```text
sourceMode
source block range
target container id
draft id
draft block range
proposal markdown
final markdown
draft removal range
final insertion range
```

重点确认是否属于以下任一情况：

```text
1. draft block 删除范围不完整，只删掉 header 或第一部分；
2. 使用旧行号/旧 offset 删除 draft，导致正文残留；
3. 先插入 final，再用旧位置删除 draft，删除错了位置；
4. draft 的 blockquote body 被解析成两个区间；
5. generated item formatter 将 answer body 拼接了两次；
6. Apply 同时使用 proposal markdown 和 live draft markdown；
7. 相邻 callout 解析把 draft 尾部误识别为另一个 block。
```

必须使用真实 before/after Markdown 确认根因。

## 2.2 内容唯一性规则

一次 Apply 后必须满足：

```text
新的 generated item marker 出现 1 次；
新的 generated body 出现 1 次；
新的 generated container 出现 1 次或按明确 append 规则复用旧 container；
对应 draft marker 出现 0 次；
draft body 不得残留为无 marker 的 blockquote；
原 tip item marker 仍然只出现 1 次。
```

## 2.3 不允许的修法

不要：

```text
通过简单字符串去重删除相同段落；
只针对当前故事文本做特判；
Apply 后扫描整篇文档并删除所有相似内容；
忽略 live draft，直接永远使用旧 proposal；
关闭 draft staging。
```

必须从 block 范围、应用顺序和 live draft 识别层修复。

## 2.4 建议的安全顺序

需要检查现有实现，最终应保证类似：

```text
1. 通过 draft-id / job-id 重新定位当前 live draft；
2. 读取当前 live draft 的完整 Markdown；
3. 重新定位当前 live target；
4. 在内存中构造最终 note；
5. 删除完整 draft block；
6. 插入或合并 final item；
7. 做 marker 和正文唯一性检查；
8. 一次性写回；
9. 任一步失败则 rollback，draft 保留。
```

不要依赖生成 draft 时保存的旧字符位置。

---

# 3. 真实 Bug B：有效“举例 / 小故事”回答仍被判 empty

## 3.1 新的真实失败问题一

用户 Ask：

```text
举个例子说明
```

AI 回答明确给出了智能客服 Agent 查询订单的完整例子：

```text
用户询问“帮我查一下订单状态”
→ LLM 理解意图
→ 调用订单 API
→ 异常时重试或切换备用 API
→ 综合上下文回答
```

解析结果也正常：

```text
key_answer 非空
suggested_takeaway 非空
```

但合并理由错误显示：

```text
AI 回答没有包含你要求的内容：“举个例子说明”。
```

最终：

```text
编辑建议 empty
没有 draft
Apply 不可用
```

## 3.2 新的真实失败问题二

用户 Ask：

```text
生成一个小故事解释
```

AI 回答明确生成了完整故事：

```text
LLM 小镇
功能电话本
Function Calling
调用外部 API 查天气、订奶茶
```

解析结果正常。

但仍错误显示：

```text
AI 回答没有包含你要求的内容：“生成一个小故事解释”。
```

最终：

```text
编辑建议 empty
没有 draft
Apply 不可用
```

## 3.3 特别注意 Unicode 正规化

第二个真实 AI 回答中出现了兼容形式字符，例如：

```text
⼀
⽅
⼩
⻓
⽤
```

它们视觉上像普通中文：

```text
一
方
小
长
用
```

但底层编码可能不同。

在进行：

```text
关键词匹配
意图判断
答案相关性判断
```

之前，应考虑进行 Unicode NFKC 正规化。

中文解释：

```text
Unicode NFKC 正规化：
把“看起来一样但底层编码不同”的字符统一成标准形式，
避免明明是同一个字，程序却判断成不同。
```

不能只对空格和大小写做处理。

---

# 4. Bug B 的修复要求

## 4.1 不再采用“完整用户句子必须出现在回答中”的判断

下面这些用户问题是任务指令，不是答案中必须逐字出现的内容：

```text
举个例子说明
生成一个小故事解释
编一个小故事帮助我理解
测试一下，编一个故事
再补充一个例子
```

应提取核心意图：

```text
例子
故事
解释性故事
补充示例
类比
```

而不是要求回答包含完整用户问题。

## 4.2 应建立意图级判断

### 例子类请求

问题包含：

```text
举例
举个例子
给个例子
补充例子
再补充一个例子
用例子说明
```

如果答案包含：

```text
具体场景
具体角色或系统
具体操作步骤
具体结果
```

即可视为完成。

不要求答案逐字出现“例子”二字。

### 故事类请求

问题包含：

```text
故事
小故事
编一个故事
生成一个故事
用故事解释
```

如果答案具有：

```text
人物、对象或主体
事件或过程
前后发展
解释目标概念
```

即可视为完成。

不要求答案逐字复述完整问题。

### 解释类请求

如果用户要求解释某概念，而回答提供：

```text
定义
作用
过程
例子
```

即可接受。

## 4.3 安全备用方案

当结构化 proposal 缺失，但：

```text
AI answer 非空
解析结果非空
答案明显完成生成任务
不是拒绝
不是空话
不是无关回答
```

必须生成安全的 generated-content draft。

不能进入：

```text
AI answer 有效
解析结果有效
编辑建议 empty
```

## 4.4 仍需拒绝的回答

以下必须继续拒绝：

```text
空答案
明确拒绝
只有“我不知道”
完全无关回答
只有元数据，没有正文
明显没有给出例子/故事/解释
```

不要为了修复错误拒绝而关闭所有质量检查。

---

# 5. 真实 Bug C：相邻 Callout 下的定位和顺序

## 5.1 明确的目标规则

### Generated source + Generated request

例如：

```text
在 [!note]- ✍️ AI 生成内容中选中 item
Ask 一个生成类问题
```

正确结果：

```text
优先 append 到同一个 live generated block；
不得在 source 上方创建新的 generated block；
不得跑到很远的位置。
```

### Generated source + Clarification request

正确结果：

```text
在 source generated block 紧邻下方创建或复用 clarification tip；
不得插入 source 上方；
不得跳到其他 section。
```

### Tip source + Clarification request

正确结果：

```text
append / merge 到同一个 live tip；
不得复制 tip。
```

### Tip source + Generated request

正确结果：

```text
在 source tip 紧邻下方创建 generated note；
内容只出现一次；
不得插入 source 上方；
不得跳到其他 section。
```

### Normal paragraph source

正确结果：

```text
输出位于选中 source paragraph 下方；
同一 source 的多次 Apply 按 Apply 顺序排列；
不能随机倒序或穿插。
```

## 5.2 相邻 Callout 不得导致错误归属

需要测试：

```markdown
[tip A]
[note B]
```

和：

```markdown
[note A]
[tip B]
```

不能因为下方或上方已有另一个 callout，就错误选择它作为：

```text
source
target
output cluster
insertion anchor
```

必须优先使用：

```text
用户实际选中的 source block
source container id
source item id
source block range
```

不能只根据“最近的 callout”或“连续 callout cluster”猜测 source。

## 5.3 顺序规则

对于同一个 source 连续 Apply：

```text
结果 1
结果 2
结果 3
```

最终必须保持：

```text
source
结果 1
结果 2
结果 3
```

---

# 6. 必须新增的自动测试

## 6.1 有效回答不再 empty

增加回归测试样本，至少覆盖：

```text
举个例子说明
生成一个小故事解释
编一个小故事帮助我理解
测试一下，编一个小故事
编一个简短故事
再补充一个例子
```

对每一个有效回答断言：

```text
AI answer 非空
proposal 非空
proposedVisibleMarkdown 非空
inline draft 可生成
Apply enabled
```

## 6.2 Unicode 正规化

加入测试：

```text
普通汉字答案
兼容形式汉字答案（如 ⼀、⽅、⼩）
```

两者应得到相同的意图判断结果。

## 6.3 相邻结构矩阵

必须覆盖：

```text
A. tip → note，Ask tip，生成任务
B. tip → note，Ask tip，解释任务
C. note → tip，Ask note，生成任务
D. note → tip，Ask note，解释任务
```

断言：

```text
A：
生成 note 位于 source tip 下方；
正文只出现一次。

B：
更新/追加 source tip；
不复制 tip。

C：
生成内容 append 到 source note；
不出现在 source 上方。

D：
clarification tip 位于 source note 紧邻下方；
不出现在远处。
```

## 6.4 重复正文检测

使用固定唯一句子，例如：

```text
UNIQUE-STORY-SENTENCE-ALPHA
UNIQUE-STORY-SENTENCE-BETA
```

Apply 后断言：

```text
每个唯一句子在最终 note 中只出现 1 次；
draft marker 0 次；
draft body 不得作为无 marker blockquote 残留。
```

## 6.5 已通过路径不能回归

必须继续通过：

```text
D1 unrelated historical duplicate → safe Apply success
D2 ambiguous target → rollback + draft preserved + accurate notice
T1 Normal → Clarification
T3 Generated → Clarification
T4 Generated → Story
T5 Tip → Clarification
T8 deleted draft → no-op
T11 repeat clarification → merge/update
```

---

# 7. 使用真实文件和真实运行记录

请读取：

```text
/Users/issiyua/Desktop/Learning/Study/Phase2_1_2B/POST_FIX_Phase2_1_2B_Master_Test.md
```

并搜索真实 Ask jobs：

```text
举个例子说明
生成一个小故事解释
编一个小故事，帮助我理解
```

建议命令：

```bash
rg -n   '举个例子说明|生成一个小故事解释|编一个小故事.*帮助我理解'   /Users/issiyua/Desktop/Learning/Study/.learning-os/ask-jobs   /Users/issiyua/Desktop/Learning/Study/.learning-os/logs
```

必须使用真实失败记录建立回归测试样本。

---

# 8. 开发后的真实 Obsidian 测试

## 8.1 先构建，再重新加载插件

必须执行：

```text
1. production build
2. 记录 main.js 修改时间或 SHA-256
3. 完全退出 Obsidian
4. 重新打开 Study Vault
   或 Disable → Enable 插件
5. 确认打开的是最新开发测试文件
6. 再进行 Ask / Apply 测试
```

没有重新加载插件，测试无效。

## 8.2 创建最小开发测试文件

建议创建：

```text
/Users/issiyua/Desktop/Learning/Study/Phase2_1_2B/DEV_SMOKE_Duplicate_Content_Adjacent_Empty.md
```

只放最小结构，不要复制整个旧 Master Test。

## 8.3 必须实际测试

### Live 1

```text
tip → note
Ask tip：
编一个小故事帮助我理解
```

检查：

```text
generated block 紧邻 source tip 下方
故事正文只出现一次
```

### Live 2

```text
note → tip
Ask note：
编一个简短故事
```

检查：

```text
append 到 source generated note
不出现在 source 上方
```

### Live 3

```text
note → tip
Ask note：
这是什么？
```

检查：

```text
新 tip 紧邻 source note 下方
不出现在远处
```

### Live 4

Ask：

```text
举个例子说明
```

检查：

```text
编辑建议非空
draft 出现
Apply 可点
```

### Live 5

Ask：

```text
生成一个小故事解释
```

检查：

```text
编辑建议非空
draft 出现
Apply 可点
```

如果 UI 自动化仍不能可靠点击或读取内容：

```text
明确报告“未完成真实 UI Ask/Apply”
不要声称 live smoke 通过
```

---

# 9. 不要做的事情

不要：

```text
修改 D1/D2 已经正确的核心行为
关闭 generated satisfaction checker
只增加两个中文字符串白名单
只对“举个例子说明”做硬编码
只对“生成一个小故事解释”做硬编码
用全文模糊去重删除内容
自动清理用户旧笔记
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

node --loader ./tests/ts-extension-loader.mjs --test   tests/asyncInbox.test.mjs   tests/inlineDraftStaging.test.mjs   tests/paragraphClarification.test.mjs   tests/askWorkflowUx.test.mjs

node --loader ./tests/ts-extension-loader.mjs --test tests/*.test.mjs

node esbuild.config.mjs production

git diff --check
```

如果系统 Node 不可用，使用 Codex 自带 Node，并记录完整路径。

---

# 11. 开发报告

完成后写入：

```text
/Users/issiyua/Documents/Adaptive_Learning_OS/docs/ai-workflow/reports/REPORT_DEV_Phase2_1_2B_Duplicate_Content_Adjacent_Placement_Empty_Fix.md
```

报告必须包含：

```text
Phase / task:

Real jobs inspected:
- job ids:
- questions:
- source modes:

Root cause A — duplicated generated body:
- exact cause:
- before behavior:
- after behavior:

Root cause B — remaining empty suggestion:
- exact cause:
- Unicode normalization used?:
- intent acceptance before:
- intent acceptance after:

Root cause C — adjacent callout placement:
- exact cause:
- placement rules after fix:

Files changed:

Tests added:
- valid example/story prompts:
- Unicode normalization:
- adjacent callout matrix:
- duplicate body count:
- D1/D2 regression:

Verification:
- TypeScript:
- Focused tests:
- Full tests:
- Production build:
- git diff --check:

Obsidian reload:
- main.js mtime/hash:
- reload method:
- reload time:

Live smoke:
- tip → note generated:
- note → tip generated:
- note → tip clarification:
- 举个例子说明:
- 生成一个小故事解释:

Known limitations:

Docs/context updated? no/deferred
Commit created? no
Ready for QA? yes/no
Recommended next step:
```

---

# 12. 完成标准

只有全部满足才算完成：

```text
1. tip → generated 的正文不再重复
2. draft 正文不再残留
3. “举个例子说明”生成非空编辑建议
4. “生成一个小故事解释”生成非空编辑建议
5. 不是通过两个字符串硬编码修复
6. Unicode 兼容字符已纳入处理
7. note → tip / tip → note 的 source 定位正确
8. generated source + generated request append 到正确 live block
9. generated source + clarification 位于 source 下方
10. D1 仍通过
11. D2 仍通过
12. 自动测试和 production build 全部通过
13. 插件重新加载
14. 尽可能完成真实 UI smoke
15. 不 commit
