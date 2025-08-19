import { MyersDiff, MyersEdit } from '../../core/diff/myers-diff';

describe('MyersDiff - Core Functionality', () => {
  let myersDiff: MyersDiff;

  beforeEach(() => {
    myersDiff = new MyersDiff();
  });

  describe('Basic correctness', () => {
    test('identical sequences produce only equal operations', () => {
      const result = myersDiff.diff(['a', 'b', 'c'], ['a', 'b', 'c']);
      
      expect(result.every(op => op.type === 'equal')).toBe(true);
      expect(result.reduce((sum, op) => sum + op.length, 0)).toBe(3);
    });

    test('completely different sequences produce correct edit counts', () => {
      const result = myersDiff.diff(['a', 'b', 'c'], ['x', 'y', 'z']);
      
      const deleteCount = result.filter(op => op.type === 'delete').reduce((sum, op) => sum + op.length, 0);
      const insertCount = result.filter(op => op.type === 'insert').reduce((sum, op) => sum + op.length, 0);
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      
      expect(deleteCount).toBe(3);
      expect(insertCount).toBe(3);
      expect(equalCount).toBe(0);
    });

    test('empty sequences', () => {
      expect(myersDiff.diff([], [])).toEqual([]);
      
      const insertResult = myersDiff.diff([], ['a', 'b']);
      expect(insertResult.filter(op => op.type === 'insert').reduce((sum, op) => sum + op.length, 0)).toBe(2);
      
      const deleteResult = myersDiff.diff(['a', 'b'], []);
      expect(deleteResult.filter(op => op.type === 'delete').reduce((sum, op) => sum + op.length, 0)).toBe(2);
    });

    test('single insertion preserves existing elements', () => {
      const result = myersDiff.diff(['a', 'c'], ['a', 'b', 'c']);
      
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      const insertCount = result.filter(op => op.type === 'insert').reduce((sum, op) => sum + op.length, 0);
      
      expect(equalCount).toBe(2); // 'a' and 'c' preserved
      expect(insertCount).toBe(1); // 'b' inserted
    });

    test('single deletion removes correct element', () => {
      const result = myersDiff.diff(['a', 'b', 'c'], ['a', 'c']);
      
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      const deleteCount = result.filter(op => op.type === 'delete').reduce((sum, op) => sum + op.length, 0);
      
      expect(equalCount).toBe(2); // 'a' and 'c' preserved
      expect(deleteCount).toBe(1); // 'b' deleted
    });
  });

  describe('Custom equality function', () => {
    test('case-insensitive comparison', () => {
      const caseInsensitive = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
      
      const result = myersDiff.diff(['Hello', 'World'], ['HELLO', 'world'], caseInsensitive);
      
      expect(result.every(op => op.type === 'equal')).toBe(true);
    });

    test('object comparison by property', () => {
      interface Item { id: number; name: string; }
      const compareById = (a: Item, b: Item) => a.id === b.id;
      
      const old: Item[] = [{ id: 1, name: 'Old' }];
      const new_: Item[] = [{ id: 1, name: 'New' }]; // Same id, different name
      
      const result = myersDiff.diff(old, new_, compareById);
      
      expect(result.every(op => op.type === 'equal')).toBe(true);
    });
  });

  describe('Algorithm properties', () => {
    test('all operations have positive length', () => {
      const result = myersDiff.diff(['a', 'b'], ['x', 'y', 'z']);
      
      result.forEach(op => {
        expect(op.length).toBeGreaterThan(0);
      });
    });

    test('indices are monotonically increasing', () => {
      const result = myersDiff.diff(['a', 'b', 'c'], ['a', 'x', 'c']);
      
      let prevOldIndex = -1;
      let prevNewIndex = -1;
      
      result.forEach(op => {
        expect(op.oldIndex).toBeGreaterThanOrEqual(prevOldIndex);
        expect(op.newIndex).toBeGreaterThanOrEqual(prevNewIndex);
        prevOldIndex = op.oldIndex;
        prevNewIndex = op.newIndex;
      });
    });

    test('indices are within sequence bounds', () => {
      const oldSeq = ['a', 'b'];
      const newSeq = ['x', 'y', 'z'];
      const result = myersDiff.diff(oldSeq, newSeq);
      
      result.forEach(op => {
        expect(op.oldIndex).toBeGreaterThanOrEqual(0);
        expect(op.oldIndex).toBeLessThanOrEqual(oldSeq.length);
        expect(op.newIndex).toBeGreaterThanOrEqual(0);
        expect(op.newIndex).toBeLessThanOrEqual(newSeq.length);
      });
    });

    test('produces minimal edit sequence for simple cases', () => {
      // For ['a','b','c'] -> ['a','c','d'], minimum should be: keep 'a', delete 'b', keep 'c', insert 'd'
      const result = myersDiff.diff(['a', 'b', 'c'], ['a', 'c', 'd']);
      
      const totalEdits = result
        .filter(op => op.type !== 'equal')
        .reduce((sum, op) => sum + op.length, 0);
      
      // Should need exactly 2 operations: delete 'b', insert 'd'
      expect(totalEdits).toBe(2);
    });
  });

  describe('Performance and caching', () => {
    test('handles moderate sized sequences', () => {
      const oldSeq = Array.from({ length: 50 }, (_, i) => `old${i}`);
      const newSeq = Array.from({ length: 60 }, (_, i) => `new${i}`);
      
      const start = Date.now();
      const result = myersDiff.diff(oldSeq, newSeq);
      const end = Date.now();
      
      expect(end - start).toBeLessThan(1000); // Should complete in under 1 second
      expect(result.length).toBeGreaterThan(0);
    });

    test('repeated calls with same input give same result', () => {
      const oldSeq = ['a', 'b', 'c'];
      const newSeq = ['a', 'x', 'c'];
      
      const result1 = myersDiff.diff(oldSeq, newSeq);
      const result2 = myersDiff.diff(oldSeq, newSeq);
      
      expect(result1).toEqual(result2);
    });
  });

  describe('String diff scenarios', () => {
    test('word-level diff', () => {
      const oldWords = ['The', 'quick', 'brown', 'fox'];
      const newWords = ['The', 'fast', 'brown', 'dog'];
      
      const result = myersDiff.diff(oldWords, newWords);
      
      // Should preserve 'The' and 'brown', change 'quick' to 'fast' and 'fox' to 'dog'
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      expect(equalCount).toBe(2); // 'The' and 'brown'
    });

    test('character-level diff', () => {
      const oldChars = 'hello'.split('');
      const newChars = 'help'.split('');
      
      const result = myersDiff.diff(oldChars, newChars);
      
      // Should keep 'h', 'e', 'l' and change the ending
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      expect(equalCount).toBeGreaterThanOrEqual(3); // At least 'h', 'e', 'l'
    });
  });

  describe('Edge cases', () => {
    test('single element sequences', () => {
      expect(myersDiff.diff(['a'], ['a'])).toEqual([
        { type: 'equal', oldIndex: 0, newIndex: 0, length: 1 }
      ]);
      
      const diffResult = myersDiff.diff(['a'], ['b']);
      expect(diffResult.filter(op => op.type === 'delete').reduce((sum, op) => sum + op.length, 0)).toBe(1);
      expect(diffResult.filter(op => op.type === 'insert').reduce((sum, op) => sum + op.length, 0)).toBe(1);
    });

    test('very long identical sequences are correct', () => {
      const longSeq = Array.from({ length: 100 }, (_, i) => `item${i}`); // Reduced size for test performance
      
      const start = Date.now();
      const result = myersDiff.diff(longSeq, longSeq);
      const end = Date.now();
      
      expect(end - start).toBeLessThan(5000); // Allow reasonable time for processing
      expect(result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0)).toBe(100);
    });
  });

  describe('Functional correctness verification', () => {
    function applyDiff<T>(oldSeq: T[], operations: MyersEdit[]): T[] {
      const result: T[] = [];
      
      operations.forEach(op => {
        switch (op.type) {
          case 'equal':
            for (let i = 0; i < op.length; i++) {
              const item = oldSeq[op.oldIndex + i];
              if (item !== undefined) {
                result.push(item);
              }
            }
            break;
          case 'insert':
            // For this test, we can't actually insert without knowing what to insert
            // So we'll just verify the structure is correct
            break;
          case 'delete':
            // Delete operations don't add to result
            break;
        }
      });
      
      return result;
    }

    test('diff operations maintain sequence integrity', () => {
      const oldSeq = ['a', 'b', 'c', 'd'];
      const newSeq = ['a', 'x', 'c', 'd'];
      
      const result = myersDiff.diff(oldSeq, newSeq);
      
      // Verify that equal operations reference valid indices
      result.filter(op => op.type === 'equal').forEach(op => {
        for (let i = 0; i < op.length; i++) {
          expect(oldSeq[op.oldIndex + i]).toBeDefined();
          expect(newSeq[op.newIndex + i]).toBeDefined();
          expect(oldSeq[op.oldIndex + i]).toBe(newSeq[op.newIndex + i]);
        }
      });
    });

    test('total sequence coverage', () => {
      const oldSeq = ['a', 'b', 'c'];
      const newSeq = ['a', 'x', 'y'];
      
      const result = myersDiff.diff(oldSeq, newSeq);
      
      // All old sequence elements should be accounted for
      const oldCoverage = result.reduce((sum, op) => {
        if (op.type === 'equal' || op.type === 'delete') {
          return sum + op.length;
        }
        return sum;
      }, 0);
      
      // All new sequence elements should be accounted for  
      const newCoverage = result.reduce((sum, op) => {
        if (op.type === 'equal' || op.type === 'insert') {
          return sum + op.length;
        }
        return sum;
      }, 0);
      
      expect(oldCoverage).toBe(oldSeq.length);
      expect(newCoverage).toBe(newSeq.length);
    });
  });
});