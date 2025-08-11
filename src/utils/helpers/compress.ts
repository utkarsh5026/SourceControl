import { deflate, inflate } from 'zlib';
import { promisify } from 'util';

const deflateAsync = promisify(deflate);
const inflateAsync = promisify(inflate);

/**
 * Utility class for compression and decompression operations using DEFLATE algorithm.
 * This class provides static methods for compressing and decompressing byte arrays
 * using Node.js's built-in zlib module.
 */
export class CompressionUtils {
  /**
   * Compresses the given byte array using the DEFLATE compression algorithm.
   * This method uses Node.js's built-in zlib module which implements the same
   * compression algorithm used in ZIP files and Git objects.
   */
  static async compress(data: Uint8Array): Promise<Uint8Array> {
    const buffer = Buffer.from(data);
    const compressed = await deflateAsync(buffer);
    return new Uint8Array(compressed);
  }

  /**
   * Decompresses the given byte array that was previously compressed using
   * the DEFLATE compression algorithm. This method uses Node.js's built-in
   * zlib module to restore the original uncompressed data.
   */
  static async decompress(compressedData: Uint8Array): Promise<Uint8Array> {
    const buffer = Buffer.from(compressedData);
    const decompressed = await inflateAsync(buffer);
    return new Uint8Array(decompressed);
  }
}
