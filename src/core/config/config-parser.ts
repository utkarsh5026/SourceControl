import { ConfigEntry, ConfigLevel } from './config-level';

/**
 * Configuration file structure in JSON format
 */
interface ConfigFileStructure {
  [section: string]: {
    [key: string]:
      | string
      | string[]
      | { [subsection: string]: { [key: string]: string | string[] } };
  };
}

/**
 * Parses JSON configuration files with support for nested sections and multi-values
 *
 * JSON Structure:
 * {
 *   "core": {
 *     "repositoryformatversion": "0",
 *     "filemode": "false",
 *     "bare": "false"
 *   },
 *   "user": {
 *     "name": "John Doe",
 *     "email": "john@example.com"
 *   },
 *   "remote": {
 *     "origin": {
 *       "url": "https://github.com/user/repo.git",
 *       "fetch": [
 *         "+refs/heads/*:refs/remotes/origin/*",
 *         "+refs/tags/*:refs/tags/*"
 *       ]
 *     }
 *   }
 * }
 */
export class ConfigParser {
  /**
   * Parse JSON configuration content into a map of entries
   */
  public static parse(
    content: string,
    source: string,
    level: ConfigLevel
  ): Map<string, ConfigEntry[]> {
    const result = new Map<string, ConfigEntry[]>();

    if (!content.trim()) return result;

    try {
      const configData: ConfigFileStructure = JSON.parse(content);
      this.parseSection(configData, result, source, level);
    } catch (error) {
      throw new Error(`Invalid JSON in configuration file ${source}: ${(error as Error).message}`);
    }

    return result;
  }

  /**
   * Serialize configuration entries to JSON format
   */
  public static serialize(entries: Map<string, ConfigEntry[]>): string {
    const configData: ConfigFileStructure = {};

    entries.forEach((entryList, fullKey) => {
      entryList.forEach((entry) => this.setNestedValue(configData, fullKey, entry.value));
    });

    return JSON.stringify(configData, null, 2);
  }

  /**
   * Validate JSON configuration structure
   */
  public static validate(content: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    try {
      const parsed = JSON.parse(content);

      if (typeof parsed !== 'object' || parsed === null) {
        errors.push('Configuration must be a JSON object');
      }

      this.validateSection(parsed, '', errors);
    } catch (error) {
      errors.push(`Invalid JSON: ${(error as Error).message}`);
    }
    return { valid: errors.length === 0, errors };
  }
  /**
   * Recursively parse sections and subsections
   */
  private static parseSection(
    data: any,
    result: Map<string, ConfigEntry[]>,
    source: string,
    level: ConfigLevel,
    prefix: string = ''
  ): void {
    Object.entries(data).forEach(([key, value]) => {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (typeof item !== 'string') return;
          this.addEntry(result, fullKey, item, source, level);
        });
        return;
      }

      if (typeof value === 'object' && value !== null) {
        this.parseSection(value, result, source, level, fullKey);
        return;
      }

      if (typeof value === 'string') {
        this.addEntry(result, fullKey, value, source, level);
        return;
      }
    });
  }

  /**
   * Add an entry to the result map
   */
  private static addEntry(
    result: Map<string, ConfigEntry[]>,
    key: string,
    value: string,
    source: string,
    level: ConfigLevel
  ): void {
    if (!result.has(key)) {
      result.set(key, []);
    }

    const entry = new ConfigEntry(key, value, level, source, 0);
    result.get(key)!.push(entry);
  }

  /**
   * Set a nested value in the configuration object
   */
  private static setNestedValue(obj: any, path: string, value: string): void {
    const parts = path.split('.');
    let current = obj;

    parts.forEach((part) => {
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
    });

    const finalKey = parts[parts.length - 1];

    if (finalKey && finalKey in current) {
      const existingValue = current[finalKey];
      if (Array.isArray(existingValue)) existingValue.push(value);
      else current[finalKey] = [existingValue, value];
    } else current[finalKey!] = value;
  }

  /**
   * Validate a configuration section
   */
  private static validateSection(obj: any, path: string, errors: string[]): void {
    Object.entries(obj).forEach(([key, value]) => {
      const fullPath = path ? `${path}.${key}` : key;

      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (typeof item !== 'string')
            errors.push(`Configuration array at '${fullPath}' must contain only strings`);
        });
        return;
      }

      if (typeof value === 'object' && value !== null) {
        this.validateSection(value, fullPath, errors);
        return;
      }

      if (typeof value !== 'string') {
        errors.push(`Configuration value at '${fullPath}' must be a string`);
        return;
      }
    });
  }
}
