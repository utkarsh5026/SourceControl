/**
 * Configuration levels in order of precedence (highest to lowest)
 */
export enum ConfigLevel {
  COMMAND_LINE = 'command-line', // --config.user.name="John"
  REPOSITORY = 'repository', // .source/config
  USER = 'user', // ~/.config/sourcecontrol/config
  SYSTEM = 'system', // /etc/sourcecontrol/config
  BUILTIN = 'builtin', // Hardcoded defaults
}

/**
 * Represents a single configuration entry with its value and metadata
 */
export class ConfigEntry {
  readonly key: string;
  readonly value: string;
  readonly level: ConfigLevel;
  readonly source: string;
  readonly lineNumber: number;

  constructor(key: string, value: string, level: ConfigLevel, source: string, lineNumber: number) {
    this.key = key;
    this.value = value;
    this.level = level;
    this.source = source;
    this.lineNumber = lineNumber;
  }

  /**
   * Convert string value to appropriate type
   */
  asString(): string {
    return this.value;
  }

  /**
   * Convert string value to number
   */
  asNumber(): number {
    const num = Number(this.value);
    if (isNaN(num)) {
      throw new Error(`Cannot convert "${this.value}" to number`);
    }
    return num;
  }

  /**
   * Convert string value to boolean
   */
  asBoolean(): boolean {
    const lower = this.value.toLowerCase();
    if (lower === 'true' || lower === 'yes' || lower === '1') return true;
    if (lower === 'false' || lower === 'no' || lower === '0') return false;
    throw new Error(`Cannot convert "${this.value}" to boolean`);
  }

  /**
   * Convert string value to list of strings
   */
  asList(): string[] {
    return this.value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
}
