# Phase 2.1.2B 修复后中文手动验证任务

项目：

```text
/Users/issiyua/Documents/Adaptive_Learning_OS
```

Obsidian Vault：

```text
/Users/issiyua/Desktop/Learning/Study
```

本轮目的：

```text
只验证这次开发实际修改的 4 类问题：
1. 生成类请求不再错误出现“编辑建议 empty”
2. 无关的历史重复 marker 不再阻塞安全 Apply
3. 目标 marker 本身重复时仍能安全失败
4. 新 block 的插入位置和顺序稳定
```

本轮不是完整回归测试，不需要重测所有旧功能。

---

# 一、测试前准备

## 1. 重新加载插件

虽然开发报告已经记录过重启 Obsidian，但你开始手动测试前仍建议再做一次：

```text
Obsidian Settings
→ Community plugins
→ Adaptive Learning OS
→ Disable
→ Enable
```

或者完全退出 Obsidian 后重新打开。

原因：

```text
正式构建后的 main.js 已经更新，
但正在运行的 Obsidian 可能仍然使用内存中的旧插件代码。
```

## 2. 禁止修改

```text
/Users/issiyua/Desktop/Learning/Study/How to Use AI.md
```

## 3. 创建主测试笔记

创建：

```text
/Users/issiyua/Desktop/Learning/Study/Phase2_1_2B/POST_FIX_Phase2_1_2B_Master_Test.md
```

把下面完整内容复制进去：

```markdown
# Phase 2.1.2B Post-Fix Master Test

## P1 Normal → Story

Cloud deployment allows applications to run on remote cloud infrastructure.

---

## P2 Tip → Story

> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-postfix-p2 -->
>
> <!-- learnos-item-id: item-postfix-p2-base -->
> **Multi-scale prediction（多尺度预测）** 是在不同分辨率的特征图上检测不同大小的物体。

---

## P3 Generated → Story

> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: gen-postfix-p3 -->
>
> <!-- learnos-item-id: item-postfix-p3-base -->
> **机器人示例** 一个机器人需要识别远处的大物体和近处的小物体。

---

## P4 Generated → Example

> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: gen-postfix-p4 -->
>
> <!-- learnos-item-id: item-postfix-p4-base -->
> **AI Agent 示例** 一个 AI Agent 可以调用工具完成多步骤任务。

---

## P5 Placement And Order

System Design for AI Applications includes APIs, authentication, caching, queues, observability, deployment, monitoring, and cost control.

---

## P6 Two Drafts Same Target

> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: gen-postfix-p6 -->
>
> <!-- learnos-item-id: item-postfix-p6-base -->
> **云端商店** 一家书店把网站和数据库部署到了云端。
```

---

# 二、核心测试

## P1：普通原文 → 带“测试一下”的故事请求

### 测试位置

```text
P1 Normal → Story
```

### 选中

```text
Cloud deployment
```

### Ask

```text
测试一下，编一个小故事
```

### 正确结果

```text
AI 回答有完整故事
解析结果有内容
合并理由不能错误声称“没有生成故事”
编辑建议非空
生成 generated-content draft
Apply 可以点击
Apply 后出现 [!note]- ✍️ AI 生成内容
draft 消失
```

### Fail

```text
AI 回答有故事，但编辑建议 empty
没有 draft
Apply 灰色不可点
```

---

## P2：Tip → 帮助理解的故事请求

### 测试位置

```text
P2 Tip → Story
```

### 选中

```text
Multi-scale prediction
```

### Ask

```text
编一个小故事帮助我理解
```

### 正确结果

```text
编辑建议非空
生成 generated-content draft
Apply 可点
故事进入 [!note]- ✍️ AI 生成内容
原 tip 仍然只有一份
item-postfix-p2-base 只出现一次
```

### Fail

```text
编辑建议 empty
故事被塞进原 tip
原 tip 被复制
```

---

## P3：Generated → 简短故事

### 测试位置

```text
P3 Generated → Story
```

### 选中

```text
机器人示例
```

### Ask

```text
编一个简短故事
```

### 正确结果

```text
编辑建议非空
生成 draft
Apply 可点
新故事追加到同一个 generated block
原 item-postfix-p3-base 只出现一次
```

### Fail

```text
因为“简短”这个词被错误拒绝
编辑建议 empty
复制 generated block
```

---

## P4：Generated → 再补充一个例子

### 测试位置

```text
P4 Generated → Example
```

### 选中

```text
AI Agent 示例
```

### Ask

```text
再补充一个例子
```

### 正确结果

```text
编辑建议非空
生成 draft
Apply 可点
新例子追加到 generated block
原 item-postfix-p4-base 只出现一次
```

### Fail

```text
AI 回答有例子，但编辑建议 empty
```

---

## P5：同一原文连续生成多个 block，检查位置和顺序

### 测试位置

```text
P5 Placement And Order
```

### 第一次 Ask

选中：

```text
authentication
```

Ask：

```text
这是什么？
```

Apply。

### 第二次 Ask

选中：

```text
caching
```

Ask：

```text
编一个小故事
```

Apply。

### 第三次 Ask

选中：

```text
monitoring and cost control
```

Ask：

```text
详细解释一下
```

Apply。

### 正确结果

三个正式 block 应当：

```text
全部位于 P5 原始段落下方
不会跑到 P1、P2、P3、P4、P6
顺序与 Apply 顺序一致：

1. authentication 的解释
2. caching 的故事
3. monitoring and cost control 的解释
```

### Fail

```text
block 出现在其他 section
顺序随机
后 Apply 的内容插到前面
```

---

## P6：同一 target 下两个 Draft

### 测试位置

```text
P6 Two Drafts Same Target
```

### 第一次 Ask

选中：

```text
云端商店
```

Ask：

```text
编一个故事
```

不要 Apply。

### 第二次 Ask

再次选中：

```text
云端商店
```

Ask：

```text
再编一个完全不同的故事
```

不要立刻 Apply。

### 检查

确认有两个不同 draft：

```text
两个 learnos-draft-id 不同
两个 learnos-draft-job-id 不同
```

然后：

```text
1. Apply 第一个
2. 检查第二个 draft 是否仍然存在
3. Apply 第二个
```

### 正确结果

```text
两个 draft 相互独立
Apply 第一个不会删除第二个
两个 final item id 不同
两个故事都进入 generated block
```

### Fail

```text
第一个 Apply 把第二个 draft 一起删除
两个故事使用同一个 final item id
```

---

# 三、重复 marker 的两个最小测试

这两项不要放进主测试笔记，避免污染主笔记。

---

## D1：无关历史重复不应阻塞安全 Apply

创建：

```text
/Users/issiyua/Desktop/Learning/Study/Phase2_1_2B/POST_FIX_D1_Unrelated_Duplicate.md
```

内容：

```markdown
# D1 Unrelated Duplicate

<!-- learnos-item-id: item-old-duplicate -->
旧内容 A

<!-- learnos-item-id: item-old-duplicate -->
旧内容 B

## Clean Area

Elastic Net combines L1 and L2 regularization.
```

### 选中

```text
L1 and L2 regularization
```

### Ask

```text
这是什么？
```

然后 Apply。

### 正确结果

```text
Apply 成功
生成新的 clarification tip
item-old-duplicate 仍然只是两次
不能变成三次
不能因为旧重复而回滚
```

### Fail

```text
Apply duplicate-marker check failed
并且错误仍然指向 item-old-duplicate
```

---





我还测试了几种情况：Note Block -> Tip Block 然后ask note block中的内容，ask生成任务，结果是生成的结果正常，就是乱序了。block生成不在note block下面，反而在note block的上面了。
note block -> tip block，ask note block，ask 询问任务。tip block的生成正常，但是也是乱序了。没有出现在note block的下面生成一个tip block，而是直接在note block很遥远的上面。

tip block -> note block, ask tip block，ask询问任务，结果正常，没有 bug

tip block -> note block, ask tip block, ask 生成任务。结果和前面所描述的一致，都是 block 生成了，但是内容重复复制。







## D2：Target 本身重复时必须安全失败

创建：

```text
/Users/issiyua/Desktop/Learning/Study/Phase2_1_2B/POST_FIX_D2_Ambiguous_Target.md
```

内容：

```markdown
# D2 Ambiguous Target

> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-postfix-d2-a -->
>
> <!-- learnos-item-id: item-postfix-d2-target -->
> **AWS** AWS 是一种云服务平台。

> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-postfix-d2-b -->
>
> <!-- learnos-item-id: item-postfix-d2-target -->
> **AWS** AWS 是一种云服务平台。
```

### 操作

在第一个 tip 中选中：

```text
AWS
```

Ask：

```text
再详细解释一下
```

点击 Apply。

### 正确结果

```text
Apply 安全失败
draft 保留
两个原 tip 都不变
不会生成第三个 tip
错误提示应说明：
目标 marker 出现多次，无法确认写入哪个 block
```

### Fail

```text
随机写入其中一个 tip
复制第三个 tip
删除原内容
错误仍只说“本次 proposal 会制造重复”，没有说明目标不唯一
```

---

# 四、测试结果模板

完成后发给 ChatGPT：

```text
# Phase 2.1.2B 修复后手动测试结果

## P1 测试一下，编一个小故事
- Pass/Fail：
- 编辑建议 empty：
- Draft：
- Apply：
- 最终 block：

## P2 Tip → Story
- Pass/Fail：
- 编辑建议 empty：
- Apply：
- 是否复制 tip：

## P3 Generated → 简短故事
- Pass/Fail：
- 编辑建议 empty：
- Apply：

## P4 Generated → 再补充例子
- Pass/Fail：
- 编辑建议 empty：
- Apply：

## P5 Block 位置和顺序
- Pass/Fail：
- 最终顺序：
- 是否跑到其他 section：

## P6 两个 Draft
- Pass/Fail：
- Apply 第一个后第二个是否保留：
- 两个 final item id 是否不同：

## D1 无关历史重复
- Pass/Fail：
- 是否成功 Apply：
- 是否错误 rollback：

## D2 Target 重复
- Pass/Fail：
- 是否安全失败：
- Draft 是否保留：
- 错误提示是否准确：

## 截图
- ...

## 失败后的 Markdown
```markdown
粘贴这里
```
```

---

# 五、通过标准

只有以下全部通过，才建议进入 commit：

```text
P1
P2
P3
P4
P5
P6
D1
D2
```

如果 P1-P4 任意一个再次出现：

```text
AI 回答有内容
编辑建议 empty
```

则仍然是 Blocker，不应 commit。



AI回答：以智能客服助手为例，用户询问“帮我查一下订单状态”。传统方式只能调用单一API，但Agent可以：1. 通过LLM理解意图（查订单），2. 调用tool calling（查询订单API），3. 如果API返回异常，Agent可以自动调用function calling重试或切换备用API，4. 最终综合上下文生成自然语言回答。整个过程Agent自主规划步骤、调用工具，无需人为编排固定流程。
Raw：{
  "answer": "以智能客服助手为例，用户询问“帮我查一下订单状态”。传统方式只能调用单一API，但Agent可以：1. 通过LLM理解意图（查订单），2. 调用tool calling（查询订单API），3. 如果API返回异常，Agent可以自动调用function calling重试或切换备用API，4. 最终综合上下文生成自然语言回答。整个过程Agent自主规划步骤、调用工具，无需人为编排固定流程。",
  "key_answer": "Agent是能自主调用工具（如API、数据库）完成复杂任务的LLM应用，例如智能客服自动查订单并处理异常。",
  "suggested_takeaway": "Agent：LLM应用可以自主调用tool calling、function calling等工具，实现多步骤任务闭环，如自动查订单、重试异常。",
  "mastery_signal": "resolved",
  "review_needed": false
}
解析结果：key_answer: Agent是能自主调用工具（如API、数据库）完成复杂任务的LLM应用，例如智能客服自动查订单并处理异常。
suggested_takeaway: Agent：LLM应用可以自主调用tool calling、function calling等工具，实现多步骤任务闭环，如自动查订单、重试异常。
Raw：key_answer: Agent是能自主调用工具（如API、数据库）完成复杂任务的LLM应用，例如智能客服自动查订单并处理异常。
suggested_takeaway: Agent：LLM应用可以自主调用tool calling、function calling等工具，实现多步骤任务闭环，如自动查订单、重试异常。
合并理由：AI 回答没有包含你要求的内容：“举个例子说明”。建议点击“重新按问题生成”。
Raw：AI 回答没有包含你要求的内容：“举个例子说明”。建议点击“重新按问题生成”。
编辑建议：empty



AI回答：在⼀个叫“LLM 小镇”的地⽅，住着⼀位聪明的助⼿⼩智。⼩智什么都知道，但有个烦恼：当居⺠问“帮我查明天天⽓”或“帮我订⼀杯奶茶”时，他只能根据⾃⼰的知识胡编乱造——因为从没连过外⾯的世界。

⼀天，镇⻓给了他⼀本“功能电话本”（Function Calling 列表），上⾯写着：“查天⽓请拨 #weather，订奶茶请拨 #order_drink”。从此，⼩智遇到这类请求时，就按照电话本拨打对应号码，让外⾯的⻔店（外部 API）帮他完成操作，再把结果告诉居⺠。居⺠们终于得到了真实的服务，⽽⼩智也不再瞎编了。

这就是 Function Calling（函数调⽤）：让 LLM 不只会说话，还能真正帮你做事。
Raw：{
  "answer": "在⼀个叫“LLM 小镇”的地⽅，住着⼀位聪明的助⼿⼩智。⼩智什么都知道，但有个烦恼：当居⺠问“帮我查明天天⽓”或“帮我订⼀杯奶茶”时，他只能根据⾃⼰的知识胡编乱造——因为从没连过外⾯的世界。\n\n⼀天，镇⻓给了他⼀本“功能电话本”（Function Calling 列表），上⾯写着：“查天⽓请拨 #weather，订奶茶请拨 #order_drink”。从此，⼩智遇到这类请求时，就按照电话本拨打对应号码，让外⾯的⻔店（外部 API）帮他完成操作，再把结果告诉居⺠。居⺠们终于得到了真实的服务，⽽⼩智也不再瞎编了。\n\n这就是 Function Calling（函数调⽤）：让 LLM 不只会说话，还能真正帮你做事。",
  "key_answer": "通过⼩故事说明 Function Calling 是让 LLM 调⽤外部⼯具/API 来执⾏实际任务（如查天⽓、订奶茶），⽽⾮仅靠内部知识回答。",
  "suggested_takeaway": "Function calling 是 LLM 应⽤中的⼀种能⼒，它让模型按需调⽤外部函数（API）以获取实时信息或执⾏操作，是构建 Agent 和⼯具调⽤的核⼼机制。",
  "mastery_signal": "neutral",
  "review_needed": false
}
解析结果：key_answer: 通过⼩故事说明 Function Calling 是让 LLM 调⽤外部⼯具/API 来执⾏实际任务（如查天⽓、订奶茶），⽽⾮仅靠内部知识回答。
suggested_takeaway: Function calling 是 LLM 应⽤中的⼀种能⼒，它让模型按需调⽤外部函数（API）以获取实时信息或执⾏操作，是构建 Agent 和⼯具调⽤的核⼼机制。
Raw：key_answer: 通过⼩故事说明 Function Calling 是让 LLM 调⽤外部⼯具/API 来执⾏实际任务（如查天⽓、订奶茶），⽽⾮仅靠内部知识回答。
suggested_takeaway: Function calling 是 LLM 应⽤中的⼀种能⼒，它让模型按需调⽤外部函数（API）以获取实时信息或执⾏操作，是构建 Agent 和⼯具调⽤的核⼼机制。
合并理由：AI 回答没有包含你要求的内容：“生成一个小故事解释”。建议点击“重新按问题生成”。
Raw：AI 回答没有包含你要求的内容：“生成一个小故事解释”。建议点击“重新按问题生成”。
编辑建议：empty
