import { minimatch } from 'minimatch';

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

    this.isNegation = pattern.startsWith('!');
    if (this.isNegation) pattern = pattern.substring(1);

    this.isDirectory = pattern.endsWith('/');
    if (this.isDirectory) pattern = pattern.slice(0, -1);

    this.isRooted = pattern.startsWith('/');
    if (this.isRooted) pattern = pattern.substring(1);

    this.pattern = this.unescapePattern(pattern);
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

    if (this.isRooted) {
      return this.matchPattern(testPath, this.pattern);
    }

    const parts = testPath.split('/');
    for (let i = 0; i < parts.length; i++) {
      const subPath = parts.slice(i).join('/');
      if (this.matchPattern(subPath, this.pattern)) {
        return true;
      }
    }

    return false;
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
    // Handle special case: pattern with no wildcards
    if (!this.containsWildcard(pattern)) {
      // For literal patterns, match basename or exact path
      const basename = path.split('/').pop() || '';
      return basename === pattern || path === pattern;
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
}
