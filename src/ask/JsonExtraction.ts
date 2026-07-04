export function extractFirstJsonObject(input: string): string | null {
  for (const fenced of fencedCodeBlocks(input)) {
    const candidate = extractBalancedJsonObject(fenced.trim());
    if (candidate && isValidJsonObject(candidate)) return candidate;
  }

  const candidate = extractBalancedJsonObject(input.trim());
  return candidate && isValidJsonObject(candidate) ? candidate : null;
}

function fencedCodeBlocks(input: string): string[] {
  const blocks: string[] = [];
  const pattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

function extractBalancedJsonObject(input: string): string | null {
  const start = input.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < input.length; index += 1) {
    const char = input[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = inString;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) return input.slice(start, index + 1);
    }
  }

  return null;
}

function isValidJsonObject(input: string): boolean {
  try {
    const parsed = JSON.parse(input);
    return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed));
  } catch {
    return false;
  }
}
