import { minimatch } from 'minimatch';

interface PatternConfig {
  isNegation: boolean;
  isDirectory: boolean;
  isRooted: boolean;
  cleanedPattern: string;
}

/**
 * Path context for matching operations
 */
export interface PathContext {
  originalPath: string;
  normalizedPath: string;
  testPath: string;
  isDirectory: boolean;
  baseDirectory: string;
}

/**
 * Represents a single ignore pattern from .sourceignore file
 *
 * Pattern Rules:
 * - Blank lines and lines starting with # are comments
 * - Trailing spaces are ignored unless escaped with \
 * - ! prefix negates the pattern (re-includes files)
 * - / suffix matches only directories
 * - / prefix matches from repository root
 * - ** matches zero or more directories
 * - * matches anything except /
 * - ? matches any single character except /
 * - [...] matches character ranges
 *
 * Examples:
 * - *.log         → Ignore all .log files
 * - build/        → Ignore build directory
 * - /TODO         → Ignore TODO file in root only
 * - **\/temp       → Ignore temp in any directory
 * - !important.log → Don't ignore important.log
 * - docs/*.pdf    → Ignore PDFs in docs directory
 * - src/**\/*.test.ts → Ignore test files in src
 */
export class IgnorePattern {
  readonly pattern: string;
  readonly originalPattern: string;
  readonly isNegation: boolean;
  readonly isDirectory: boolean;
  readonly isRooted: boolean;
  readonly source: string;
  readonly lineNumber: number;

  public static readonly DEFAULT_SOURCE = '.sourceignore';
  private static readonly COMMENT_PREFIX = '#';

  /**
   * Create a new ignore pattern
   */
  constructor(
    pattern: string,
    source: string = IgnorePattern.DEFAULT_SOURCE,
    lineNumber: number = 0
  ) {
    this.originalPattern = pattern;
    this.source = source;
    this.lineNumber = lineNumber;

    const { isNegation, isDirectory, isRooted, cleanedPattern } =
      this.parsePatternConfiguration(pattern);
    this.isNegation = isNegation;
    this.isDirectory = isDirectory;
    this.isRooted = isRooted;
    this.pattern = this.unescapePattern(cleanedPattern);
  }

  /**
   * Parse the pattern configuration
   */
  private parsePatternConfiguration(pattern: string): PatternConfig {
    const config: PatternConfig = {
      isNegation: false,
      isDirectory: false,
      isRooted: false,
      cleanedPattern: pattern,
    };

    const removePrefix = (str: string, prefix: string) => {
      return str.startsWith(prefix) ? str.substring(prefix.length) : str;
    };

    const removeSuffix = (str: string, suffix: string) => {
      return str.endsWith(suffix) ? str.substring(0, str.length - suffix.length) : str;
    };

    if (config.cleanedPattern.startsWith('!')) {
      config.isNegation = true;
      config.cleanedPattern = removePrefix(config.cleanedPattern, '!');
    }

    if (config.cleanedPattern.endsWith('/')) {
      config.isDirectory = true;
      config.cleanedPattern = removeSuffix(config.cleanedPattern, '/');
    }

    if (config.cleanedPattern.startsWith('/')) {
      config.isRooted = true;
      config.cleanedPattern = removePrefix(config.cleanedPattern, '/');
    }

    return config;
  }

  /**
   * Check if this pattern matches the given path
   * @param filePath - Path relative to repository root
   * @param isDirectory - Whether the path is a directory
   * @param fromDirectory - Directory containing the .sourceignore file
   */
  public matches(filePath: string, isDirectory: boolean, fromDirectory: string = ''): boolean {
    filePath = filePath.replace(/\\/g, '/');
    fromDirectory = fromDirectory.replace(/\\/g, '/');

    if (this.isDirectory && !isDirectory) return false;

    let testPath = filePath;
    if (fromDirectory) {
      if (!filePath.startsWith(fromDirectory + '/')) {
        return false;
      }
      testPath = filePath.substring(fromDirectory.length + 1);
    }

    return this.isRooted
      ? this.matchPattern(testPath, this.pattern)
      : this.matchAnySubpath(testPath, this.pattern);
  }

  /**
   * Create an IgnorePattern from a line in .sourceignore file
   * Returns null if the line should be skipped (empty or comment)
   */
  public static fromLine(
    line: string,
    source: string = IgnorePattern.DEFAULT_SOURCE,
    lineNumber: number = 0
  ): IgnorePattern | null {
    line = IgnorePattern.trimTrailingWhitespace(line);

    if (line.length === 0 || line.startsWith(IgnorePattern.COMMENT_PREFIX)) return null;

    return new IgnorePattern(line, source, lineNumber);
  }

  /**
   * Remove trailing whitespace unless escaped
   */
  private static trimTrailingWhitespace(line: string): string {
    let backslashCount = 0;
    for (let i = line.length - 1; i >= 0; i--) {
      if (line[i] === '\\') backslashCount++;
      else break;
    }

    if (backslashCount % 2 === 1) return line;

    return line.trimEnd();
  }

  /**
   * Match a path against a pattern using glob rules
   */
  private matchPattern(path: string, pattern: string): boolean {
    if (!this.containsWildcard(pattern)) {
      const basename = path.split('/').pop() || '';
      const exactMatch = basename === pattern || path === pattern;

      if (this.isDirectory && path.startsWith(pattern + '/')) {
        return true;
      }

      return exactMatch;
    }

    // Use minimatch for glob pattern matching
    const options = {
      matchBase: true,
      dot: true, // Match files starting with .
      nobrace: false, // Enable brace expansion
      noglobstar: false, // Enable ** matching
      noext: false, // Enable extended glob patterns
      nocase: process.platform === 'win32', // Case insensitive on Windows
    };

    return minimatch(path, pattern, options);
  }

  /**
   * Check if pattern contains wildcards
   */
  private containsWildcard(pattern: string): boolean {
    return /[*?[\]{}]/.test(pattern) || pattern.includes('**');
  }

  /**
   * Unescape special characters in pattern
   */
  private unescapePattern(pattern: string): string {
    return pattern.replace(/\\(.)/g, '$1'); // Unescape any escaped character
  }

  /**
   * Match pattern against any subpath of the given path
   */
  private matchAnySubpath(testPath: string, pattern: string): boolean {
    const pathSegments = testPath.split('/');
    const joinPathSegments = (startIndex: number): string =>
      pathSegments.slice(startIndex).join('/');

    for (let startIndex = 0; startIndex < pathSegments.length; startIndex++) {
      const subPath = joinPathSegments(startIndex);
      if (this.matchPattern(subPath, pattern)) {
        return true;
      }
    }
    return false;
  }
}
