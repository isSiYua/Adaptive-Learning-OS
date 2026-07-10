# Phase 2.1.2B 完整手动测试结论与 Bug Inventory

项目：Adaptive Learning OS  
测试来源：

- `MANUAL_QA_Phase2_1_2B_One_Note_Master_Chinese(1).md`
- `Phase2_1_2B_Master_Test...md`

当前阶段：测试总结与开发前决策  
本文件不是开发任务，不要求 Codex 修改代码。

---

# 1. 总结结论

本轮真实 Obsidian 测试证明：

```text
Phase 2.1.2B 的 clarification 路径、基础 Apply 安全、Draft 删除、
语义合并和 Inbox UI 已经明显稳定。

但 generated-content proposal 仍存在高频、非确定性的 false rejection：
AI 回答和解析结果明明有效，却被 satisfaction/merge 阶段判为
“没有包含用户要求”，导致编辑建议 empty、无 draft、Apply 不可用。

此外，当前 duplicate-marker guard 会被历史上无关的重复 marker
全局触发，从而阻塞当前本来安全的 Apply。
```

当前不应 commit/tag。  
应先统一修复本报告中的 P0/P1 问题，再重新执行针对性 QA。

---

# 2. 测试结果矩阵

| Case | 结论 | 说明 |
|---|---|---|
| T1 Normal → Clarification | Pass | 正常生成 tip、Apply 成功 |
| T2 Normal → Story | **Fail / P0** | 有效故事被误判，编辑建议 empty |
| T3 Generated → Clarification | Pass | 生成独立 clarification tip |
| T4 Generated → Story | Pass | 成功追加 generated item |
| T5 Tip → Clarification | Pass | 追加到原 tip，没有复制 tip |
| T6 Tip → Story | **Fail / P0** | 有效类比故事被误判，编辑建议 empty |
| T7 Two Drafts | **未完整执行** | 第一个 generated Ask 被 empty bug 阻断；第二个成功 |
| T8 Delete Draft | Pass | 删除 draft 后 no-op，不写 final item |
| T9 Target Deleted | 部分结论 | generated 子场景被 empty bug 阻断；clarification 子场景安全写成 tip |
| T10 Move Draft | **Pass（按当前产品偏好）** | final 内容回到原选中文本下方，而不是跟随移动后的 draft |
| T11 Repeat Clarification | Pass | 原 item 被语义合并/更新，没有重复 marker |
| T12 Inbox UI | Pass | Inbox 不重复，sticky Apply 正常 |
| C1 Unrelated historical duplicate | **Fail / P0-P1** | 无关历史重复 marker 阻塞当前安全 Apply |
| C2 Ambiguous target duplicate | 核心安全 Pass，提示文案 Fail | Apply 被阻止、draft 保留；但错误类型不够准确 |
| K1 Draft no-sync | 证据不充分 | 汇总快照受其他 Apply、复制笔记和 auto-sync 干扰 |
| K2 Apply sync | Pass | final item 被 KnowledgeData 索引 |
| K3 Deleted draft no-sync | Pass | 删除 draft 后不新增 final/apply evidence |

---

# 3. P0 Blocker：Generated-content satisfaction false rejection

## 3.1 已确认现象

以下真实测试都出现同一模式：

```text
AI 回答：非空，且确实完成了故事/例子请求
解析结果：key_answer / suggested_takeaway 非空
合并理由：错误声称 AI 回答没有包含用户要求
编辑建议：(empty)
inline draft：没有
Apply：不可用
```

已出现于：

```text
T2：普通原文 → “编一个小故事帮助我理解它”
T6：tip → “编一个小故事帮助我理解”
T7：generated block → 第一次“编一个简短故事”
T9：generated block → “再补充一个例子”
T12：
  “测试一下，编一个小故事”
  “测试一下，编一个小故事”
  “测试一下，编一个故事”
```

## 3.2 T12 提供的强线索

T12 中：

```text
带“测试一下”的三个 generated 请求全部 empty。
不带“测试一下”的“编一个故事 / 编一个小故事”都成功。
解释型“测试一下，这是什么？”也成功。
```

这非常像 generated-content satisfaction checker 把以下词语也当成了
必须出现在 AI 答案里的内容要求：

```text
测试一下
帮助我理解
简短
不同
再
```

因此，AI 虽然语义上完成了故事请求，但没有逐字复述这些元指令，
就被误判为“不满足请求”。

不过 T2、T6、T7、T9 说明问题不只由“测试一下”触发。
更广泛的根因很可能是：

```text
generated satisfaction / proposal acceptance
对用户问题做了过度字面化、过度严格的匹配，
没有把“任务意图”和“元指令/修饰词”分开。
```

这是基于测试结果的高可信推断，最终仍需通过真实 job artifacts 确认。

## 3.3 必须建立的产品不变量

```text
只要 AI answer 非空，并且语义上已经完成 generated request，
系统不能进入：

completed + pending + edit suggestion empty + no draft + Apply disabled
```

系统只能选择：

```text
A. 构造安全的 generated fallback proposal/draft；
B. 明确标记生成失败，并提供真实、可解释的失败原因。
```

不能错误声称“回答没有生成内容”。

## 3.4 优先级

```text
P0 Blocker
```

原因：

- 发生频率高；
- 多种 source mode 都能触发；
- 用户无法 Apply；
- generated-content 核心工作流因此不可靠。

---

# 4. P0/P1：历史无关重复 marker 阻塞安全 Apply

## 4.1 C1 已确认

测试笔记事先包含：

```text
item-old-duplicate × 2
```

当前 Ask/Apply 与它完全无关，但仍报：

```text
Apply duplicate-marker check failed:
items item-old-duplicate
```

这证明当前 guard 很可能只检查：

```text
Apply 后整篇 note 是否存在任意重复 marker
```

而没有比较：

```text
Apply 前后的 marker count 是否发生恶化
当前 proposal 是否真正制造了重复
重复 marker 是否与当前 target 有关
```

## 4.2 正确规则

应该阻止：

```text
当前 Apply 新制造重复 marker；
当前 Apply 让历史重复数量增加；
当前 target item/container 本身不唯一；
当前 Apply 复制整个旧 block。
```

不应阻止：

```text
历史上已经存在、与当前 Apply 无关的重复 marker，
且当前 Apply 没有增加其数量。
```

## 4.3 优先级

```text
P0/P1
```

它在干净笔记里不一定触发，但用户的真实 vault 已经存在历史坏数据，
会导致整篇笔记无法继续正常 Apply，因此实际影响接近 blocker。

---

# 5. P1：Generated block 的位置/顺序不稳定

## 5.1 真实现象

T12 对同一长段原文进行了多次 Ask，成功 Apply 后生成多个独立
tip/note block。

“多个独立 block”本身用户可以接受，不需要强制合并。

问题是：

```text
block 出现顺序和位置看起来不稳定；
不是清晰地按照 Ask/Apply 顺序排列；
用户感觉新 block 随机出现在不同位置。
```

## 5.2 用户明确产品偏好

```text
新生成的 block 应出现在被选中文本的下方。
```

因此建议确定以下规则：

```text
normal-note Ask：
  在选中 source block 下方建立 associated output cluster；
  后续输出追加到同一 cluster 的末尾；
  顺序保持稳定，建议按 Apply 顺序排列。

tip/generated item Ask：
  clarification 更新/追加到明确 target；
  generated output 放在包含 source block 的下方或 associated cluster；
  不能随机寻找远处位置。
```

## 5.3 T10 的判定

T10 将 draft 移到了 `Other Section`，但 Apply 后 final note 回到了
原始选中文本 `Retrieval-Augmented Generation` 下方。

根据用户现在明确提出的偏好：

```text
最终内容应位于所选内容下方
```

所以 T10 应判为 **Pass**，而不是位置错误。

当前推荐语义：

```text
移动 draft 只改变审阅位置，不改变 final target；
final target 由原 source/target 决定。
```

---

# 6. C2：Target 重复时核心安全正确，但错误信息不精确

C2 中：

```text
target item id 在两个 tip 中重复。
Apply 被阻止。
note 回滚。
draft 保留。
```

这正是安全行为，因此核心结果应判定为 Pass。

不足在于提示仍然是：

```text
writing this proposal would duplicate markers
```

更准确的提示应该是：

```text
target marker appears multiple times;
the target block is ambiguous.
```

优先级：

```text
P2 UX / diagnostic improvement
```

用户删除 draft 后再 Apply，系统 no-op，这部分行为正确。

---

# 7. T7：多 Draft 隔离尚未真正验证

T7 计划测试两个 draft，但：

```text
第一个 generated Ask 被 empty bug 阻断，没有生成 draft；
第二个 Ask 成功生成并 Apply。
```

因此不能将 T7 简单判定为“多 draft 功能失败”。

准确结论：

```text
T7 因 P0 empty-suggestion blocker 而未完整执行。
多 draft 隔离仍需在修复 P0 后重新测试。
```

第二个成功结果表明：

```text
单个 generated draft → same generated block Apply
当前可以工作。
```

---

# 8. T9：Target 删除测试需要拆成两个语义

## 8.1 Generated-output 子场景

原本的 generated request 没有生成 draft，因为被 P0 empty bug 阻断。

因此：

```text
generated draft target deleted
仍未真正测试。
```

修复 P0 后必须重测。

## 8.2 Clarification-output 子场景

用户改为问答型请求后：

```text
删除原 generated block；
Apply 成功创建独立 tip；
没有恢复已删除 generated block；
没有写入明显错误位置。
```

该行为可以接受，建议正式定义为：

```text
如果 live draft 是 clarification，并且能够在原 section/source anchor
附近安全创建 tip，则 source generated block 被删除后仍可 Apply；
但绝不能恢复被用户删除的 generated block。
```

因此这一子场景可判为 Pass，而不必强制显示 `target missing`。

---

# 9. T11：重复解释的语义合并表现良好

T11 最终只有：

```text
clar-master-t11 × 1
item-master-t11-base × 1
```

原简短解释被增强为完整解释，没有创建 sibling duplicate，也没有重复 marker。

这是期望行为：

```text
同一 item 的追问/完善
→ update/merge existing item
```

应作为 regression test 保留。

---

# 10. T12：多个独立 block 是否需要合并

用户明确表示：

```text
分开的 tip/note block 可以接受；
不必为了本阶段强制合并。
```

因此：

```text
多个独立 block 不列为 Bug。
```

仅保留“位置与顺序应确定”这一项。

将来可以另做可选功能：

```text
同 source 的 tip 聚合
同 source 的 generated block 聚合
```

但不属于当前 blocker fix。

---

# 11. T8 与 Draft 删除行为

T8：

```text
用户删除 draft；
Apply 提示 “Inline draft was deleted; nothing was applied.”；
没有 final item；
原文不变。
```

结果完全正确，应保留 regression test。

---

# 12. 最终 Markdown 结构审计

上传的最终主测试笔记中：

```text
final learnos-item-id：21 个，全部唯一；
clarification container：11 个，全部唯一；
generated container：7 个，全部唯一；
残留 draft marker：0。
```

这说明在本轮成功 Apply 的路径中：

```text
没有发现新的 final marker duplication；
没有残留 draft；
之前的复制 tip bug在干净 T5 中未复现。
```

但 T2、T6 等失败路径没有写入任何 final block，因此不能据此认为
generated proposal 已稳定。

---

# 13. KnowledgeData 结果

## 13.1 已确认

```text
K2 Apply 后 final item 被索引：Pass
K3 删除 draft 后不写 final/apply evidence：Pass
```

## 13.2 K1 证据不足

本次 Global Summary 的比较期间还发生了：

```text
多个 Apply；
主笔记修改；
复制测试笔记；
C1/C2 中人为重复 marker；
manual_note auto-sync。
```

因此无法只凭全局 counts 精确证明：

```text
单独生成一个 draft 是否完全没有增加任何 KnowledgeData count。
```

现有机制与此前自动测试都支持 draft ignored，但本轮 K1 手工数据
不够隔离，应标记为：

```text
Likely pass / manual evidence inconclusive
```

## 13.3 测试副本造成的数据污染

复制整份已含 final markers 的主测试笔记来做 C1/C2，会把相同
`learnos-item-id` 带到多个 note 中，并触发大量：

```text
manual_note/coverage
source_refs
missing/deleted evidence
```

这会让 KnowledgeData 总数大幅变化。

它主要是测试方法造成的数据污染，不应直接认定为 KnowledgeData bug。

后续 destructive QA 应使用：

```text
只包含最小 fixture 的副本
```

而不是复制整份已经 Apply 过的主测试笔记。

---

# 14. 低优先级 Polish

## P3.1 自动标题不自然

成功生成的标题出现：

```text
“再 不同的小故事”
“再 完全不同的故事”
```

不影响安全和 Apply，但语言不自然。

## P3.2 错误提示分类

区分：

```text
proposal introduces duplicate
target marker ambiguous
pre-existing unrelated duplicate
```

不要全部使用同一个 duplicate-marker 文案。

---

# 15. 开发优先级建议

## 第一批：必须统一修复

```text
P0-1 Generated satisfaction false rejection / empty suggestion
P0-2 Pre-existing unrelated duplicate marker blocks safe Apply
P1-1 Deterministic insertion location/order under selected source
```

## 第二批：同一开发任务内补安全与诊断

```text
Ambiguous target 专用错误
保留 C2 safe rollback
真实 runtime diagnostics
精确 regression fixtures
```

## 修复后必须重测

```text
T2
T6
T7（两个 draft）
T9 generated target deleted
T12 generated prompt matrix
C1
C2
block placement/order
```

## 暂不修

```text
多个 tip/note block 自动聚合
KnowledgeData 全面清理
测试文件产生的历史 evidence
低优先级标题 polish（可顺手修，但不能扩大 scope）
```

---

# 16. 当前决策

当前状态：

```text
不应 commit/tag。
测试阶段已经足以形成统一开发任务。
尚未生成 DEV/FIX 文件。
```

下一步必须先获得用户明确同意：

```text
是否同意进入开发阶段，
由 ChatGPT 将上述 P0/P1 问题合并成一份详细统一开发任务？
```
