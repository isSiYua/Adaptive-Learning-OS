export function getHeadingPath(markdown: string, lineNumber: number): string[] {
  const lines = markdown.split(/\r?\n/);
  const stack: string[] = [];

  for (let index = 0; index <= lineNumber && index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[index]);
    if (!match) continue;

    const level = match[1].length;
    const title = match[2].replace(/\s+#+\s*$/, "").trim();
    stack.length = level - 1;
    stack[level - 1] = title;
  }

  return stack.filter(Boolean);
}

export function getCurrentHeading(path: string[]): string | null {
  return path.length > 0 ? path[path.length - 1] : null;
}

export function getParentHeading(path: string[]): string | null {
  return path.length > 1 ? path[path.length - 2] : null;
}
