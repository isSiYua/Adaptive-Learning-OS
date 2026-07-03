import type { EditorPosition } from "obsidian";

export function positionToOffset(markdown: string, position: EditorPosition): number {
  const lines = markdown.split(/\n/);
  let offset = 0;
  for (let line = 0; line < position.line && line < lines.length; line += 1) {
    offset += lines[line].length + 1;
  }
  return offset + position.ch;
}
