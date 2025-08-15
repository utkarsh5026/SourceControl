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
   * Create a pretty-formatted JSON string for display
   */
  public static formatForDisplay(entries: Map<string, ConfigEntry[]>): string {
    const configData: ConfigFileStructure = {};

    entries.forEach((entryList, fullKey) => {
      const effectiveEntry = entryList[entryList.length - 1];
      if (effectiveEntry) this.setNestedValue(configData, fullKey, effectiveEntry.value);
    });

    return JSON.stringify(configData, null, 2);
  }

  /**
   * Recursively parse sections and subsections
   */
  private static parseSection(
    configData: ConfigFileStructure,
    result: Map<string, ConfigEntry[]>,
    source: string,
    level: ConfigLevel,
    keyPrefix: string = ''
  ): void {
    Object.entries(configData).forEach(([sectionKey, sectionValue]) => {
      const fullKey = this.buildFullKey(keyPrefix, sectionKey);
      this.processConfigValue(fullKey, sectionValue, result, source, level);
    });
  }

  /**
   * Build the full configuration key from prefix and section key
   */
  private static buildFullKey(prefix: string, key: string): string {
    return prefix ? `${prefix}.${key}` : key;
  }

  /**
   * Process a configuration value based on its type
   */
  private static processConfigValue(
    key: string,
    value: any,
    result: Map<string, ConfigEntry[]>,
    source: string,
    level: ConfigLevel
  ): void {
    if (Array.isArray(value)) {
      this.processArrayValue(key, value, result, source, level);
    } else if (this.isNestedObject(value)) {
      this.parseSection(value, result, source, level, key);
    } else if (typeof value === 'string') {
      this.addEntry(result, key, value, source, level);
    }
  }

  /**
   * Process array configuration values
   */
  private static processArrayValue(
    key: string,
    values: any[],
    result: Map<string, ConfigEntry[]>,
    source: string,
    level: ConfigLevel
  ): void {
    values.forEach((item) => {
      if (typeof item === 'string') {
        this.addEntry(result, key, item, source, level);
      }
    });
  }

  /**
   * Check if a value is a nested configuration object
   */
  private static isNestedObject(value: any): boolean {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  /**
   * Add a configuration entry to the result map
   */
  private static addEntry(
    entryMap: Map<string, ConfigEntry[]>,
    configKey: string,
    configValue: string,
    source: string,
    level: ConfigLevel
  ): void {
    this.ensureKeyExists(entryMap, configKey);
    
    const configEntry = this.createConfigEntry(configKey, configValue, level, source);
    entryMap.get(configKey)!.push(configEntry);
  }

  /**
   * Ensure a key exists in the entry map
   */
  private static ensureKeyExists(entryMap: Map<string, ConfigEntry[]>, key: string): void {
    if (!entryMap.has(key)) {
      entryMap.set(key, []);
    }
  }

  /**
   * Create a new configuration entry
   */
  private static createConfigEntry(
    key: string,
    value: string,
    level: ConfigLevel,
    source: string
  ): ConfigEntry {
    const DEFAULT_LINE_NUMBER = 0;
    return new ConfigEntry(key, value, level, source, DEFAULT_LINE_NUMBER);
  }

  /**
   * Set a nested value in the configuration object
   */
  private static setNestedValue(configObject: ConfigFileStructure, keyPath: string, value: string): void {
    const pathSegments = keyPath.split('.');
    const finalKey = pathSegments.pop()!;
    const targetObject = this.navigateToTargetObject(configObject, pathSegments);
    
    this.setValueInObject(targetObject, finalKey, value);
  }

  /**
   * Navigate through the object hierarchy to reach the target object
   */
  private static navigateToTargetObject(rootObject: any, pathSegments: string[]): any {
    let currentObject = rootObject;

    for (const segment of pathSegments) {
      if (!this.hasValidObjectProperty(currentObject, segment)) {
        currentObject[segment] = {};
      }
      currentObject = currentObject[segment];
    }

    return currentObject;
  }

  /**
   * Check if an object has a valid property for navigation
   */
  private static hasValidObjectProperty(obj: any, propertyKey: string): boolean {
    return propertyKey in obj && 
           typeof obj[propertyKey] === 'object' && 
           !Array.isArray(obj[propertyKey]);
  }

  /**
   * Set a value in an object, handling existing values appropriately
   */
  private static setValueInObject(targetObject: any, key: string, newValue: string): void {
    if (key in targetObject) {
      const existingValue = targetObject[key];
      targetObject[key] = Array.isArray(existingValue) 
        ? [...existingValue, newValue]
        : [existingValue, newValue];
    } else {
      targetObject[key] = newValue;
    }
  }

  /**
   * Validate a configuration section
   */
  private static validateSection(configSection: any, currentPath: string, errors: string[]): void {
    Object.entries(configSection).forEach(([key, value]) => {
      const valuePath = this.buildFullKey(currentPath, key);
      this.validateConfigValue(valuePath, value, errors);
    });
  }

  /**
   * Validate a single configuration value
   */
  private static validateConfigValue(path: string, value: any, errors: string[]): void {
    if (Array.isArray(value)) {
      this.validateArrayValue(path, value, errors);
    } else if (this.isNestedObject(value)) {
      this.validateSection(value, path, errors);
    } else if (typeof value !== 'string') {
      errors.push(`Configuration value at '${path}' must be a string`);
    }
  }

  /**
   * Validate array configuration values
   */
  private static validateArrayValue(path: string, values: any[], errors: string[]): void {
    values.forEach((item) => {
      if (typeof item !== 'string') {
        errors.push(`Configuration array at '${path}' must contain only strings`);
      }
    });
  }
}
