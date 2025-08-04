export class HashUtils {
  public static async sha1Hex(data: Uint8Array | string): Promise<string> {
    let bytes: Uint8Array;

    if (typeof data === "string") {
      bytes = new TextEncoder().encode(data);
    } else {
      bytes = data;
    }

    try {
      const hashBuffer = await crypto.subtle.digest(
        "SHA-1",
        new Uint8Array(bytes)
      );
      return this.bytesToHex(new Uint8Array(hashBuffer));
    } catch (error) {
      throw new Error(`SHA-1 algorithm not available: ${error}`);
    }
  }

  private static bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
}
