import { MyersDiff, type MyersEdit } from './myers-diff';
import { DiffOptions, DiffEdit, DiffOperation, DiffHunk, DiffLine, DiffLineType } from './types';

/**
 * TextDiff handles line-by-line and character-by-character diffing of text content
 */
export class TextDiff {
  /**
   * Compute line-by-line diff between two text strings
   */
  public static computeLineDiff(
    oldText: string,
    newText: string,
    options: DiffOptions = {}
  ): DiffEdit[] {
    const normalizedOld = this.normalizeText(oldText, options);
    const normalizedNew = this.normalizeText(newText, options);

    const oldLines = this.splitIntoLines(normalizedOld);
    const newLines = this.splitIntoLines(normalizedNew);

    const myersEdits = new MyersDiff().diff(oldLines, newLines);

    return this.convertMyersEdits(myersEdits, oldLines, newLines);
  }

  /**
   * Create unified diff format hunks
   */
  public static createHunks(edits: DiffEdit[], contextLines: number = 3): DiffHunk[] {
    if (edits.length === 0) return [];

    const hunks: DiffHunk[] = [];
    let currentHunk: DiffLine[] = [];
    let oldLineNum = 1;
    let newLineNum = 1;
    let hunkOldStart = 1;
    let hunkNewStart = 1;

    let contextBuffer: DiffLine[] = [];
    let hasChanges = false;

    for (const edit of edits) {
      if (edit.operation === DiffOperation.EQUAL) {
        const lines = edit.text.split('\n').filter((line) => line !== '');

        for (const line of lines) {
          const diffLine: DiffLine = {
            type: DiffLineType.CONTEXT,
            content: line,
            oldLineNumber: oldLineNum,
            newLineNumber: newLineNum,
          };

          if (hasChanges) {
            // We're in a hunk, add context
            currentHunk.push(diffLine);

            // Check if we have enough trailing context to end the hunk
            if (contextBuffer.length >= contextLines) {
              // End current hunk
              hunks.push(this.createHunk(currentHunk, hunkOldStart, hunkNewStart));
              currentHunk = [];
              contextBuffer = [];
              hasChanges = false;
              hunkOldStart = oldLineNum - contextLines + 1;
              hunkNewStart = newLineNum - contextLines + 1;
            }
          } else {
            // Not in a hunk, buffer context
            contextBuffer.push(diffLine);
            if (contextBuffer.length > contextLines) {
              contextBuffer.shift();
              hunkOldStart++;
              hunkNewStart++;
            }
          }

          oldLineNum++;
          newLineNum++;
        }
      } else {
        // We have a change, start/continue hunk
        if (!hasChanges) {
          // Start new hunk with buffered context
          currentHunk = [...contextBuffer];
          hasChanges = true;
        }

        const lines = edit.text.split('\n').filter((line) => line !== '');

        if (edit.operation === DiffOperation.DELETE) {
          for (const line of lines) {
            currentHunk.push({
              type: DiffLineType.DELETION,
              content: line,
              oldLineNumber: oldLineNum,
              newLineNumber: undefined,
            });
            oldLineNum++;
          }
        } else if (edit.operation === DiffOperation.INSERT) {
          for (const line of lines) {
            currentHunk.push({
              type: DiffLineType.ADDITION,
              content: line,
              oldLineNumber: undefined,
              newLineNumber: newLineNum,
            });
            newLineNum++;
          }
        }

        // Reset context buffer after a change
        contextBuffer = [];
      }
    }

    // Add final hunk if there are pending changes
    if (hasChanges && currentHunk.length > 0) {
      hunks.push(this.createHunk(currentHunk, hunkOldStart, hunkNewStart));
    }

    return hunks;
  }

  /**
   * Normalize text based on diff options
   */
  private static normalizeText(text: string, options: DiffOptions): string {
    let normalized = text;

    if (options.ignoreCase) {
      normalized = normalized.toLowerCase();
    }

    if (options.ignoreWhitespace) {
      normalized = normalized.replace(/[ \t]+/g, ' ').replace(/ $/gm, '');
    }

    return normalized;
  }

  /**
   * Split text into lines, preserving empty lines
   */
  private static splitIntoLines(text: string): string[] {
    if (text === '') return [''];

    const lines = text.split(/\r?\n/);

    // If text ends with newline, remove the empty last element
    if (text.endsWith('\n') || text.endsWith('\r\n')) {
      lines.pop();
    }

    return lines;
  }

  /**
   * Convert Myers algorithm edits to our DiffEdit format
   */
  private static convertMyersEdits<T>(
    myersEdits: MyersEdit[],
    oldSequence: T[],
    newSequence: T[]
  ): DiffEdit[] {
    const diffEdits: DiffEdit[] = [];

    myersEdits.forEach(({ type, oldIndex, newIndex, length }) => {
      let text: string;
      let operation: DiffOperation;

      switch (type) {
        case 'equal':
          text = oldSequence.slice(oldIndex, oldIndex + length).join('\n');
          operation = DiffOperation.EQUAL;
          break;
        case 'delete':
          text = oldSequence.slice(oldIndex, oldIndex + length).join('\n');
          operation = DiffOperation.DELETE;
          break;
        case 'insert':
          text = newSequence.slice(newIndex, newIndex + length).join('\n');
          operation = DiffOperation.INSERT;
          break;
        default:
          return;
      }

      diffEdits.push({
        operation,
        text,
        oldLineNumber: oldIndex,
        newLineNumber: newIndex,
      });
    });

    return diffEdits;
  }

  /**
   * Create a diff hunk from lines
   */
  private static createHunk(lines: DiffLine[], oldStart: number, newStart: number): DiffHunk {
    let oldCount = 0;
    let newCount = 0;

    lines.forEach((line) => {
      if (line.type === DiffLineType.CONTEXT || line.type === DiffLineType.DELETION) {
        oldCount++;
      }

      if (line.type === DiffLineType.CONTEXT || line.type === DiffLineType.ADDITION) {
        newCount++;
      }
    });

    const header = `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`;

    return {
      oldStart,
      oldCount,
      newStart,
      newCount,
      lines,
      header,
    };
  }
}
