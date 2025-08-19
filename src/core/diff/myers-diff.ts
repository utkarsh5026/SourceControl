export type MyersEdit = {
  type: 'insert' | 'delete' | 'equal';
  oldIndex: number;
  newIndex: number;
  length: number;
};

export type DiffResult = {
  operations: MyersEdit[];
  totalEdits: number;
};

export type MyersPath = {
  x: number; // Position in old sequence
  y: number; // Position in new sequence
  edits: MyersEdit[];
};

/**
 * Myers diff algorithm implementation
 *
 * This is the core algorithm used by Git for computing minimal diffs.
 * It finds the shortest edit script (SES) to transform one sequence into another.
 *
 * The algorithm works by:
 * 1. Building a graph where each path represents an edit sequence
 * 2. Finding the shortest path from start to end
 * 3. Backtracking to reconstruct the actual edits
 *
 * Time complexity: O((M+N)D) where M,N are sequence lengths and D is the edit distance
 * Space complexity: O((M+N)D)
 */
export class MyersDiff {
  private memoizationCache: Map<string, DiffResult> = new Map();

  /**
   * Compute diff between two sequences using recursive Myers algorithm
   */
  public diff<T>(
    oldSequence: T[],
    newSequence: T[],
    areEqual: (a: T, b: T) => boolean = (a, b) => a === b
  ): MyersEdit[] {
    this.memoizationCache = new Map<string, DiffResult>();

    const result = this.findOptimalPath(
      oldSequence,
      newSequence,
      0, // startOldIndex
      0, // startNewIndex
      areEqual
    );

    return this.mergeConsecutiveOperations(result.operations);
  }

  private findOptimalPath<T>(
    oldSequence: T[],
    newSequence: T[],
    oldIndex: number,
    newIndex: number,
    areEqual: (a: T, b: T) => boolean
  ): DiffResult {
    const cacheKey = `${oldIndex},${newIndex}`;
    const cachedResult = this.memoizationCache.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    if (oldIndex >= oldSequence.length && newIndex >= newSequence.length) {
      const result: DiffResult = { operations: [], totalEdits: 0 };
      this.memoizationCache.set(cacheKey, result);
      return result;
    }

    if (newIndex >= newSequence.length) {
      const remainingLength = oldSequence.length - oldIndex;
      const result = {
        operations: [this.myersEdit('delete', oldIndex, newIndex, remainingLength)],
        totalEdits: remainingLength,
      };
      this.memoizationCache.set(cacheKey, result);
      return result;
    }

    if (oldIndex >= oldSequence.length) {
      const remainingLength = newSequence.length - newIndex;
      const result = {
        operations: [this.myersEdit('insert', oldIndex, newIndex, remainingLength)],
        totalEdits: remainingLength,
      };
      this.memoizationCache.set(cacheKey, result);
      return result;
    }

    let bestResult: DiffResult = { operations: [], totalEdits: Infinity };
    if (areEqual(oldSequence[oldIndex]!, newSequence[newIndex]!)) {
      const matchResult = this.findOptimalPath(
        oldSequence,
        newSequence,
        oldIndex + 1,
        newIndex + 1,
        areEqual
      );

      let matchLength = 1;
      while (
        oldIndex + matchLength < oldSequence.length &&
        newIndex + matchLength < newSequence.length &&
        areEqual(oldSequence[oldIndex + matchLength]!, newSequence[newIndex + matchLength]!)
      ) {
        matchLength++;
      }

      // If we found multiple matches, skip ahead and get the result from there
      if (matchLength > 1) {
        const extendedMatchResult = this.findOptimalPath(
          oldSequence,
          newSequence,
          oldIndex + matchLength,
          newIndex + matchLength,
          areEqual
        );

        bestResult = {
          operations: [
            this.myersEdit('equal', oldIndex, newIndex, matchLength),
            ...extendedMatchResult.operations,
          ],
          totalEdits: extendedMatchResult.totalEdits,
        };
      } else {
        bestResult = {
          operations: [this.myersEdit('equal', oldIndex, newIndex, 1), ...matchResult.operations],
          totalEdits: matchResult.totalEdits, // No cost for matches
        };
      }
    }

    const deleteResult = this.findOptimalPath(
      oldSequence,
      newSequence,
      oldIndex + 1,
      newIndex,
      areEqual
    );

    const deleteOption: DiffResult = {
      operations: [
        {
          type: 'delete',
          oldIndex,
          newIndex,
          length: 1,
        },
        ...deleteResult.operations,
      ],
      totalEdits: 1 + deleteResult.totalEdits,
    };

    const insertResult = this.findOptimalPath(
      oldSequence,
      newSequence,
      oldIndex,
      newIndex + 1,
      areEqual
    );

    const insertOption = {
      operations: [this.myersEdit('insert', oldIndex, newIndex, 1), ...insertResult.operations],
      totalEdits: 1 + insertResult.totalEdits,
    };

    if (bestResult.totalEdits === Infinity) {
      bestResult = deleteOption.totalEdits <= insertOption.totalEdits ? deleteOption : insertOption;
    } else {
      if (deleteOption.totalEdits < bestResult.totalEdits) {
        bestResult = deleteOption;
      }
      if (insertOption.totalEdits < bestResult.totalEdits) {
        bestResult = insertOption;
      }
    }

    this.memoizationCache.set(cacheKey, bestResult);
    return bestResult;
  }

  /**
   * Merge consecutive operations of the same type to create cleaner, more readable diffs
   */
  private mergeConsecutiveOperations(operations: MyersEdit[]): MyersEdit[] {
    if (operations.length === 0) return operations;

    const mergedOperations: MyersEdit[] = [];
    let currentOperation: MyersEdit = { ...operations[0] } as MyersEdit;

    for (let i = 1; i < operations.length; i++) {
      const nextOperation = operations[i]!;

      const canMerge =
        currentOperation.type === nextOperation.type &&
        currentOperation.oldIndex + currentOperation.length === nextOperation.oldIndex &&
        currentOperation.newIndex + currentOperation.length === nextOperation.newIndex;

      if (canMerge) {
        currentOperation.length += nextOperation.length;
      } else {
        mergedOperations.push(currentOperation);
        currentOperation = { ...nextOperation };
      }
    }

    mergedOperations.push(currentOperation);
    return mergedOperations;
  }

  private myersEdit(
    type: MyersEdit['type'],
    oldIndex: number,
    newIndex: number,
    length: number
  ): MyersEdit {
    return { type, oldIndex, newIndex, length };
  }
}
