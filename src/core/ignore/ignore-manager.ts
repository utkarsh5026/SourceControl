import path from 'path';
import fs from 'fs-extra';
import { FileUtils, logger } from '@/utils';
import { Repository } from '@/core/repo';
import { IgnorePatternSet } from './ignore-pattern-set';
import { IgnorePattern } from './ignore-pattern';
import { DEFAULT_IGNORE_CONTENT } from './default-ignore';

export interface IgnoreStats {
  globalPatterns: number;
  rootPatterns: number;
  directoryPatterns: number;
  totalPatterns: number;
  cacheSize: number;
}

/**
 * IgnoreManager handles all ignore pattern functionality for the repository.
 *
 * It manages a hierarchy of .sourceignore files:
 * 1. Global ignore patterns (~/.config/sourcecontrol/ignore)
 * 2. Repository-level patterns (.sourceignore in root)
 * 3. Directory-level patterns (.sourceignore in subdirectories)
 *
 * Pattern Priority (highest to lowest):
 * 1. Negation patterns in closest .sourceignore
 * 2. Regular patterns in closest .sourceignore
 * 3. Parent directory .sourceignore files
 * 4. Repository root .sourceignore
 * 5. Global ignore patterns
 */
export class IgnoreManager {
  private repository: Repository;
  private globalPatterns: IgnorePatternSet;
  private rootPatterns: IgnorePatternSet;
  private directoryPatterns: Map<string, IgnorePatternSet>;
  private cache: Map<string, boolean>;

  public static readonly DEFAULT_PATTERNS = [
    '.source/', // Source control directory itself
    '.git/', // Git directory (for compatibility)
    '*.swp', // Vim swap files
    '*.swo', // Vim swap files
    '*~', // Backup files
    '.DS_Store', // macOS metadata
    'Thumbs.db', // Windows metadata
    'desktop.ini', // Windows metadata
    '.Spotlight-V100', // macOS Spotlight
    '.Trashes', // macOS trash
    '._*', // macOS resource forks
  ];

  constructor(repository: Repository) {
    this.repository = repository;
    this.globalPatterns = new IgnorePatternSet();
    this.rootPatterns = new IgnorePatternSet();
    this.directoryPatterns = new Map();
    this.cache = new Map();

    this.loadDefaultPatterns();
  }

  /**
   * Initialize the ignore manager by loading all ignore files
   */
  public async initialize(): Promise<void> {
    await this.loadGlobalPatterns();
    await this.loadRootPatterns();
    await this.scanDirectoryPatterns();
  }

  /**
   * Add a pattern to the root .sourceignore file
   */
  public async addPattern(pattern: string) {
    const cwd = this.repository.workingDirectory().fullpath();
    const ignorePath = path.join(cwd, IgnorePattern.DEFAULT_SOURCE);

    const content = pattern + '\n';
    await fs.appendFile(ignorePath, content, 'utf8');

    await this.loadRootPatterns();
    this.clearCache();
  }

  /**
   * Check multiple files for ignore status (batch operation)
   */
  async areIgnored(
    filePaths: string[],
    isDirectory: boolean = false
  ): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    filePaths.forEach((filePath) => {
      results.set(filePath, this.isIgnored(filePath, isDirectory));
    });

    return results;
  }

  /**
   * Check if a file should be ignored
   */
  public isIgnored(filePath: string, isDirectory: boolean = false): boolean {
    filePath = path.normalize(filePath).replace(/\\/g, '/');

    const cacheKey = `${filePath}:${isDirectory}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    if (filePath === '.source' || filePath.startsWith('.source/')) {
      this.cache.set(cacheKey, true);
      return true;
    }

    let isIgnored = false;
    const checkOrder: Array<{ patterns: IgnorePatternSet; base: string }> = [];

    const dirPath = path.dirname(filePath);
    const parentDirs = this.getParentDirectories(dirPath);
    parentDirs.forEach((dir) => {
      if (!this.directoryPatterns.has(dir)) return;

      checkOrder.push({
        patterns: this.directoryPatterns.get(dir)!,
        base: dir,
      });
    });

    checkOrder.push({
      patterns: this.rootPatterns,
      base: '',
    });

    checkOrder.push({
      patterns: this.globalPatterns,
      base: '',
    });

    for (const { patterns, base } of checkOrder) {
      if (patterns.isIgnored(filePath, isDirectory, base)) {
        isIgnored = true;
        break;
      }
    }

    this.cache.set(cacheKey, isIgnored);
    return isIgnored;
  }

  /**
   * Clear the ignore cache
   */
  public clearCache() {
    this.cache.clear();
  }

  /**
   * Create a default .sourceignore file with common patterns
   */
  public static async createDefaultIgnoreFile(repoPath: string): Promise<void> {
    const ignorePath = path.join(repoPath, IgnorePattern.DEFAULT_SOURCE);
    await fs.writeFile(ignorePath, DEFAULT_IGNORE_CONTENT, 'utf8');
  }

  /**
   * Load global ignore patterns from user config
   */
  private async loadGlobalPatterns(): Promise<void> {
    const globalIgnorePath = this.getGlobalIgnorePath();
    if (!FileUtils.exists(globalIgnorePath)) return;

    try {
      const content = await fs.readFile(globalIgnorePath, 'utf8');
      this.globalPatterns.addPatternsFromText(content, globalIgnorePath);
    } catch (error) {
      logger.warn('Failed to load global ignore patterns:', error);
    }
  }

  /**
   * Load repository root .sourceignore file
   */
  private async loadRootPatterns(): Promise<void> {
    const cwd = this.repository.workingDirectory().fullpath();
    const rootIgnorePath = path.join(cwd, IgnorePattern.DEFAULT_SOURCE);

    if (!FileUtils.exists(rootIgnorePath)) return;

    try {
      const content = await fs.readFile(rootIgnorePath, 'utf8');
      this.rootPatterns.clear();
      this.rootPatterns.addPatternsFromText(content, IgnorePattern.DEFAULT_SOURCE);
    } catch (error) {
      logger.warn('Failed to load root .sourceignore:', error);
    }
  }

  /**
   * Scan repository for directory-level .sourceignore files
   */
  private async scanDirectoryPatterns(): Promise<void> {
    const workDir = this.repository.workingDirectory().fullpath();
    this.directoryPatterns.clear();

    const scanDir = async (dir: string, relativeDir: string = '') => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      entries.forEach(async (entry) => {
        if (!entry.isDirectory()) return;

        const fullPath = path.join(dir, entry.name);
        const relativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
        if (entry.name === '.source' || entry.name === '.git') {
          return;
        }

        const ignorePath = path.join(fullPath, IgnorePattern.DEFAULT_SOURCE);
        if (!FileUtils.exists(ignorePath)) return;

        try {
          await this.addDirectoryPatterns(ignorePath, relativePath);
        } catch (error) {
          logger.warn(`Failed to load ${ignorePath}:`, error);
        }

        await scanDir(fullPath, relativePath);
      });
    };

    try {
      await scanDir(workDir);
    } catch (error) {
      logger.warn('Failed to scan for .sourceignore files:', error);
    }
  }

  /**
   * Get path to global ignore file
   */
  private getGlobalIgnorePath(): string {
    const homeDir = process.env['HOME'] || process.env['USERPROFILE'] || '';
    return path.join(homeDir, '.config', 'sourcecontrol', 'ignore');
  }

  /**
   * Add patterns from a directory-level .sourceignore file
   */
  private async addDirectoryPatterns(ignorePath: string, relativePath: string) {
    const content = await fs.readFile(ignorePath, 'utf8');
    const patterns = new IgnorePatternSet();
    patterns.addPatternsFromText(content, relativePath);
    this.directoryPatterns.set(relativePath, patterns);
  }

  /**
   * Load default patterns that are always ignored
   */
  private loadDefaultPatterns(): void {
    IgnoreManager.DEFAULT_PATTERNS.forEach((pattern) => {
      const ignorePattern = new IgnorePattern(pattern, 'default', 0);
      if (!ignorePattern) return;
      this.globalPatterns.add(ignorePattern);
    });
  }

  /**
   * Get parent directories of a path (closest first)
   */
  private getParentDirectories(dirPath: string): string[] {
    const dirs: string[] = [];
    if (dirPath === '.' || dirPath.length === 0) return dirs;

    let current = dirPath;
    while (current && current !== '.' && current !== '/') {
      dirs.push(current);
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }

    return dirs;
  }

  /**
   * Get statistics about loaded patterns
   */
  public getStats(): IgnoreStats {
    let directoryPatternsCount = 0;
    for (const patterns of this.directoryPatterns.values()) {
      directoryPatternsCount += patterns.ignoredPatterns.length;
    }

    return {
      globalPatterns: this.globalPatterns.ignoredPatterns.length,
      rootPatterns: this.rootPatterns.ignoredPatterns.length,
      directoryPatterns: directoryPatternsCount,
      totalPatterns:
        this.globalPatterns.ignoredPatterns.length +
        this.rootPatterns.ignoredPatterns.length +
        directoryPatternsCount,
      cacheSize: this.cache.size,
    };
  }
}
