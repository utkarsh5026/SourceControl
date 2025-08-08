import { IgnorePattern } from './ignore-pattern';

/**
 * Collection of ignore patterns with efficient matching
 */
export class IgnorePatternSet {
  private patterns: IgnorePattern[] = [];
  private negationPatterns: IgnorePattern[] = [];

  public add(pattern: IgnorePattern): void {
    if (pattern.isNegation) this.negationPatterns.push(pattern);
    else this.patterns.push(pattern);
  }

  public addPatternsFromText(text: string, source: string = IgnorePattern.DEFAULT_SOURCE): void {
    const lines = text.split('\n');

    lines.forEach((line, index) => {
      const pattern = IgnorePattern.fromLine(line, source, index + 1);
      if (pattern) this.add(pattern);
    });
  }

  public isIgnored(
    filePath: string,
    isDirectory: boolean = false,
    fromDirectory: string = ''
  ): boolean {
    const checkIgnored = () => {
      for (const pattern of this.patterns) {
        if (pattern.matches(filePath, isDirectory, fromDirectory)) return true;
      }
      return false;
    };

    const checkNegation = () => {
      for (const pattern of this.negationPatterns) {
        if (pattern.matches(filePath, isDirectory, fromDirectory)) return false;
      }
      return true;
    };

    return checkIgnored() && checkNegation();
  }

  clear(): void {
    this.patterns = [];
    this.negationPatterns = [];
  }

  public get ignoredPatterns(): IgnorePattern[] {
    return this.patterns;
  }

  public get unignoredPatterns(): IgnorePattern[] {
    return this.negationPatterns;
  }
}
