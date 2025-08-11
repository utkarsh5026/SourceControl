import { createHash } from 'crypto';

export class HashUtils {
  /**
   * Calculate the SHA-1 hash of the given data and return the hash as a hexadecimal string.
   */
  static async sha1Hex(data: Uint8Array): Promise<string> {
    try {
      const hash = createHash('sha1');
      hash.update(data);
      return hash.digest('hex');
    } catch (e) {
      throw new Error(`SHA-1 algorithm not available: ${(e as Error).message}`);
    }
  }
}
