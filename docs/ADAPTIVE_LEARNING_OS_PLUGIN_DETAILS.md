# Adaptive Learning OS Obsidian Plugin 细节说明

这是一款为 Obsidian 打造的本地优先 AI 学习插件。它不是把 Obsidian 变成一个聊天窗口，也不是简单地把选中文本丢给 AI 解释一下，而是围绕真实学习过程设计了一整套“提问、理解、沉淀、复核、可追踪”的工作流。

它的核心目标很直接：

> 当我在 Obsidian 里阅读、整理、学习时，遇到不懂的词、句子、概念、段落，可以立刻提问；AI 的回答不会污染原文，也不会自动乱改笔记，而是经过我的审阅后，以结构化、可持续演化的形式沉淀到笔记旁边。

当前版本专注于 Ask / Clarification / Inbox 这条核心学习链路。它还没有进入复习调度、知识掌握数据库、PDF/PPT 抽取、Anki 同步或向量数据库阶段，但已经把“在 Obsidian 里对知识点提问并可靠沉淀”这件事做得非常细。

## 一句话介绍

Adaptive Learning OS 是一个 Obsidian 插件，它让你在阅读笔记时选中任意内容提问，AI 在后台回答，你在 Inbox 中审阅、修改、合并，最后把理解以稳定、可追踪、可继续追问的 clarification block 形式写回原笔记。

## 它不是普通 AI 问答插件

普通 AI 问答工具通常是：

- 选中一段文字。
- 发送给 AI。
- 得到一个回答。
- 手动复制到笔记里。
- 以后很难知道这个回答对应的是哪段原文、哪次提问、是否还有效。

Adaptive Learning OS 的设计不是这样。它把一次提问看成一个完整的学习事件：

- 用户选择了什么。
- 用户问了什么。
- 这段文字属于哪个文件、文件夹、标题路径。
- 选中内容所在的源段落是什么。
- 前后相邻的原始语义段落是什么。
- AI 使用了哪个模型回答。
- AI 原始回答是什么。
- 解析后的结构化结果是什么。
- 合并建议是什么。
- 用户是否修改了建议。
- 最终是否真正写入了 Obsidian 笔记。
- 写入后对应的隐藏 ID 是否真的存在。
- 后续清理时哪些记录仍然有效，哪些已经和笔记断开。

也就是说，它不是“临时问一下 AI”，而是在 Obsidian 里建立一条可追踪的学习理解链。

## 当前版本能力总览

当前插件已经具备以下核心能力：

- Obsidian 插件形式运行，不是 web app。
- 本地优先，插件数据存储在 vault 内的 `.learning-os/` 文件夹。
- 支持右键选中文本提问。
- 支持选中文本后浮动“问”按钮，减少右键操作成本。
- 支持后台异步 Ask job，不需要等 AI 回答时卡住编辑流程。
- 支持多个 Ask job 同时排队、运行、完成、失败、应用、归档。
- 提供 Learning OS Inbox 侧边栏，用于集中审阅 AI 回答和合并建议。
- AI 回答必须经过用户审阅，插件不会自动修改笔记。
- Apply 前会基于当前 live note 重新合并，避免旧快照覆盖新内容。
- 一段原文对应一个不断演化的 clarification block。
- 同一段原文的多个问题会合并为同一个 clarification block 里的多个 clarification item。
- 每个 clarification block 有稳定的 `learnos-clarification-id`。
- 每个 clarification item 有稳定的 `learnos-item-id`。
- 用户可以自由编辑可见笔记内容，只要隐藏 ID 还在，插件就能继续识别。
- 支持对已有 clarification item 继续提问。
- 支持对 generated content item 继续提问。
- 支持生成类请求，并使用独立的 AI 生成内容 block，而不是伪装成“我的理解”。
- 支持 Markdown / LaTeX 渲染的 Inbox 阅读体验。
- 支持 OpenAI-compatible / Anthropic-compatible / DeepSeek 等 provider 配置。
- 支持 Auto / Flash / Pro 的 per-Ask 模型选择。
- 支持 Inbox 中 Regenerate with Pro。
- 支持 cleanup 未使用 Learning OS 数据，并区分 job history、clarification record、marker 是否仍存在。
- 已有自动化测试覆盖 Ask、context extraction、source navigation、apply merge、cleanup、generated content、model routing 等关键路径。

## 用户体验流程

### 1. 在 Obsidian 原文中选择内容

用户可以在任意 Markdown 笔记中选中一个词、一句话或一段内容。

例如：

```markdown
前端 dashboard 展示设备状态、机器人状态、AI 诊断结果。
```

选中 `dashboard` 后，有两种入口：

- 右键菜单：`Ask Learning OS about selection`
- 浮动小按钮：`问`

右键入口保留了传统 Obsidian 插件交互；浮动按钮则适合高频学习场景，减少“选中 -> 右键 -> 菜单查找”的摩擦。

### 2. Ask Modal 中输入问题

插件会打开 Ask Modal，显示：

- 用户选中的原文。
- 源段落。
- 文件、文件夹、标题路径组成的上下文。
- 前一个原始语义段落。
- 后一个原始语义段落。
- 问题输入框。
- 模型选择：Auto / Flash / Pro。
- Prompt preview。

这里的 Prompt 是 user-intent-first 的：

> 用户的问题是主要任务，选中文本、源段落、上下文只是辅助材料。

所以如果用户问：

```text
这个词是什么意思？
```

插件会让 AI 解释选中内容。

但如果用户问：

```text
给我生成一个 cs2 职业选手 niko 的小趣事。
```

插件不会强行解释选中词，而会把它识别为生成任务，并要求 AI 真正生成用户想要的内容。

### 3. AI 在后台回答

用户点击 Ask AI 后，插件会创建一个 Ask job。这个 job 会进入后台队列，不会阻塞用户继续阅读或编辑。

Ask job 会记录：

- job id。
- note path。
- selected text。
- source block。
- source block hash。
- heading path。
- nearby context before。
- nearby context after。
- user question。
- prompt。
- provider。
- selected model。
- routing reason。
- raw AI answer。
- parsed result。
- merge proposal。
- status。

这些信息存储在 `.learning-os/ask-jobs/` 中，并追加写入 JSONL 日志，方便追踪。

### 3.1 AI 回答不是直接入库，而是先经过解析和检查

插件在 AI 生成回答后，不会直接把 provider 返回的原始文本当成最终笔记内容。

当前 Ask job 的处理链路更像是一个小型流水线：

1. 第一轮 AI 调用：根据用户问题、选中文本、源段落、标题路径和相邻上下文，直接回答用户的问题。
2. JSON 解析：插件会尝试从 AI 返回内容中提取 valid JSON。
3. Markdown-in-JSON 容错：如果回答里有复杂 Markdown、代码块、表格、LaTeX 或字符串里的 `{}`，解析器会尽量用平衡扫描方式找到真正的 JSON 对象。
4. Fallback：如果 AI 没有按 JSON 返回，插件不会丢弃回答，而是把 raw answer 作为 answer fallback。
5. 生成内容满意度检查：如果用户明确要求“讲一个故事 / 生成一个例子 / 写一个趣事”，插件会检查回答是否真的包含用户要求的生成内容。
6. Warning：如果 AI 没有满足生成请求，Inbox 会显示 warning，避免把无关解释伪装成待应用内容。
7. LaTeX / Markdown sanitizer：插件会保守修正明显错误的数学公式格式，例如把公式从代码反引号中恢复为 `$...$` 或 `$$...$$`。

所以它不是“拿到 AI 回答就直接塞进笔记”，而是先把 AI 回答拆成：

- raw original response。
- parsed answer。
- key answer。
- suggested takeaway。
- mastery signal。
- review needed。

这些字段会进入 Inbox，供用户审阅。

### 3.2 基于 AI 回答生成笔记建议时，会再做一轮 AI merge

第一轮 AI 的职责是回答问题；第二轮 AI 的职责是把回答变成适合 Obsidian 笔记的合并建议。

也就是说，插件不是简单地把 `answer` 复制到 note 里，而是会构建一个 Clarification Merge Proposal prompt，交给 AI 再判断：

- 这次回答应该更新已有 item，还是新增 item。
- 是否和已有解释重复。
- 哪些旧内容应该保留。
- 哪些新内容应该补充。
- 生成内容是否应该进入独立 generated-content block。
- 最终 visible Markdown 应该长什么样。
- 合并理由是什么。
- 置信度如何。

这一步会使用：

- 用户问题。
- 第一轮 raw AI answer。
- parsed answer fields。
- 当前已有 clarification items。
- 已有 visible clarification markdown。
- source block。
- selected text。
- ask intent。

如果 AI merge 返回无效 JSON，插件不会直接失败或写入脏内容，而是创建一个 safe fallback proposal，让用户仍然可以在 Inbox 中看到、编辑、决定是否应用。

### 3.3 Re-merge / Regenerate 是用户可控的多轮修正

Inbox 里保留了几种人工触发的多轮修正能力：

- Regenerate：重新按用户问题生成回答。
- Regenerate with Pro：用 Pro 模型重跑当前 job。
- Re-merge：不重新问原问题，只让 AI 基于当前 raw answer 和当前笔记重新生成合并建议。

这里的关键是：多轮修正是用户可控的，不是插件在后台无限自动重写。这样既能利用 AI 反复修正，又不会让插件悄悄消耗 API、悄悄改变结果。

### 4. 在 Learning OS Inbox 审阅

AI 回答完成后，job 会出现在 Learning OS Inbox 的 Ready / 待处理区域。

Inbox 不是简单的日志列表，而是一个审阅工作台。它包含：

- 处理中。
- 待处理。
- 失败。
- 历史记录。
- 当前 job detail。
- AI 回答。
- 解析结果。
- 合并理由。
- 编辑建议。
- Apply proposal。
- Re-merge。
- Regenerate。
- Regenerate with Pro。
- Copy raw / copy parsed / copy proposal。
- Open source。
- Delete job record。

用户可以先阅读 AI 回答，也可以查看结构化解析结果，还可以直接编辑最终要写入笔记的 proposal。

### 5. Apply 前必须人工确认

插件不会自动把 AI 回答写入笔记。必须由用户点击 Apply。

这是一个非常重要的设计原则：

> AI 可以提出建议，但最终写入 Obsidian 笔记必须由用户确认。

这避免了 AI 自动污染笔记、误改原文、重复插入或静默覆盖用户编辑的问题。

### 6. Apply 时合并当前 live note

Apply 不是把旧 proposal 直接写入文件。

正确流程是：

1. 等待当前 note 的 apply lock。
2. 获取锁后重新读取最新 Obsidian note。
3. 解析当前 live note 中真实存在的 Learning OS block 和 item。
4. 判断源段落是否仍存在。
5. 判断目标 clarification block 是否仍然属于同一个源段落。
6. 以当前 live note 为准进行 item-level merge。
7. 保留所有不相关的 live item。
8. 写回文件。
9. 重新读取文件。
10. 验证写入后的 marker 是否真的存在。
11. 只有验证成功才把 job 标记为 applied。

这保证了：

- 后台 job 的旧快照不会覆盖用户刚刚手动改过的内容。
- 多个 job 乱序 Apply 时不会互相删除。
- 已经存在的 clarification item 不会因为新 job 应用而消失。
- 如果写入失败，job 不会被错误标记为 applied。

## Clarification Block 设计

### 一段原文对应一个理解块

插件的基本组织单位不是“一次提问一个块”，而是：

> 一个 source paragraph / source block 对应一个不断演化的 clarification block。

这非常适合学习场景。因为一个段落里可能有多个不懂的词、多个概念、多个细节。它们不应该散落成很多无关的注释，而应该聚合在同一个“我对这一段的理解”下面。

典型结构如下：

```markdown
原始笔记段落。

> [!tip]- 💡 我的理解
> <!-- learnos-clarification-id: clar-20260704-example -->
>
> <!-- learnos-item-id: item-dashboard -->
> **Dashboard 仪表盘** 指用于集中展示系统状态、任务进度和诊断结果的界面。
>
> <!-- learnos-item-id: item-ros2 -->
> **ROS2** 是机器人系统中常用的通信和控制框架。
```

用户看到的是一个干净的 Obsidian callout。插件看到的是稳定的隐藏 ID。

### block id 和 item id 分离

插件同时使用两层身份：

- `learnos-clarification-id`：标识整个 clarification block。
- `learnos-item-id`：标识 block 中某一个 clarification item。

这样就可以支持：

- 删除一个 item，而不是误删整个 block。
- 修改 item 文字，而不改变它的身份。
- 对某个 item 继续提问。
- 判断某个 Ask job 是否真的对应到某个 live item。
- cleanup 时区分“整个 block 被删了”和“只是某个 item 被删了”。

### 可见文字不是数据库主键

用户可以把：

```markdown
**Dashboard 仪表盘** 指用于集中展示状态的界面。
```

手动改成：

```markdown
**Dashboard** 是我用来观察系统整体运行情况的控制面板。
```

只要 `learnos-item-id` 还在，插件就认为这是同一个 item 的当前 live 内容。

这体现了一个重要原则：

> Obsidian live note 是 source of truth。backend JSON 是辅助记录，不是覆盖 live note 的权威来源。

## Generated Content 设计

插件区分“解释/澄清”和“生成内容”。

如果用户问的是：

```text
这个概念是什么意思？
```

通常生成 clarification block：

```markdown
> [!tip]- 💡 我的理解
```

如果用户问的是：

```text
给我写一个例子。
给我讲一个故事。
生成一个类比。
编一个小趣事。
```

则使用 generated content block：

```markdown
> [!note]- ✍️ AI 生成内容
> <!-- learnos-generated-id: gen-20260704-example -->
>
> 这里是 AI 根据用户请求生成的内容。
```

这个区分很重要，因为生成内容不是“我对原文的理解”，而是 AI 根据原文或用户请求生成的辅助材料。

插件不会把一个故事、例子或改写任务硬塞进“我的理解”里。

## Prompt 与上下文提取

### Heading path 不只是标题

插件构建 prompt context 时，不只读取当前 Markdown 标题，还会把更上层的语义路径纳入考虑：

- vault 中的文件夹路径。
- 文件名。
- 当前 Markdown heading path。

这样 AI 不只知道选中了一个词，还知道它大概处于什么主题、什么项目、什么知识领域里。

例如一个选中词 `dashboard`，如果它位于：

```text
Robotics Project / AI Agent / 系统架构.md / ## 前端展示
```

AI 的理解会明显优于只看到 `dashboard` 一个词。

### Source block 是真实源段落

插件对中文普通笔记采用“空行分段”的语义边界，而不是视觉换行边界。

也就是说，如果一段中文因为编辑器宽度自动换行，看起来有很多行，插件仍然把它当作同一个 source block。

这避免了 AI 只拿到半句话或错误段落。

### Nearby context 只取相邻原始段落

当前设计中：

- `nearbyContextBefore` 是前一个非空原始段落。
- `nearbyContextAfter` 是后一个非空原始段落。

它不会无限塞入很多上下文，也不会把 Learning OS 自己插入的 callout 当作普通上下文。

这样 prompt 既有足够背景，又不会因为上下文过多而稀释用户问题。

### Learning OS callout 被当作原子块跳过

插件在构建 normal-note Ask 的上下文时，会跳过已有的 Learning OS callout block。

这解决了一个很细但很重要的问题：

如果你在原始笔记中间已经插入了“我的理解”，再次对原文提问时，附近上下文不应该变成上一个 AI 回答，而应该仍然是原始 prose 段落。

### 物理选择决定 source mode

插件区分三种提问来源：

- `normal-note`：用户选中的是原始笔记正文。
- `clarification-item`：用户选中的是 Learning OS clarification item 里的内容。
- `generated-content-item`：用户选中的是 AI generated content 里的内容。

这个判断基于物理选择位置，而不是“这个段落附近有没有 clarification block”。

这意味着：

- 如果用户选中原文，即使原文后面已经有 clarification block，仍然是 normal-note Ask。
- 只有用户真的选中 clarification item 内部，才进入 clarification-item Ask。
- 只有用户真的选中 generated content 内部，才进入 generated-content-item Ask。

### 对 clarification item 提问时，item 是主上下文

如果用户选中的是已有 clarification item，prompt 不会把它当成普通原文。

它会把：

- selected clarification item。
- sibling clarification items。
- 原始 source paragraph。
- 原始 nearby before / after。

分层放入 prompt 中。

这样 AI 能理解：“用户现在不是在问原文，而是在追问自己已经沉淀过的一条理解。”

## AI Provider 与模型路由

插件保留 provider abstraction，不绑定某一家 AI。

当前支持的方向包括：

- Manual clipboard provider。
- OpenAI-compatible API。
- Anthropic-compatible API。
- DeepSeek preset。
- OpenAI preset。
- GLM / Zhipu preset。
- OpenRouter preset。
- Custom base URL。

### DeepSeek Flash / Pro 路由

当前版本加入了一个小而实用的模型路由层：

- 默认普通 Ask 使用 `deepseek-v4-flash`。
- Deep model 可设置为 `deepseek-v4-pro`。
- 每次 Ask 可以选择：
  - Auto。
  - Flash。
  - Pro。

Auto 模式下：

- 普通学习问题默认使用 Flash。
- 复杂任务可以提示 Suggest Pro。
- 插件不会静默自动升级到 Pro。
- 用户可以在 Inbox 中点击 Regenerate with Pro。

每个 job 会记录：

- `requestedModel`
- `selectedModel`
- `modelRoutingMode`
- `routingReason`
- `rerunOfJobId`

这使得以后可以追踪：

- 这个回答是哪个模型生成的。
- 为什么选择这个模型。
- 是否是某个 job 的 Pro 重跑版本。

## Inbox 细节

Learning OS Inbox 是整个插件的审阅中心。

### 状态分组

Inbox 中的 job 分为：

- Running / 处理中。
- Ready / 待处理。
- Failed / 失败。
- History / 历史记录。

Ready count 不包含已经 applied 或 archived 的 job。Applied / Archived 默认隐藏在 history 下，避免干扰当前工作。

### Apply 后自动流转

用户 Apply 一个 job 后：

- 这个 job 会从待处理列表中移除。
- 自动选择下一个待处理 job。
- 如果没有待处理 job，显示干净的 empty state。
- 历史记录中仍可查看 applied job。

这让批量处理 AI 回答时不需要反复手动点列表。

### Markdown 阅读体验

Inbox 详情中的内容支持 Markdown preview：

- AI answer。
- parsed answer。
- merge reason。
- proposal。

它不是纯文本 textarea 式阅读，而是尽量接近 Obsidian 的 Markdown 阅读体验。

支持：

- 标题。
- 列表。
- 表格。
- 代码块。
- 行内代码。
- LaTeX。
- 链接。

同时保留：

- raw copy。
- raw original response。
- proposal textarea 编辑。
- copy button。

也就是说，用户可以舒服地阅读，也可以拿到原始数据。

### Sticky actions

在 Inbox detail 滚动时，关键操作保持更容易触达：

- Previous。
- Next。
- Apply proposal。

这是为了避免长回答、长 proposal 下频繁滚动。

### Open source 精准跳转

点击 Open source / 打开原文时，插件优先跳转到：

1. `learnos-item-id`
2. `learnos-clarification-id`
3. 原始 source block
4. fallback source location

这样用户可以从 Inbox 快速回到笔记中对应的学习位置。

## Apply 的事务安全

这是插件目前最重要的工程细节之一。

### Per-note apply lock

同一个 note 的 Apply 操作会串行化。

如果用户快速应用多个 job，它们不会同时写同一个 Markdown 文件，而是按 note 进入锁队列。

这避免了：

- job A 读取旧内容。
- job B 写入新内容。
- job A 再用旧内容覆盖 job B。

### Apply 后 marker verification

插件不会因为“代码打算写入”就把 job 标记为 applied。

它必须：

1. 写入 note。
2. 重新读取 note。
3. 检查 `learnos-clarification-id` 是否存在。
4. 检查每个 `appliedItemIds` 对应的 `learnos-item-id` 是否存在。
5. 检查不相关的 pre-existing marker 没有被误删。
6. 验证通过后才标记为 applied。

如果 verification 失败，job 会进入失败状态，而不是假装成功。

### Apply 阶段还有最终一致性检查

前面的 AI answer parse、generated-content satisfaction check、AI merge proposal，都发生在“生成建议”阶段。

Apply 阶段还有另一类更硬的检查：它检查的不是 AI 说得好不好，而是“笔记文件最后是否真的写对了”。

Apply 成功必须同时满足：

- 目标 note 真的被写入。
- 写入后重新读取 note。
- 预期的 `learnos-clarification-id` 存在。
- 预期的 `learnos-item-id` 存在。
- generated content 的 `learnos-generated-id` 存在。
- 写入前已经存在、但本次操作无关的 marker 没有丢失。

如果 Apply 导致不相关 marker 消失，插件会触发 preservation failure，并尽量回滚，而不是把 job 标记为成功。

这相当于给“AI 生成内容 -> 转成笔记建议 -> 写回 Obsidian”这条链路加了最后一道事务校验。

### Preserve unrelated live items

Apply 新 job 时，不会重写整个 block。

它会：

- 解析当前 live block。
- 保留已有 item。
- 只添加或更新本次 proposal 涉及的 item。
- 不会删除 proposal 没提到的 item。

这解决了多个 Ask job 乱序应用时常见的数据丢失问题。

### Stale proposal rebase

如果 proposal 生成后，用户又手动改了笔记，Apply 不会继续使用旧快照覆盖。

它会在 Apply 时重新读取 live note，并基于 live content rebase / merge。

这符合插件的核心原则：

> 当前 Obsidian live note 永远是 source of truth。

## Cleanup 设计

Cleanup 不是粗暴删除 `.learning-os/` 数据。

它会扫描：

- clarifications。
- ask jobs。
- archived jobs。
- applied jobs。
- visible note markers。
- missing clarification markers。
- missing item markers。
- dangling backend records。

并区分多种情况：

- 整个 clarification block 被用户删除。
- 某个 item 被用户删除。
- 用户只是修改了 item 文本。
- ask job history 指向已经不存在的 item。
- backend clarification record 已经孤立。
- note marker 失效。
- archived / applied history 可以清理。

关键规则：

> 只因为文字变了，不应该删除记录。  
> 只有 ID marker 消失，才说明对应实体被用户删除或断开。

Cleanup 有 preview，默认是非破坏性的。用户可以先看到会清理什么，再决定是否执行。

Delete job record 也被明确设计为：

> 删除 Inbox 历史记录，不删除笔记中的 clarification 内容。

这避免了“删除历史”和“删除笔记内容”概念混淆。

## 数据存储

插件数据默认存储在 vault 内：

```text
.learning-os/
```

典型结构包括：

```text
.learning-os/
  ask-jobs/
    job-....json
  clarifications/
    clar-....json
  logs/
    ask-jobs-YYYY-MM.jsonl
    clarifications-YYYY-MM.jsonl
  archive/
  backups/
  config/
  generated/
```

### 为什么用 JSON / JSONL

因为用户的学习数据应该是：

- 本地可见。
- 可备份。
- 可迁移。
- 可审计。
- 不依赖远端数据库。
- 不被插件黑盒锁死。

JSON 文件适合单条记录读写；JSONL 日志适合追加式审计。

## 隐私与控制

插件遵守几个非常明确的边界：

- 不自动发送整篇笔记给 AI。
- 不自动发送用户 vault 内容。
- 只有用户明确点击 Ask AI 才会调用 provider。
- Ask prompt 中只包含当前任务所需的选中内容、源段落、相邻上下文和标题路径。
- AI 不会自动写入笔记。
- Apply 必须人工确认。
- API key 存在 Obsidian 插件设置中，由用户自己配置。
- 插件数据保存在本地 vault。

这对于学习笔记非常重要，因为笔记往往包含长期思考、私人项目、课程资料和个人理解。

## UI 语言与回答语言

插件支持 UI language 和 answer language 设置：

- UI language:
  - 中文。
  - English。

- Answer language:
  - Auto。
  - 中文。
  - English。

Auto 模式下：

- 中文问题倾向中文回答。
- 英文问题倾向英文回答。
- 中文回答中可以保留必要的专业英文术语。

例如：

```text
“L2 penalty” 可以理解为 Ridge Regression 在 prediction error 之外额外惩罚过大的 squared coefficients。
```

这种表达比强行全部翻译更适合技术学习。

## Markdown 与 LaTeX 细节

插件要求 AI 在数学表达中使用：

- `$...$`
- `$$...$$`

而不是把公式放在反引号里。

它还包含保守 sanitizer，用来修正常见的：

```markdown
`x^2 + y^2`
```

这种“明显是公式却被包成代码”的错误。

在 Inbox 预览中，也会尽量让 LaTeX、Markdown heading、table、code block 在侧边栏中可读。

## Legacy 兼容

早期版本使用过：

```markdown
>>> ASK_CARD
...
<<<
```

当前版本已经转向更干净的 clarification block 和 generated content block，但保留了 legacy ASK_CARD conversion 能力。

这意味着旧笔记不会被直接抛弃，可以逐步迁移到新的结构。

## 已经反复打磨过的细节问题

下面这些不是“宣传级大功能”，但它们决定了插件是否真的好用。

### 不重复插入同一段理解

同一个 source paragraph 的多个问题会进入同一个 clarification block，而不是每次都插一个新 callout。

### 不因为 item 文本变化就误删数据

用户可以编辑解释文字。Cleanup 判断的是 hidden ID 是否存在，不是文字是否和 JSON 一模一样。

### 不因为 item 被删就误删整个段落记录

如果用户删除一个 item，但 clarification block 还在，插件会区分“单个 item 删除”和“整个 block 删除”。

### 不把 AI 生成故事塞进“我的理解”

生成类任务使用 `[!note]- ✍️ AI 生成内容`，说明这是 AI 生成材料，不是用户对原文的 clarification。

### 不把 Learning OS 自己的 callout 当作原文上下文

上下文抽取时会跳过已有 Learning OS block，避免 AI 在 AI 回答里继续解释 AI 回答，导致上下文漂移。

### 不信任 stale offset

当笔记插入 callout 后，旧 offset 可能漂移。插件会校验 offset 指向的文字是否仍然匹配，不匹配则使用 source block hash / exact text / semantic search fallback。

### 不用 heading path alone 决定目标 block

同一个 heading 下可能有多个源段落。插件不会只因为 heading 一样就把新 item 合并到错误 block。

### 不把 job 标记为 applied，除非 live note 真的有 marker

这是防止“历史显示成功，但笔记里没有内容”的关键保证。

### 不让多个 Apply 互相覆盖

同 note apply lock 保证并发或快速连续操作时，写文件是串行的。

### 不默默升级到昂贵模型

Auto 模式下复杂任务可以 Suggest Pro，但不会静默用 Pro。用户仍然掌握成本控制。

### 不隐藏失败

如果 source deleted、merge uncertain、verification failed，Inbox 会给出 warning 或失败状态，而不是假装成功。

## 已验证的工程质量

当前代码库已经建立了自动化测试体系，覆盖核心高风险行为。

测试方向包括：

- Ask Card / legacy parser。
- AI JSON parsing。
- Prompt builder。
- Chinese paragraph context extraction。
- source mode detection。
- original prose context resolution。
- generated content proposal。
- clarification item parsing。
- live note aware merge。
- order-independent apply。
- marker preservation。
- source navigation。
- cleanup semantics。
- Inbox filtering。
- model routing。

截至最近一次实现后的验证状态：

- 128 / 128 automated tests passed。
- TypeScript check passed。
- Production build passed。

这对一个 Obsidian 插件来说很重要，因为它处理的是用户真实笔记。如果没有测试，很容易出现“看似能用，但某次合并把内容覆盖掉”的风险。

## 目前没有做的事情

当前版本刻意没有实现以下内容：

- Note Check。
- Mastery Database。
- Review Scheduler。
- Context Pack Builder。
- PDF/PPT extraction。
- Vector DB。
- Anki sync。
- Web app。
- 自动读取整本书。
- 自动分析整个 vault。
- 自动修改笔记。

这些不是忘了做，而是产品策略上先把 Ask workflow 做扎实。

因为如果“选中提问 -> AI 回答 -> 人工审阅 -> 安全写回”都不可靠，那么后续的复习、掌握度、上下文包、课程系统都会建立在不稳的地基上。

## 为什么这款插件值得继续做

它解决的不是“怎么更快问 AI 一个问题”，而是：

> 怎么让 AI 参与我的长期学习，但不夺走我对笔记的控制权。

它的价值在于：

- AI 帮助理解，但不替用户决定。
- 回答可以沉淀，但必须经过审阅。
- 笔记可以被增强，但原文仍然是中心。
- 学习痕迹可以追踪，而不是散落在聊天记录里。
- 数据保存在本地，而不是被锁进某个平台。
- 用户可以继续手动编辑，因为 Obsidian 仍然是主工作区。

## 可以对外这样介绍

Adaptive Learning OS 是一个 Obsidian 本地优先 AI 学习插件。它允许用户在阅读笔记时选中文本提问，AI 在后台生成回答，并在 Learning OS Inbox 中提供可审阅、可编辑、可合并的建议。插件不会自动发送整篇笔记，也不会自动修改内容；所有 AI 结果都必须经过用户确认后，才会以结构化 clarification block 或 generated content block 写回原笔记。

它的核心特色是 live-note-aware merge：Obsidian 当前笔记永远是 source of truth。插件通过稳定的 hidden IDs 识别 clarification block 和 item，允许用户自由编辑可见内容，同时在 Apply 时重新读取最新笔记、合并当前 live item、验证 marker 是否真实存在，避免旧 AI job 覆盖新内容。配合 Inbox、模型路由、Markdown/LaTeX 预览、cleanup preview 和本地 JSON/JSONL 数据存储，它把“AI 问答”升级成了一个可持续、可审计、可控制的学习理解系统。

## 适合什么样的人

这款插件尤其适合：

- 用 Obsidian 学习课程、论文、书籍、技术文档的人。
- 不想把所有笔记都丢给 AI，但希望局部提问的人。
- 希望 AI 回答能沉淀在原文旁边，而不是散落在聊天窗口的人。
- 需要中英混合技术学习的人。
- 需要 Markdown / LaTeX 友好输出的人。
- 重视本地文件、可迁移数据和长期知识管理的人。
- 想把 AI 当作学习助手，而不是让 AI 接管笔记的人。

## 当前最打动人的产品细节

- 选中即问，右键和浮动按钮两种入口都保留。
- AI 回答后台运行，不打断阅读。
- Inbox 把 AI 回答变成待审阅任务，而不是一次性弹窗。
- Apply 前可以编辑 proposal。
- Apply 后 job 自动移出待处理区。
- 历史记录默认隐藏，当前任务更清爽。
- Markdown / LaTeX 预览让侧边栏也适合阅读。
- Open source 能跳回具体 item。
- 一个段落一个 clarification block，避免注释碎片化。
- 一个 block 内多个 item，适合逐步补全理解。
- Hidden IDs 稳定，用户可以自由改可见文字。
- Cleanup 识别 ID，不靠文字匹配。
- Apply 验证 marker 后才算成功。
- 并发 Apply 有 note-level lock。
- 旧 proposal 会基于 live note 重新合并。
- 生成类任务和解释类任务分开处理。
- Flash / Pro 模型选择明确，成本可控。
- 所有重要数据都在 `.learning-os/`，可读、可备份、可追踪。

## 后续最自然的方向

在 Ask workflow 已经稳定之后，下一阶段可以逐步扩展：

- Note Check：检查一篇笔记是否结构清晰、概念完整、是否缺少关键解释。
- Mastery Database：根据提问历史和 clarification item 形成个人知识掌握度。
- Review Scheduler：根据薄弱点和掌握度安排复习。
- Context Pack Builder：把某个项目或主题的关键知识打包给 AI，避免上下文漂移。
- Concept Map：从 clarification records 中生成概念关系。
- 更强的学习 dashboard：展示最近困惑、高频弱点、已解决问题。

但这些都应该建立在当前已经打磨好的基础上：

> Ask 回答问题，Apply 合并当前笔记，Obsidian live note 永远是 source of truth。
