export type AskIntent =
  | "explain"
  | "generate"
  | "rewrite"
  | "translate"
  | "summarize"
  | "compare"
  | "brainstorm"
  | "question-answer"
  | "unknown";

export function detectAskIntent(question: string): AskIntent {
  const text = normalizeGeneratedText(question);
  if (!text) return "explain";
  if (
    /(讲一个|讲个|讲一段|讲讲|生成一个|生成一段|写一个|写一段|编一个|编一段|输出一个|输出一段|来一个|给我一个|给我生成|给我写|给我讲|小故事|趣事|例子|tell\s+me\s+a\s+story|tell\s+a\s+story|give\s+me\s+a\s+story|make\s+up|fun\s+fact|generate|write|create|story|example|sample)/i.test(
      text
    )
  ) {
    return "generate";
  }
  if (/(是啥|是什么|啥意思|什么意思|怎么理解|解释一下|讲讲|说说|介绍一下|what\s+is|what\s+does.+mean|meaning\s+of|explain)/i.test(text)) {
    return "explain";
  }
  if (/(给我.*(生成|写|编|输出|一个|一段)|给我一段|样例|测试内容|make|compose|draft)/i.test(text)) {
    return "generate";
  }
  if (/(改写|重写|润色|rewrite|rephrase|polish)/i.test(text)) return "rewrite";
  if (/(翻译|translate)/i.test(text)) return "translate";
  if (/(总结|概括|摘要|summari[sz]e|summary)/i.test(text)) return "summarize";
  if (/(比较|对比|区别|compare|versus|\bvs\b|difference)/i.test(text)) return "compare";
  if (/(头脑风暴|brainstorm|想几个|给.*思路|ideas?)/i.test(text)) return "brainstorm";
  if (/(为什么|怎么|如何|说明|clarify|what|why|how)/i.test(text)) return "question-answer";
  return "unknown";
}

export function isGeneratedContentIntent(intent: AskIntent): boolean {
  return intent === "generate";
}

export function askIntentPromptLine(question: string): string {
  const intent = detectAskIntent(question);
  const generated = isGeneratedContentIntent(intent);
  return `Detected user intent: ${intent}.${generated ? "\nYou must produce the requested content in the answer.\n检测到用户意图：生成或输出用户明确要求的内容。你必须在 answer 中生成该内容。" : ""}`;
}

export function generatedContentMissingWarning(question: string, rawAnswer: string): string | null {
  const intent = detectAskIntent(question);
  if (!isGeneratedContentIntent(intent)) return null;
  const normalizedQuestion = normalizeGeneratedText(question);
  const normalizedAnswer = normalizeGeneratedText(rawAnswer);
  const trimmedAnswer = normalizedAnswer.trim();
  if (!trimmedAnswer || isClearlyUnusableGeneratedAnswer(trimmedAnswer)) {
    return `AI 回答没有包含你要求的内容：“${question}”。建议点击“重新按问题生成”。`;
  }
  const required = requestedContentKeywords(question);
  const hasRequestedKeyword =
    required.length === 0 || required.some((keyword) => normalizedAnswer.includes(normalizeGeneratedText(keyword)));
  if (!hasRequestedKeyword) {
    return `AI 回答没有包含你要求的内容：“${question}”。建议点击“重新按问题生成”。`;
  }
  if (isExampleRequest(normalizedQuestion) && answerLooksLikeExample(normalizedAnswer)) return null;
  if (isStoryRequest(normalizedQuestion) && answerLooksLikeStory(normalizedAnswer)) return null;
  if (normalizedAnswer.length >= 8) return null;
  return `AI 回答没有包含你要求的内容：“${question}”。建议点击“重新按问题生成”。`;
}

function requestedContentKeywords(question: string): string[] {
  const normalizedQuestion = question.normalize("NFKC");
  const lower = normalizedQuestion.toLowerCase();
  const keywords = new Set<string>();
  const chinese = normalizedQuestion
    .replace(
      /测试一下|帮助我理解它|帮助我理解这个|帮助我理解|帮我理解|完全不同|不一样|另一个|另|简短|详细一点|详细|不同|再补充|补充|举个例子说明|举一个例子|举个例子|给个例子|用例子说明|举例说明|举例|说明|解释|再|一下|这个|它|我|你|讲一个|讲个|讲一段|讲讲|生成一个|生成一段|写一个|写一段|编一个|编一段|给我生成|给我写|给我讲|生成|写|给我|一个|一段|小故事|小趣事|故事|趣事|例子|样例|关于|请|的|输出|编|来/g,
      " "
    )
    .match(/[\p{Script=Han}A-Za-z0-9][\p{Script=Han}A-Za-z0-9_-]{1,}/gu);
  for (const token of chinese ?? []) {
    const normalized = token.toLowerCase();
    if (!softGeneratedConstraintTokens().has(normalized)) {
      keywords.add(normalized);
    }
  }
  for (const token of lower.match(/[a-z0-9][a-z0-9_-]*/gi) ?? []) {
    if (!softGeneratedConstraintTokens().has(token)) {
      keywords.add(token);
    }
  }
  if (/cs2/i.test(normalizedQuestion)) {
    keywords.add("cs2");
    keywords.add("niko");
  }
  if (/niko|nikola\s+kova/i.test(normalizedQuestion)) {
    keywords.add("niko");
    keywords.add("nikola");
    keywords.add("cs2");
    keywords.add("cs");
  }
  if (/巴别塔|通天塔|babel/i.test(normalizedQuestion)) {
    keywords.add("巴别塔");
    keywords.add("通天塔");
    keywords.add("babel");
  }
  if (/csgo|cs go|counter[-\s]?strike/i.test(normalizedQuestion)) {
    keywords.add("csgo");
    keywords.add("counter");
    keywords.add("strike");
  }
  if (/虎与狼|老虎|狼/.test(normalizedQuestion)) {
    keywords.add("虎");
    keywords.add("狼");
  }
  return Array.from(keywords);
}

function normalizeGeneratedText(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function isExampleRequest(question: string): boolean {
  return /(举例|举个例子|举一个例子|给个例子|补充.*例子|例子.*说明|用例子|example|sample)/i.test(question);
}

function isStoryRequest(question: string): boolean {
  return /(故事|小故事|趣事|story|fun fact)/i.test(question);
}

function answerLooksLikeExample(answer: string): boolean {
  if (answer.length < 24) return false;
  if (/(例如|比如|以.+为例|场景|用户|系统|调用|步骤|结果|for example|example|scenario)/i.test(answer)) return true;
  return (answer.match(/[。！？!?]/g) ?? []).length >= 1 && /(\d+[.、]|→|->|：|:)/.test(answer);
}

function answerLooksLikeStory(answer: string): boolean {
  if (answer.length < 24) return false;
  if (/(从前|有一天|一天|后来|最后|小镇|故事|想象|角色|主人公|story)/i.test(answer)) return true;
  return (answer.match(/[。！？!?]/g) ?? []).length >= 2;
}

function isClearlyUnusableGeneratedAnswer(answer: string): boolean {
  if (answer.length === 0) return true;
  if (/^(抱歉|不好意思|对不起|sorry)/i.test(answer) && /(无法|不能|没法|不能提供|can't|cannot|unable)/i.test(answer)) {
    return true;
  }
  if (/^(无法回答|不能回答|无内容|没有内容|n\/a|null|undefined)$/i.test(answer.trim())) return true;
  if (/^\s*(\{\s*\}|\[\s*\])\s*$/.test(answer)) return true;
  return false;
}

function softGeneratedConstraintTokens(): Set<string> {
  return new Set([
    "story",
    "generate",
    "write",
    "create",
    "about",
    "fun",
    "fact",
    "example",
    "sample",
    "output",
    "give",
    "me",
    "a",
    "an",
    "the",
    "test",
    "testing",
    "short",
    "brief",
    "different",
    "another",
    "again",
    "help",
    "understand",
    "测试",
    "帮助",
    "理解",
    "简短",
    "不同",
    "完全",
    "补充",
    "例子",
    "样例",
  ]);
}
