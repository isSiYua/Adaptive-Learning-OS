import type { Editor } from "obsidian";
import type { LearningOsSettings } from "../types";

export class AskCardInserter {
  constructor(private settings: LearningOsSettings) {}

  insert(editor: Editor, askCardBlock: string): void {
    const block = ensureTrailingBlankLine(askCardBlock);
    if (this.settings.insertMode === "cursor") {
      editor.replaceSelection(`\n\n${block}`);
      return;
    }

    this.insertAfterSelectedParagraph(editor, block);
  }

  replaceRange(editor: Editor, fromOffset: number, toOffset: number, replacement: string): void {
    const markdown = editor.getValue();
    editor.setValue(`${markdown.slice(0, fromOffset)}${replacement}${markdown.slice(toOffset)}`);
  }

  private insertAfterSelectedParagraph(editor: Editor, askCardBlock: string): void {
    const selectionEnd = editor.getCursor("to");
    let paragraphEnd = selectionEnd.line;

    while (paragraphEnd + 1 < editor.lineCount()) {
      const nextLine = editor.getLine(paragraphEnd + 1);
      if (nextLine.trim() === "") break;
      paragraphEnd += 1;
    }

    if (paragraphEnd + 1 < editor.lineCount()) {
      editor.replaceRange(askCardBlock, { line: paragraphEnd + 1, ch: 0 });
      return;
    }

    const lastLine = editor.getLine(paragraphEnd);
    editor.replaceRange(`\n\n${askCardBlock}`, {
      line: paragraphEnd,
      ch: lastLine.length,
    });
  }
}

function ensureTrailingBlankLine(value: string): string {
  return `${value.trim()}\n\n`;
}
