export class HashUtils {
  /**
   * Calculate the SHA-1 hash of the given data and return the hash as a hexadecimal string.
   */
  static async sha1Hex(data: Uint8Array): Promise<string> {
    try {
      const hash = await crypto.subtle.digest('SHA-1', data);
      return HashUtils.bytesToHex(new Uint8Array(hash));
    } catch (e) {
      throw new Error(`SHA-1 algorithm not available: ${(e as Error).message}`);
    }
  }

  private static bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
}
