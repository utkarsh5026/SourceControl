import fs from 'fs-extra';
import { ConfigEntry, ConfigLevel } from './config-level';
import { ConfigParser } from './config-parser';
import { FileUtils } from '@/utils';
import { logger } from '@/utils/cli/logger';

/**
 * Handles reading and writing JSON configuration files
 */
export class ConfigStore {
  private path: string;
  private level: ConfigLevel;
  private entries: Map<string, ConfigEntry[]> = new Map();

  constructor(path: string, level: ConfigLevel) {
    this.path = path;
    this.level = level;
  }

  /**
   * Load configuration from JSON file
   */
  public async load(): Promise<void> {
    try {
      if (await FileUtils.exists(this.path)) {
        const content = await fs.readFile(this.path, 'utf8');
        const validation = ConfigParser.validate(content);

        if (!validation.valid) {
          logger.warn(`Warning: Invalid configuration in ${this.path}:`);
          validation.errors.forEach((error) => logger.warn(`  ${error}`));
          return;
        }

        this.entries = ConfigParser.parse(content, this.path, this.level);
      }
    } catch (error) {
      logger.warn(`Warning: Could not read config file ${this.path}:`, error);
    }
  }

  /**
   * Save configuration to JSON file
   */
  public async save(): Promise<void> {
    try {
      const content = ConfigParser.serialize(this.entries);
      await FileUtils.createFile(this.path, content);
    } catch (error) {
      logger.error(`Failed to save configuration to ${this.path}: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Get all entries for a key
   */
  public getEntries(key: string): ConfigEntry[] {
    return this.entries.get(key) || [];
  }

  /**
   * Export configuration as formatted JSON string
   */
  public toJSON(): string {
    return ConfigParser.formatForDisplay(this.entries);
  }

  /**
   * Add a configuration value (for multi-value keys)
   */
  public add(key: string, value: string): void {
    if (!this.entries.has(key)) {
      this.entries.set(key, []);
    }
    const entry = new ConfigEntry(key, value, this.level, this.path, 0);
    this.entries.get(key)!.push(entry);
  }

  /**
   * Import configuration from JSON string
   */
  public fromJSON(jsonContent: string): void {
    const validation = ConfigParser.validate(jsonContent);
    if (!validation.valid) {
      logger.error(`Invalid JSON configuration: ${validation.errors.join(', ')}`);
      return;
    }

    this.entries = ConfigParser.parse(jsonContent, this.path, this.level);
  }

  /**
   * Get all entries
   */
  public getAllEntries(): Map<string, ConfigEntry[]> {
    return new Map(this.entries);
  }

  /**
   * Remove all values for a key
   */
  public unset(key: string): void {
    this.entries.delete(key);
  }

  /**
   * Set a configuration value (replaces existing values)
   */
  public set(key: string, value: string): void {
    const entry = new ConfigEntry(key, value, this.level, this.path, 0);
    this.entries.set(key, [entry]);
  }
}
