export function quoteYamlString(value: string): string {
  return JSON.stringify(value.replace(/\r\n/g, "\n").trim());
}

export function stringifyYamlScalar(value: string | boolean | number): string {
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }

  return quoteYamlString(value);
}

export function parseYamlScalar(value: string): string | boolean | number {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }

  return trimmed;
}
