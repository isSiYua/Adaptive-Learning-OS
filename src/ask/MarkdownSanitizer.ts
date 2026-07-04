export function sanitizeMathInMarkdown(value: string): string {
  if (!value) return value;

  return value
    .split(/(```[\s\S]*?```)/g)
    .map((part) => (part.startsWith("```") ? part : sanitizeMathInlineCode(part)))
    .join("");
}

function sanitizeMathInlineCode(value: string): string {
  return value.replace(/`([^`\n]+)`/g, (match, rawContent: string) => {
    const content = rawContent.trim();
    if (!content) return match;

    if (isDelimitedMath(content)) return content;
    if (isLikelyBareLatex(content)) return `$${content}$`;
    return match;
  });
}

function isDelimitedMath(value: string): boolean {
  return (
    (value.startsWith("$") && value.endsWith("$") && value.length > 2) ||
    (value.startsWith("$$") && value.endsWith("$$") && value.length > 4)
  );
}

function isLikelyBareLatex(value: string): boolean {
  if (/[;=]|\b(function|const|let|var|return|import|export|class|console|pnpm|npm|yarn|useEffect)\b/.test(value)) {
    return false;
  }
  if (/\\(?:frac|sum|lambda|beta|alpha|gamma|delta|theta|sigma|mu|sqrt|pm|cdot|times|int|lim|log|ln|sin|cos|tan)\b/.test(value)) {
    return true;
  }
  if (/^\\[A-Za-z]+(?:\{[^}]+\}|\s|_|^)/.test(value)) return true;
  return false;
}
