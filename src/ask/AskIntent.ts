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
  const text = question.trim().toLowerCase();
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
  const answer = rawAnswer.toLowerCase();
  const required = requestedContentKeywords(question);
  const hasRequestedKeyword = required.length === 0 || required.some((keyword) => answer.includes(keyword.toLowerCase()));
  const sentenceCount = (rawAnswer.match(/[。！？!?]/g) ?? []).length;
  const storyLike = /(故事|趣事|story|fun fact|小故事|小趣事)/i.test(question) && (sentenceCount >= 1 || rawAnswer.trim().length >= 24);
  if (hasRequestedKeyword && (storyLike || answer.trim().length >= 8)) return null;
  return `AI 回答没有包含你要求的内容：“${question}”。建议点击“重新按问题生成”。`;
}

function requestedContentKeywords(question: string): string[] {
  const lower = question.toLowerCase();
  const keywords = new Set<string>();
  const chinese = question
    .replace(/讲一个|讲个|讲一段|讲讲|生成一个|生成一段|写一个|写一段|编一个|编一段|给我生成|给我写|给我讲|生成|写|给我|一个|一段|小故事|小趣事|故事|趣事|关于|请|的|输出|编|来|一下/g, " ")
    .match(/[\p{Script=Han}A-Za-z0-9][\p{Script=Han}A-Za-z0-9_-]{1,}/gu);
  for (const token of chinese ?? []) {
    const normalized = token.toLowerCase();
    if (!["story", "generate", "write", "create", "about", "fun", "fact"].includes(normalized)) {
      keywords.add(normalized);
    }
  }
  for (const token of lower.match(/[a-z0-9][a-z0-9_-]*/gi) ?? []) {
    if (!["give", "me", "a", "an", "the", "story", "example", "output", "generate", "write"].includes(token)) {
      keywords.add(token);
    }
  }
  if (/cs2/i.test(question)) {
    keywords.add("cs2");
    keywords.add("niko");
  }
  if (/niko|nikola\s+kova/i.test(question)) {
    keywords.add("niko");
    keywords.add("nikola");
    keywords.add("cs2");
    keywords.add("cs");
  }
  if (/巴别塔|通天塔|babel/i.test(question)) {
    keywords.add("巴别塔");
    keywords.add("通天塔");
    keywords.add("babel");
  }
  if (/csgo|cs go|counter[-\s]?strike/i.test(question)) {
    keywords.add("csgo");
    keywords.add("counter");
    keywords.add("strike");
  }
  if (/虎与狼|老虎|狼/.test(question)) {
    keywords.add("虎");
    keywords.add("狼");
  }
  return Array.from(keywords);
}
