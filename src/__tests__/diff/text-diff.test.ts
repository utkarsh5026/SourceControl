import { TextDiff } from '../../core/diff/text-diff';
import {
  DiffOperation,
  DiffLineType,
  type DiffOptions,
  type DiffEdit,
} from '../../core/diff/types';

describe('TextDiff', () => {
  describe('computeLineDiff', () => {
    it('should handle identical texts', () => {
      const oldText = 'line1\nline2\nline3';
      const newText = 'line1\nline2\nline3';

      const result = TextDiff.computeLineDiff(oldText, newText);

      expect(result).toHaveLength(1);
      expect(result[0]!.operation).toBe(DiffOperation.EQUAL);
      expect(result[0]!.text).toBe('line1\nline2\nline3');
    });

    it('should handle completely different texts', () => {
      const oldText = 'old1\nold2';
      const newText = 'new1\nnew2';

      const result = TextDiff.computeLineDiff(oldText, newText);

      expect(result).toHaveLength(3);
      expect(result[0]!.operation).toBe(DiffOperation.DELETE);
      expect(result[0]!.text).toBe('old1');
      expect(result[1]!.operation).toBe(DiffOperation.DELETE);
      expect(result[1]!.text).toBe('old2');
      expect(result[2]!.operation).toBe(DiffOperation.INSERT);
      expect(result[2]!.text).toBe('new1\nnew2');
    });

    it('should handle text with additions', () => {
      const oldText = 'line1\nline2';
      const newText = 'line1\nline2\nline3';

      const result = TextDiff.computeLineDiff(oldText, newText);

      expect(result).toHaveLength(2);
      expect(result[0]!.operation).toBe(DiffOperation.EQUAL);
      expect(result[0]!.text).toBe('line1\nline2');
      expect(result[1]!.operation).toBe(DiffOperation.INSERT);
      expect(result[1]!.text).toBe('line3');
    });

    it('should handle text with deletions', () => {
      const oldText = 'line1\nline2\nline3';
      const newText = 'line1\nline3';

      const result = TextDiff.computeLineDiff(oldText, newText);

      expect(result).toHaveLength(3);
      expect(result[0]!.operation).toBe(DiffOperation.EQUAL);
      expect(result[0]!.text).toBe('line1');
      expect(result[1]!.operation).toBe(DiffOperation.DELETE);
      expect(result[1]!.text).toBe('line2');
      expect(result[2]!.operation).toBe(DiffOperation.EQUAL);
      expect(result[2]!.text).toBe('line3');
    });

    it('should handle mixed changes', () => {
      const oldText = 'line1\nold_line\nline3';
      const newText = 'line1\nnew_line\nline3';

      const result = TextDiff.computeLineDiff(oldText, newText);

      expect(result).toHaveLength(4);
      expect(result[0]!.operation).toBe(DiffOperation.EQUAL);
      expect(result[1]!.operation).toBe(DiffOperation.DELETE);
      expect(result[1]!.text).toBe('old_line');
      expect(result[2]!.operation).toBe(DiffOperation.INSERT);
      expect(result[2]!.text).toBe('new_line');
      expect(result[3]!.operation).toBe(DiffOperation.EQUAL);
    });

    it('should handle empty strings', () => {
      const result = TextDiff.computeLineDiff('', '');

      expect(result).toHaveLength(1);
      expect(result[0]!.operation).toBe(DiffOperation.EQUAL);
      expect(result[0]!.text).toBe('');
    });

    it('should handle empty old text', () => {
      const oldText = '';
      const newText = 'new line';

      const result = TextDiff.computeLineDiff(oldText, newText);

      expect(result).toHaveLength(2);
      expect(result[0]!.operation).toBe(DiffOperation.DELETE);
      expect(result[0]!.text).toBe('');
      expect(result[1]!.operation).toBe(DiffOperation.INSERT);
      expect(result[1]!.text).toBe('new line');
    });

    it('should handle empty new text', () => {
      const oldText = 'old line';
      const newText = '';

      const result = TextDiff.computeLineDiff(oldText, newText);

      expect(result).toHaveLength(2);
      expect(result[0]!.operation).toBe(DiffOperation.DELETE);
      expect(result[0]!.text).toBe('old line');
      expect(result[1]!.operation).toBe(DiffOperation.INSERT);
      expect(result[1]!.text).toBe('');
    });

    describe('with options', () => {
      it('should ignore case when ignoreCase is true', () => {
        const oldText = 'HELLO\nWORLD';
        const newText = 'hello\nworld';
        const options: DiffOptions = { ignoreCase: true };

        const result = TextDiff.computeLineDiff(oldText, newText, options);

        expect(result).toHaveLength(1);
        expect(result[0]!.operation).toBe(DiffOperation.EQUAL);
      });

      it('should respect case when ignoreCase is false', () => {
        const oldText = 'HELLO\nWORLD';
        const newText = 'hello\nworld';
        const options: DiffOptions = { ignoreCase: false };

        const result = TextDiff.computeLineDiff(oldText, newText, options);

        expect(result).toHaveLength(3);
        expect(result[0]!.operation).toBe(DiffOperation.DELETE);
        expect(result[1]!.operation).toBe(DiffOperation.DELETE);
        expect(result[2]!.operation).toBe(DiffOperation.INSERT);
      });

      it('should ignore whitespace when ignoreWhitespace is true', () => {
        const oldText = 'hello   world\ntest  line  ';
        const newText = 'hello world\ntest line';
        const options: DiffOptions = { ignoreWhitespace: true };

        const result = TextDiff.computeLineDiff(oldText, newText, options);

        expect(result).toHaveLength(1);
        expect(result[0]!.operation).toBe(DiffOperation.EQUAL);
      });

      it('should respect whitespace when ignoreWhitespace is false', () => {
        const oldText = 'hello   world';
        const newText = 'hello world';
        const options: DiffOptions = { ignoreWhitespace: false };

        const result = TextDiff.computeLineDiff(oldText, newText, options);

        expect(result).toHaveLength(2);
        expect(result[0]!.operation).toBe(DiffOperation.DELETE);
        expect(result[1]!.operation).toBe(DiffOperation.INSERT);
      });
    });
  });

  describe('createHunks', () => {
    it('should return empty array for no edits', () => {
      const edits: DiffEdit[] = [];
      const hunks = TextDiff.createHunks(edits);

      expect(hunks).toEqual([]);
    });

    it('should create single hunk for simple change', () => {
      const edits = [
        { operation: DiffOperation.EQUAL, text: 'line1', oldLineNumber: 0, newLineNumber: 0 },
        { operation: DiffOperation.DELETE, text: 'old_line', oldLineNumber: 1, newLineNumber: 1 },
        { operation: DiffOperation.INSERT, text: 'new_line', oldLineNumber: 1, newLineNumber: 1 },
        { operation: DiffOperation.EQUAL, text: 'line3', oldLineNumber: 2, newLineNumber: 2 },
      ];

      const hunks = TextDiff.createHunks(edits, 1);

      expect(hunks).toHaveLength(1);
      expect(hunks[0]!.oldStart).toBe(1);
      expect(hunks[0]!.newStart).toBe(1);
      expect(hunks[0]!.lines).toHaveLength(4);
      expect(hunks[0]!.lines[0]!.type).toBe(DiffLineType.CONTEXT);
      expect(hunks[0]!.lines[1]!.type).toBe(DiffLineType.DELETION);
      expect(hunks[0]!.lines[2]!.type).toBe(DiffLineType.ADDITION);
      expect(hunks[0]!.lines[3]!.type).toBe(DiffLineType.CONTEXT);
    });

    it('should create multiple hunks for separated changes', () => {
      const edits = [
        { operation: DiffOperation.DELETE, text: 'old1', oldLineNumber: 0, newLineNumber: 0 },
        { operation: DiffOperation.INSERT, text: 'new1', oldLineNumber: 0, newLineNumber: 0 },
        {
          operation: DiffOperation.EQUAL,
          text: 'unchanged1\nunchanged2\nunchanged3\nunchanged4\nunchanged5',
          oldLineNumber: 1,
          newLineNumber: 1,
        },
        { operation: DiffOperation.DELETE, text: 'old2', oldLineNumber: 6, newLineNumber: 6 },
        { operation: DiffOperation.INSERT, text: 'new2', oldLineNumber: 6, newLineNumber: 6 },
      ];

      const hunks = TextDiff.createHunks(edits, 2);

      expect(hunks).toHaveLength(1);
      expect(hunks[0]!.lines.some((line) => line.content === 'old1')).toBe(true);
      expect(hunks[0]!.lines.some((line) => line.content === 'old2')).toBe(true);
    });

    it('should handle different context line numbers', () => {
      const edits = [
        {
          operation: DiffOperation.EQUAL,
          text: 'context1\ncontext2\ncontext3',
          oldLineNumber: 0,
          newLineNumber: 0,
        },
        { operation: DiffOperation.DELETE, text: 'deleted', oldLineNumber: 3, newLineNumber: 3 },
        { operation: DiffOperation.INSERT, text: 'inserted', oldLineNumber: 3, newLineNumber: 3 },
        {
          operation: DiffOperation.EQUAL,
          text: 'context4\ncontext5\ncontext6',
          oldLineNumber: 4,
          newLineNumber: 4,
        },
      ];

      const hunksWithContext1 = TextDiff.createHunks(edits, 1);
      const hunksWithContext3 = TextDiff.createHunks(edits, 3);

      expect(hunksWithContext1[0]!.lines.length).toBeLessThan(hunksWithContext3[0]!.lines.length);
    });

    it('should generate correct hunk headers', () => {
      const edits = [
        { operation: DiffOperation.EQUAL, text: 'line1', oldLineNumber: 0, newLineNumber: 0 },
        { operation: DiffOperation.DELETE, text: 'line2', oldLineNumber: 1, newLineNumber: 1 },
        { operation: DiffOperation.INSERT, text: 'new_line2', oldLineNumber: 1, newLineNumber: 1 },
        { operation: DiffOperation.EQUAL, text: 'line3', oldLineNumber: 2, newLineNumber: 2 },
      ];

      const hunks = TextDiff.createHunks(edits, 1);

      expect(hunks[0]!.header).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@$/);
    });
  });

  describe('edge cases', () => {
    it('should handle text with only newlines', () => {
      const oldText = '\n\n\n';
      const newText = '\n\n';

      const result = TextDiff.computeLineDiff(oldText, newText);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle text with different line endings', () => {
      const oldText = 'line1\r\nline2\r\n';
      const newText = 'line1\nline2\n';

      const result = TextDiff.computeLineDiff(oldText, newText);

      expect(result).toHaveLength(1);
      expect(result[0]!.operation).toBe(DiffOperation.EQUAL);
    });

    it('should handle very long lines', () => {
      const longLine = 'a'.repeat(10000);
      const oldText = `${longLine}\nshort`;
      const newText = `${longLine}\nmodified`;

      const result = TextDiff.computeLineDiff(oldText, newText);

      expect(result).toHaveLength(3);
      expect(result[0]!.operation).toBe(DiffOperation.EQUAL);
      expect(result[1]!.operation).toBe(DiffOperation.DELETE);
      expect(result[2]!.operation).toBe(DiffOperation.INSERT);
    });

    it('should handle unicode characters', () => {
      const oldText = '🚀 rocket\n🌟 star';
      const newText = '🚀 rocket\n⭐ star';

      const result = TextDiff.computeLineDiff(oldText, newText);

      expect(result).toHaveLength(3);
      expect(result[0]!.operation).toBe(DiffOperation.EQUAL);
      expect(result[1]!.operation).toBe(DiffOperation.DELETE);
      expect(result[2]!.operation).toBe(DiffOperation.INSERT);
    });

    it('should handle text ending with newlines', () => {
      const oldText = 'line1\nline2\n';
      const newText = 'line1\nline2';

      const result = TextDiff.computeLineDiff(oldText, newText);

      expect(result).toHaveLength(1);
      expect(result[0]!.operation).toBe(DiffOperation.EQUAL);
    });

    it('should handle single character changes', () => {
      const oldText = 'a';
      const newText = 'b';

      const result = TextDiff.computeLineDiff(oldText, newText);

      expect(result).toHaveLength(2);
      expect(result[0]!.operation).toBe(DiffOperation.DELETE);
      expect(result[1]!.operation).toBe(DiffOperation.INSERT);
    });
  });

  describe('complex scenarios', () => {
    it('should handle file-like content with imports and functions', () => {
      const oldText = `import { foo } from 'bar';

function hello() {
  console.log('old');
}

export default hello;`;

      const newText = `import { foo, baz } from 'bar';

function hello() {
  console.log('new');
  return true;
}

export default hello;`;

      const result = TextDiff.computeLineDiff(oldText, newText);
      const hunks = TextDiff.createHunks(result);

      expect(result.length).toBeGreaterThan(0);
      expect(hunks.length).toBeGreaterThan(0);
      expect(hunks[0]!.lines.some((line) => line.type === DiffLineType.DELETION)).toBe(true);
      expect(hunks[0]!.lines.some((line) => line.type === DiffLineType.ADDITION)).toBe(true);
    });

    it('should handle large diffs with multiple changes', () => {
      const oldLines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
      const newLines = [...oldLines];
      newLines[10] = 'modified line 10';
      newLines[50] = 'modified line 50';
      newLines[90] = 'modified line 90';

      const oldText = oldLines.join('\n');
      const newText = newLines.join('\n');

      const result = TextDiff.computeLineDiff(oldText, newText);
      const hunks = TextDiff.createHunks(result, 3);

      expect(result.length).toBeGreaterThan(0);
      expect(hunks.length).toBe(1); // Changes are close together, single hunk
    });
  });
});
