import path from 'path';

export class PathUtils {
  /**
   * Normalize path consistently across platforms
   */
  public static normalizePath(basePath: string, fileName: string): string {
    const fullPath = basePath ? path.join(basePath, fileName) : fileName;

    // Always use forward slashes for consistency
    return fullPath.replace(/\\/g, '/');
  }
}
