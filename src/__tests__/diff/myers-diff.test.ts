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

  describe('Complex diff scenarios', () => {
    test('multiple interleaved changes', () => {
      const oldSeq = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
      const newSeq = ['a', 'x', 'c', 'y', 'e', 'z', 'g'];
      
      const result = myersDiff.diff(oldSeq, newSeq);
      
      // Should preserve 'a', 'c', 'e', 'g' and change/insert others
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      expect(equalCount).toBe(4); // 'a', 'c', 'e', 'g'
      
      const deleteCount = result.filter(op => op.type === 'delete').reduce((sum, op) => sum + op.length, 0);
      const insertCount = result.filter(op => op.type === 'insert').reduce((sum, op) => sum + op.length, 0);
      expect(deleteCount).toBe(3); // 'b', 'd', 'f'
      expect(insertCount).toBe(3); // 'x', 'y', 'z'
    });

    test('sequence with majority changes', () => {
      const oldSeq = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
      const newSeq = ['1', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', '10'];
      
      const result = myersDiff.diff(oldSeq, newSeq);
      
      // Should preserve '1' and '10'
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      expect(equalCount).toBe(2);
      
      const deleteCount = result.filter(op => op.type === 'delete').reduce((sum, op) => sum + op.length, 0);
      const insertCount = result.filter(op => op.type === 'insert').reduce((sum, op) => sum + op.length, 0);
      expect(deleteCount).toBe(8); // '2'-'9'
      expect(insertCount).toBe(8); // 'a'-'h'
    });

    test('reverse sequence', () => {
      const oldSeq = ['a', 'b', 'c', 'd'];
      const newSeq = ['d', 'c', 'b', 'a'];
      
      const result = myersDiff.diff(oldSeq, newSeq);
      
      // All elements exist in both sequences but in different positions
      const totalOldCoverage = result.reduce((sum, op) => {
        return op.type === 'equal' || op.type === 'delete' ? sum + op.length : sum;
      }, 0);
      const totalNewCoverage = result.reduce((sum, op) => {
        return op.type === 'equal' || op.type === 'insert' ? sum + op.length : sum;
      }, 0);
      
      expect(totalOldCoverage).toBe(4);
      expect(totalNewCoverage).toBe(4);
    });

    test('nested subsequences', () => {
      const oldSeq = ['x', 'a', 'b', 'c', 'y', 'd', 'e', 'f', 'z'];
      const newSeq = ['a', 'b', 'c', 'd', 'e', 'f'];
      
      const result = myersDiff.diff(oldSeq, newSeq);
      
      // Should preserve the subsequences 'a','b','c' and 'd','e','f'
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      expect(equalCount).toBe(6);
      
      const deleteCount = result.filter(op => op.type === 'delete').reduce((sum, op) => sum + op.length, 0);
      expect(deleteCount).toBe(3); // 'x', 'y', 'z'
    });

    test('large diff with scattered matches', () => {
      const oldSeq = Array.from({ length: 20 }, (_, i) => i % 5 === 0 ? 'KEEP' : `old${i}`);
      const newSeq = Array.from({ length: 25 }, (_, i) => i % 6 === 0 ? 'KEEP' : `new${i}`);
      
      const result = myersDiff.diff(oldSeq, newSeq);
      
      // Should have some preserved 'KEEP' elements
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      expect(equalCount).toBeGreaterThan(0);
      
      // Total coverage should match sequence lengths
      const oldCoverage = result.reduce((sum, op) => {
        return op.type === 'equal' || op.type === 'delete' ? sum + op.length : sum;
      }, 0);
      const newCoverage = result.reduce((sum, op) => {
        return op.type === 'equal' || op.type === 'insert' ? sum + op.length : sum;
      }, 0);
      
      expect(oldCoverage).toBe(20);
      expect(newCoverage).toBe(25);
    });
  });

  describe('Boundary conditions', () => {
    test('sequences of vastly different sizes', () => {
      const smallSeq = ['a'];
      const largeSeq = Array.from({ length: 50 }, (_, i) => `item${i}`);
      
      const result1 = myersDiff.diff(smallSeq, largeSeq);
      expect(result1.filter(op => op.type === 'insert').reduce((sum, op) => sum + op.length, 0)).toBe(50);
      
      const result2 = myersDiff.diff(largeSeq, smallSeq);
      expect(result2.filter(op => op.type === 'delete').reduce((sum, op) => sum + op.length, 0)).toBe(50);
    });

    test('one sequence is prefix of another', () => {
      const prefix = ['a', 'b', 'c'];
      const full = ['a', 'b', 'c', 'd', 'e', 'f'];
      
      const result = myersDiff.diff(prefix, full);
      
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      const insertCount = result.filter(op => op.type === 'insert').reduce((sum, op) => sum + op.length, 0);
      
      expect(equalCount).toBe(3); // 'a', 'b', 'c'
      expect(insertCount).toBe(3); // 'd', 'e', 'f'
    });

    test('one sequence is suffix of another', () => {
      const suffix = ['d', 'e', 'f'];
      const full = ['a', 'b', 'c', 'd', 'e', 'f'];
      
      const result = myersDiff.diff(suffix, full);
      
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      const insertCount = result.filter(op => op.type === 'insert').reduce((sum, op) => sum + op.length, 0);
      
      expect(equalCount).toBe(3); // 'd', 'e', 'f'
      expect(insertCount).toBe(3); // 'a', 'b', 'c'
    });

    test('sequences with single common element', () => {
      const seq1 = ['x', 'common', 'y'];
      const seq2 = ['a', 'b', 'common', 'c', 'd'];
      
      const result = myersDiff.diff(seq1, seq2);
      
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      expect(equalCount).toBe(1); // 'common'
    });

    test('maximum possible edits', () => {
      const seq1 = Array.from({ length: 10 }, (_, i) => `old${i}`);
      const seq2 = Array.from({ length: 12 }, (_, i) => `new${i}`);
      
      const result = myersDiff.diff(seq1, seq2);
      
      // Should delete all old and insert all new (no common elements)
      const deleteCount = result.filter(op => op.type === 'delete').reduce((sum, op) => sum + op.length, 0);
      const insertCount = result.filter(op => op.type === 'insert').reduce((sum, op) => sum + op.length, 0);
      
      expect(deleteCount).toBe(10);
      expect(insertCount).toBe(12);
    });
  });

  describe('Advanced custom equality functions', () => {
    test('fuzzy string matching', () => {
      const fuzzyEqual = (a: string, b: string) => {
        const normalize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return normalize(a) === normalize(b);
      };
      
      const result = myersDiff.diff(
        ['Hello!', 'World?'], 
        ['hello', 'WORLD'], 
        fuzzyEqual
      );
      
      expect(result.every(op => op.type === 'equal')).toBe(true);
    });

    test('numerical tolerance comparison', () => {
      const toleranceEqual = (a: number, b: number, tolerance = 0.001) => 
        Math.abs(a - b) <= tolerance;
      
      const result = myersDiff.diff(
        [1.0, 2.0, 3.0],
        [1.0001, 1.999, 3.0005],
        toleranceEqual
      );
      
      expect(result.every(op => op.type === 'equal')).toBe(true);
    });

    test('deep object comparison', () => {
      interface ComplexObject {
        id: string;
        data: { value: number; tags: string[] };
      }
      
      const deepEqual = (a: ComplexObject, b: ComplexObject) => 
        a.id === b.id && a.data.value === b.data.value;
      
      const oldObjs: ComplexObject[] = [{
        id: 'obj1',
        data: { value: 100, tags: ['old', 'tag'] }
      }];
      
      const newObjs: ComplexObject[] = [{
        id: 'obj1',
        data: { value: 100, tags: ['new', 'tag'] }
      }];
      
      const result = myersDiff.diff(oldObjs, newObjs, deepEqual);
      
      expect(result.every(op => op.type === 'equal')).toBe(true);
    });

    test('custom equality that always returns false', () => {
      const neverEqual = () => false;
      
      const result = myersDiff.diff(['same', 'same'], ['same', 'same'], neverEqual);
      
      // Should treat all elements as different
      const deleteCount = result.filter(op => op.type === 'delete').reduce((sum, op) => sum + op.length, 0);
      const insertCount = result.filter(op => op.type === 'insert').reduce((sum, op) => sum + op.length, 0);
      
      expect(deleteCount).toBe(2);
      expect(insertCount).toBe(2);
    });

    test('custom equality that always returns true', () => {
      const alwaysEqual = () => true;
      
      const result = myersDiff.diff(['different', 'values'], ['completely', 'different'], alwaysEqual);
      
      expect(result.every(op => op.type === 'equal')).toBe(true);
    });
  });

  describe('Sequence patterns', () => {
    test('palindromes', () => {
      const palindrome = ['a', 'b', 'c', 'b', 'a'];
      const reversed = ['a', 'b', 'c', 'b', 'a'];
      
      const result = myersDiff.diff(palindrome, reversed);
      
      expect(result.every(op => op.type === 'equal')).toBe(true);
    });

    test('repeated elements', () => {
      const withRepeats1 = ['a', 'a', 'b', 'b', 'c', 'c'];
      const withRepeats2 = ['a', 'b', 'b', 'c', 'c', 'a'];
      
      const result = myersDiff.diff(withRepeats1, withRepeats2);
      
      // Should handle repeated elements correctly
      const totalOldCoverage = result.reduce((sum, op) => {
        return op.type === 'equal' || op.type === 'delete' ? sum + op.length : sum;
      }, 0);
      const totalNewCoverage = result.reduce((sum, op) => {
        return op.type === 'equal' || op.type === 'insert' ? sum + op.length : sum;
      }, 0);
      
      expect(totalOldCoverage).toBe(6);
      expect(totalNewCoverage).toBe(6);
    });

    test('alternating pattern', () => {
      const pattern1 = ['x', 'y', 'x', 'y', 'x', 'y'];
      const pattern2 = ['y', 'x', 'y', 'x', 'y', 'x'];
      
      const result = myersDiff.diff(pattern1, pattern2);
      
      // All elements exist but in different positions
      const totalEdits = result
        .filter(op => op.type !== 'equal')
        .reduce((sum, op) => sum + op.length, 0);
      
      expect(totalEdits).toBeGreaterThan(0); // Should require some edits
    });

    test('nested repeated subsequences', () => {
      const seq1 = ['start', 'repeat', 'repeat', 'middle', 'repeat', 'repeat', 'end'];
      const seq2 = ['start', 'repeat', 'middle', 'repeat', 'end'];
      
      const result = myersDiff.diff(seq1, seq2);
      
      // Should preserve common structure
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      expect(equalCount).toBeGreaterThan(3); // At least 'start', 'middle', 'end'
    });
  });

  describe('Numerical and mixed data types', () => {
    test('integer sequences', () => {
      const nums1 = [1, 2, 3, 4, 5];
      const nums2 = [1, 3, 5, 7, 9];
      
      const result = myersDiff.diff(nums1, nums2);
      
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      expect(equalCount).toBe(3); // 1, 3, 5
    });

    test('floating point numbers', () => {
      const floats1 = [1.1, 2.2, 3.3, 4.4];
      const floats2 = [1.1, 2.5, 3.3, 4.7];
      
      const result = myersDiff.diff(floats1, floats2);
      
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      expect(equalCount).toBe(2); // 1.1, 3.3
    });

    test('mixed primitive types', () => {
      const mixed1: (string | number | boolean)[] = ['hello', 42, true, 'world'];
      const mixed2: (string | number | boolean)[] = ['hello', 43, false, 'world'];
      
      const result = myersDiff.diff(mixed1, mixed2);
      
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      expect(equalCount).toBe(2); // 'hello', 'world'
    });

    test('object sequences', () => {
      interface TestObj {
        id: number;
        name: string;
      }
      
      const objs1: TestObj[] = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' }
      ];
      
      const objs2: TestObj[] = [
        { id: 1, name: 'Alice' },
        { id: 4, name: 'David' },
        { id: 3, name: 'Charlie' }
      ];
      
      const result = myersDiff.diff(objs1, objs2);
      
      // With default equality, no objects will match as equal since they're different object references
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      expect(equalCount).toBe(0); // No object references match
    });

    test('boolean sequences', () => {
      const bools1 = [true, false, true, false];
      const bools2 = [false, true, false, true];
      
      const result = myersDiff.diff(bools1, bools2);
      
      // All elements exist but potentially in different positions
      const totalEdits = result
        .filter(op => op.type !== 'equal')
        .reduce((sum, op) => sum + op.length, 0);
      
      expect(totalEdits).toBeGreaterThan(0);
    });
  });

  describe('Enhanced memoization tests', () => {
    test('cache effectiveness with overlapping subproblems', () => {
      const createNestedSequence = (depth: number): string[] => 
        depth === 0 ? ['base'] : ['start', ...createNestedSequence(depth - 1), 'end'];
      
      const seq1 = createNestedSequence(3);
      const seq2 = createNestedSequence(3);
      
      // First call to populate cache
      const start1 = Date.now();
      const result1 = myersDiff.diff(seq1, seq2);
      const end1 = Date.now();
      
      // Second call should use cache
      const start2 = Date.now();
      const result2 = myersDiff.diff(seq1, seq2);
      const end2 = Date.now();
      
      expect(result1).toEqual(result2);
      expect(end2 - start2).toBeLessThanOrEqual(end1 - start1); // Should be faster or same
    });

    test('cache behavior with different but similar sequences', () => {
      const baseSeq = ['a', 'b', 'c', 'd', 'e'];
      
      // Test multiple variations
      const variations = [
        ['a', 'b', 'x', 'd', 'e'],
        ['a', 'b', 'c', 'y', 'e'],
        ['a', 'b', 'c', 'd', 'z']
      ];
      
      const results = variations.map(variation => 
        myersDiff.diff(baseSeq, variation)
      );
      
      // Each should produce valid results
      results.forEach(result => {
        const totalCoverage = result.reduce((sum, op) => {
          return op.type === 'equal' || op.type === 'delete' ? sum + op.length : sum;
        }, 0);
        expect(totalCoverage).toBe(5);
      });
    });

    test('memory efficiency with large number of small diffs', () => {
      const basePairs: [string[], string[]][] = Array.from({ length: 20 }, (_, i) => [
        [`item${i}`, 'common'],
        [`item${i}`, 'different']
      ]);
      
      const startTime = Date.now();
      const results = basePairs.map(([seq1, seq2]) => 
        myersDiff.diff(seq1, seq2)
      );
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(2000); // Should complete quickly
      expect(results).toHaveLength(20);
      
      // Each result should be valid
      results.forEach(result => {
        expect(result.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Real-world scenarios', () => {
    test('source code diff simulation', () => {
      const oldCode = [
        'function calculateSum(a, b) {',
        '  return a + b;',
        '}',
        '',
        'function main() {',
        '  console.log(calculateSum(1, 2));',
        '}'
      ];
      
      const newCode = [
        'function calculateSum(a, b) {',
        '  // Added validation',
        '  if (typeof a !== "number" || typeof b !== "number") {',
        '    throw new Error("Arguments must be numbers");',
        '  }',
        '  return a + b;',
        '}',
        '',
        'function main() {',
        '  console.log(calculateSum(1, 2));',
        '  console.log(calculateSum(3, 4));',
        '}'
      ];
      
      const result = myersDiff.diff(oldCode, newCode);
      
      // Should preserve function structure
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      expect(equalCount).toBeGreaterThan(4); // At least some lines preserved
      
      const insertCount = result.filter(op => op.type === 'insert').reduce((sum, op) => sum + op.length, 0);
      expect(insertCount).toBeGreaterThan(0); // New lines added
    });

    test('configuration file diff', () => {
      const oldConfig = [
        'database.host=localhost',
        'database.port=5432',
        'database.name=myapp',
        'cache.enabled=true',
        'logging.level=info'
      ];
      
      const newConfig = [
        'database.host=production-server',
        'database.port=5432',
        'database.name=myapp_prod',
        'database.ssl=true',
        'cache.enabled=false',
        'cache.ttl=3600',
        'logging.level=debug',
        'monitoring.enabled=true'
      ];
      
      const result = myersDiff.diff(oldConfig, newConfig);
      
      // Should identify common structure
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      expect(equalCount).toBeGreaterThan(0);
      
      // Should account for all changes
      const totalOldCoverage = result.reduce((sum, op) => {
        return op.type === 'equal' || op.type === 'delete' ? sum + op.length : sum;
      }, 0);
      expect(totalOldCoverage).toBe(5);
    });

    test('file system path diff', () => {
      const oldPaths = [
        '/home/user/documents',
        '/home/user/pictures',
        '/home/user/music',
        '/home/user/videos'
      ];
      
      const newPaths = [
        '/home/user/documents',
        '/home/user/downloads',
        '/home/user/pictures',
        '/home/user/projects',
        '/home/user/videos'
      ];
      
      const result = myersDiff.diff(oldPaths, newPaths);
      
      // Should preserve common paths
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      expect(equalCount).toBe(3); // documents, pictures, videos
    });

    test('data migration scenario', () => {
      interface DataRecord {
        id: string;
        version: number;
        data: string;
      }
      
      const oldRecords: DataRecord[] = [
        { id: 'rec1', version: 1, data: 'old_data_1' },
        { id: 'rec2', version: 1, data: 'old_data_2' },
        { id: 'rec3', version: 1, data: 'old_data_3' }
      ];
      
      const newRecords: DataRecord[] = [
        { id: 'rec1', version: 2, data: 'new_data_1' },
        { id: 'rec2', version: 1, data: 'old_data_2' }, // Unchanged
        { id: 'rec4', version: 1, data: 'new_data_4' }  // New record
      ];
      
      const compareById = (a: DataRecord, b: DataRecord) => a.id === b.id;
      
      const result = myersDiff.diff(oldRecords, newRecords, compareById);
      
      // rec2 should be preserved (same id), rec3 deleted, rec4 added
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      expect(equalCount).toBe(2); // rec1 and rec2 (compared by id only)
    });

    test('multilingual text diff', () => {
      const oldText = ['Hello', 'World', '世界', 'مرحبا'];
      const newText = ['Hello', 'Universe', '世界', 'السلام'];
      
      const result = myersDiff.diff(oldText, newText);
      
      // Should handle unicode properly
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      expect(equalCount).toBe(2); // 'Hello' and '世界'
    });
  });

  describe('Stress tests', () => {
    test('high edit distance scenario', () => {
      // Create sequences with maximum possible edit distance
      const seq1 = Array.from({ length: 30 }, (_, i) => `unique_old_${i}`);
      const seq2 = Array.from({ length: 35 }, (_, i) => `unique_new_${i}`);
      
      const start = Date.now();
      const result = myersDiff.diff(seq1, seq2);
      const end = Date.now();
      
      expect(end - start).toBeLessThan(3000); // Should complete in reasonable time
      
      // Should delete all old and insert all new
      const deleteCount = result.filter(op => op.type === 'delete').reduce((sum, op) => sum + op.length, 0);
      const insertCount = result.filter(op => op.type === 'insert').reduce((sum, op) => sum + op.length, 0);
      
      expect(deleteCount).toBe(30);
      expect(insertCount).toBe(35);
    });

    test('highly repetitive sequences', () => {
      const repetitive1 = Array.from({ length: 50 }, (_, i) => i % 3 === 0 ? 'A' : (i % 3 === 1 ? 'B' : 'C'));
      const repetitive2 = Array.from({ length: 55 }, (_, i) => i % 4 === 0 ? 'A' : (i % 4 === 1 ? 'B' : (i % 4 === 2 ? 'C' : 'D')));
      
      const start = Date.now();
      const result = myersDiff.diff(repetitive1, repetitive2);
      const end = Date.now();
      
      expect(end - start).toBeLessThan(5000); // Should handle repetitive patterns
      expect(result.length).toBeGreaterThan(0);
      
      // Verify coverage
      const oldCoverage = result.reduce((sum, op) => {
        return op.type === 'equal' || op.type === 'delete' ? sum + op.length : sum;
      }, 0);
      expect(oldCoverage).toBe(50);
    });

    test('pathological case with many small differences', () => {
      const seq1 = Array.from({ length: 40 }, (_, i) => i % 2 === 0 ? 'SAME' : `diff1_${i}`);
      const seq2 = Array.from({ length: 40 }, (_, i) => i % 2 === 0 ? 'SAME' : `diff2_${i}`);
      
      const start = Date.now();
      const result = myersDiff.diff(seq1, seq2);
      const end = Date.now();
      
      expect(end - start).toBeLessThan(3000);
      
      // Should preserve all 'SAME' elements
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      expect(equalCount).toBe(20); // Half the elements are 'SAME'
    });
  });

  describe('Edge cases and robustness', () => {
    test('handles null and undefined values in sequences', () => {
      const seq1: (string | null | undefined)[] = ['a', null, 'b', undefined, 'c'];
      const seq2: (string | null | undefined)[] = ['a', null, undefined, 'c'];
      
      const result = myersDiff.diff(seq1, seq2);
      
      // Should handle null/undefined correctly
      expect(result.length).toBeGreaterThan(0);
      
      const totalOldCoverage = result.reduce((sum, op) => {
        return op.type === 'equal' || op.type === 'delete' ? sum + op.length : sum;
      }, 0);
      expect(totalOldCoverage).toBe(5);
    });

    test('handles very large equality function computations', () => {
      const expensiveEqual = (a: string, b: string) => {
        // Simulate expensive computation
        let hash1 = 0, hash2 = 0;
        for (let i = 0; i < a.length; i++) {
          hash1 = ((hash1 << 5) - hash1 + a.charCodeAt(i)) | 0;
        }
        for (let i = 0; i < b.length; i++) {
          hash2 = ((hash2 << 5) - hash2 + b.charCodeAt(i)) | 0;
        }
        return hash1 === hash2;
      };
      
      const result = myersDiff.diff(['hello', 'world'], ['hello', 'world'], expensiveEqual);
      
      expect(result.every(op => op.type === 'equal')).toBe(true);
    });

    test('preserves sequence order invariants', () => {
      const seq1 = ['z', 'y', 'x', 'w', 'v'];
      const seq2 = ['a', 'b', 'x', 'c', 'd'];
      
      const result = myersDiff.diff(seq1, seq2);
      
      // Verify monotonic index properties
      for (let i = 1; i < result.length; i++) {
        const prev = result[i - 1]!;
        const curr = result[i]!;
        
        expect(curr.oldIndex).toBeGreaterThanOrEqual(prev.oldIndex);
        expect(curr.newIndex).toBeGreaterThanOrEqual(prev.newIndex);
      }
    });

    test('handles special string characters', () => {
      const seq1 = ['🚀', '💻', '🌟', '🔥'];
      const seq2 = ['🚀', '🎉', '🌟', '⭐'];
      
      const result = myersDiff.diff(seq1, seq2);
      
      // Should handle emojis correctly
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      expect(equalCount).toBe(2); // '🚀' and '🌟'
    });

    test('consistent results across multiple runs', () => {
      const seq1 = ['consistent', 'test', 'data'];
      const seq2 = ['consistent', 'modified', 'data'];
      
      const results = Array.from({ length: 5 }, () => myersDiff.diff(seq1, seq2));
      
      // All results should be identical
      results.forEach(result => {
        expect(result).toEqual(results[0]);
      });
    });

    test('gracefully handles extreme repetition', () => {
      const extremeRepeat1 = Array.from({ length: 100 }, () => 'SAME');
      const extremeRepeat2 = Array.from({ length: 105 }, () => 'SAME');
      
      const start = Date.now();
      const result = myersDiff.diff(extremeRepeat1, extremeRepeat2);
      const end = Date.now();
      
      expect(end - start).toBeLessThan(2000); // Should handle efficiently
      
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      expect(equalCount).toBe(100); // All matching elements preserved
    });

    test('validates operation integrity in complex scenario', () => {
      const complexSeq1 = Array.from({ length: 15 }, (_, i) => 
        i % 3 === 0 ? 'ANCHOR' : `var_${Math.floor(Math.random() * 100)}`
      );
      const complexSeq2 = Array.from({ length: 18 }, (_, i) => 
        i % 4 === 0 ? 'ANCHOR' : `new_${Math.floor(Math.random() * 100)}`
      );
      
      const result = myersDiff.diff(complexSeq1, complexSeq2);
      
      // Verify all operations are valid
      result.forEach(op => {
        expect(['equal', 'insert', 'delete']).toContain(op.type);
        expect(op.length).toBeGreaterThan(0);
        expect(op.oldIndex).toBeGreaterThanOrEqual(0);
        expect(op.newIndex).toBeGreaterThanOrEqual(0);
        expect(op.oldIndex).toBeLessThanOrEqual(complexSeq1.length);
        expect(op.newIndex).toBeLessThanOrEqual(complexSeq2.length);
      });
      
      // Verify complete coverage
      const oldTotal = result.reduce((sum, op) => {
        return op.type === 'equal' || op.type === 'delete' ? sum + op.length : sum;
      }, 0);
      const newTotal = result.reduce((sum, op) => {
        return op.type === 'equal' || op.type === 'insert' ? sum + op.length : sum;
      }, 0);
      
      expect(oldTotal).toBe(complexSeq1.length);
      expect(newTotal).toBe(complexSeq2.length);
    });

    test('handles sequences with cyclical patterns', () => {
      const cycle1 = Array.from({ length: 12 }, (_, i) => String.fromCharCode(65 + (i % 4))); // ABCDABCDABCD
      const cycle2 = Array.from({ length: 15 }, (_, i) => String.fromCharCode(65 + (i % 3))); // ABCABCABCABCABC
      
      const result = myersDiff.diff(cycle1, cycle2);
      
      // Should handle cyclical patterns correctly
      expect(result.length).toBeGreaterThan(0);
      
      const totalOldCoverage = result.reduce((sum, op) => {
        return op.type === 'equal' || op.type === 'delete' ? sum + op.length : sum;
      }, 0);
      expect(totalOldCoverage).toBe(12);
    });

    test('optimizes for common subsequence patterns', () => {
      const base = ['prefix', 'common1', 'common2', 'common3', 'suffix'];
      const modified = ['newprefix', 'common1', 'common2', 'common3', 'newsuffix'];
      
      const result = myersDiff.diff(base, modified);
      
      // Should identify the common subsequence
      const equalCount = result.filter(op => op.type === 'equal').reduce((sum, op) => sum + op.length, 0);
      expect(equalCount).toBe(3); // common1, common2, common3
    });

    test('handles whitespace and special character sequences', () => {
      const seq1 = [' ', '\t', '\n', '\r\n', ''];
      const seq2 = ['', ' ', '\n', '\t', '\r'];
      
      const result = myersDiff.diff(seq1, seq2);
      
      // Should differentiate between different whitespace characters
      expect(result.length).toBeGreaterThan(0);
      
      const totalCoverage = result.reduce((sum, op) => {
        return op.type === 'equal' || op.type === 'delete' ? sum + op.length : sum;
      }, 0);
      expect(totalCoverage).toBe(5);
    });
  });
});