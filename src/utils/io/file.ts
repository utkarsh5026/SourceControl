import { promises as fs } from 'fs';
import { dirname } from 'path';

/**
 * Utility class for file operations.
 */
export class FileUtils {
  /**
   * Creates directories for the given path if they do not exist.
   */
  public static async createDirectories(path: string): Promise<void> {
    try {
      await fs.access(path);
    } catch {
      await fs.mkdir(path, { recursive: true });
    }
  }

  /**
   * Creates a file at the given path with the given content.
   */
  public static async createFile(
    path: string,
    content: Buffer | Uint8Array | string
  ): Promise<void> {
    await this.createDirectories(dirname(path));
    await fs.writeFile(path, content);
  }

  /**
   * Reads the content of a file as a Buffer.
   */
  public static async readFile(path: string): Promise<Buffer> {
    return await fs.readFile(path);
  }

  /**
   * Checks if a file exists at the given path.
   */
  public static async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Checks if a path is a directory.
   */
  public static async isDirectory(path: string): Promise<boolean> {
    try {
      const stats = await fs.stat(path);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Checks if a path is a file.
   */
  public static async isFile(path: string): Promise<boolean> {
    try {
      const stats = await fs.stat(path);
      return stats.isFile();
    } catch {
      return false;
    }
  }
}
