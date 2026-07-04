import type { AnswerLanguage } from "../types";

export function latexMathFormattingRule(language: AnswerLanguage = "auto"): string {
  if (language === "en") {
    return `## LaTeX / Math formatting rule

- For mathematical formulas, always use Obsidian-compatible LaTeX delimiters.
- Use $...$ for inline math.
- Use $$...$$ for block math.
- Never wrap math formulas in backticks.
- Do not output formulas as inline code.
- Backticks are only for literal code identifiers or when explicitly discussing raw Markdown syntax.
- If explaining Markdown syntax itself, you may mention $...$ and $$...$$ as literal delimiters, but actual formulas in the note must be renderable math.`;
  }

  return `## LaTeX / 数学公式格式要求

- 数学公式必须使用 Obsidian 可渲染的 LaTeX 分隔符。
- 行内公式使用 $...$。
- 块级公式使用 $$...$$。
- 不要把数学公式放进反引号 \`...\` 里。
- 不要把公式输出成 inline code。
- 反引号只用于真正的代码或解释 Markdown 原始语法。
- 如果是在解释 Markdown 语法本身，可以把 $...$、$$...$$ 作为文本说明；但真正要写进笔记的公式必须能被 Obsidian 渲染。`;
}

export function structuredJsonOutputRule(language: AnswerLanguage = "auto"): string {
  if (language === "en") {
    return `## JSON output rule

- Return valid JSON only.
- Do not wrap the JSON in Markdown code fences.
- All string values must be valid JSON strings with escaped newlines.
- Do not include extra commentary outside JSON.`;
  }

  return `## JSON 输出要求

- 只返回 valid JSON。
- 不要把 JSON 包进 Markdown code fence。
- 所有字符串值必须是合法 JSON string，换行要正确转义。
- 不要在 JSON 外添加额外解释。`;
}
