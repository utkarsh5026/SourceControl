/**
 * BinaryDiff handles detection and basic diffing of binary files
 */
export class BinaryDiff {
  private static readonly BINARY_DETECTION_BYTES = 8192; // Check first 8KB
  private static readonly NULL_BYTE_THRESHOLD = 0.1; // 10% null bytes = binary

  /**
   * Check if content appears to be binary
   */
  public static isBinary(content: Uint8Array): boolean {
    const sampleSize = Math.min(content.length, this.BINARY_DETECTION_BYTES);
    const sample = content.slice(0, sampleSize);

    let nullCount = 0;
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0) {
        nullCount++;
      }
    }

    const nullRatio = nullCount / sample.length;
    return nullRatio > this.NULL_BYTE_THRESHOLD;
  }

  /**
   * Generate simple binary diff info
   */
  public static computeBinaryDiff(
    oldContent: Uint8Array,
    newContent: Uint8Array
  ): {
    sizeDiff: number;
    identical: boolean;
    oldSize: number;
    newSize: number;
  } {
    const oldSize = oldContent.length;
    const newSize = newContent.length;
    const sizeDiff = newSize - oldSize;

    if (oldSize !== newSize) {
      return {
        sizeDiff,
        identical: false,
        oldSize,
        newSize,
      };
    }

    let identical = true;
    for (let i = 0; i < oldSize; i++) {
      if (oldContent[i] !== newContent[i]) {
        identical = false;
        break;
      }
    }

    return {
      sizeDiff,
      identical,
      oldSize,
      newSize,
    };
  }

  /**
   * Compute simple similarity for binary files (based on size)
   */
  public static computeSimilarity(oldContent: Uint8Array, newContent: Uint8Array): number {
    if (oldContent.length === 0 && newContent.length === 0) {
      return 100;
    }

    if (oldContent.length === 0 || newContent.length === 0) {
      return 0;
    }

    const maxSize = Math.max(oldContent.length, newContent.length);
    const minSize = Math.min(oldContent.length, newContent.length);

    return Math.floor((minSize / maxSize) * 100);
  }
}
