/**
 * Utility class for compressing and decompressing data using the Compression Streams API.
 * This implements the same DEFLATE compression algorithm used in ZIP files and Git objects.
 */
export class CompressionUtils {
  /**
   * Compresses the given byte array using the DEFLATE compression algorithm.
   * Uses the browser's built-in Compression Streams API which implements the same
   * compression algorithm used in ZIP files and Git objects.
   */
  public static async compress(data: Uint8Array): Promise<Uint8Array> {
    try {
      const stream = new CompressionStream("deflate");
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();

      await writer.write(new Uint8Array(data));
      await writer.close();

      const chunks: Uint8Array[] = [];
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          chunks.push(value);
        }
      }

      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;

      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      return result;
    } catch (error) {
      throw new Error(`Compression failed: ${error}`);
    }
  }

  /**
   * Decompresses the given byte array that was previously compressed using
   * the DEFLATE compression algorithm. Uses the browser's built-in
   * Decompression Streams API to restore the original uncompressed data.
   */
  public static async decompress(
    compressedData: Uint8Array
  ): Promise<Uint8Array> {
    try {
      const stream = new DecompressionStream("deflate");
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();

      await writer.write(new Uint8Array(compressedData));
      await writer.close();

      const chunks: Uint8Array[] = [];
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          chunks.push(value);
        }
      }

      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;

      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      return result;
    } catch (error) {
      throw new Error(`Decompression failed: ${error}`);
    }
  }
}
