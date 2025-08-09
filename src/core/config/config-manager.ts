import path from 'path';
import os from 'os';
import { Repository } from '../repo';
import { ConfigEntry, ConfigLevel } from './config-level';
import { ConfigStore } from './config-store';
import { ConfigParser } from './config-parser';

/**
 * Central configuration manager that handles the hierarchy of JSON config files
 */
export class GitConfigManager {
  private stores: Map<ConfigLevel, ConfigStore> = new Map();
  private commandLineConfig: Map<string, string> = new Map();
  private builtinDefaults: Map<string, string> = new Map();

  public static readonly WINDOWS_PROGRAM_FILES_PATH = path.join(
    'C',
    'ProgramData',
    'SourceControl'
  );
  public static readonly USER_CONFIG_PATH = path.join(os.homedir(), '.config', 'sourcecontrol');
  public static readonly UNIX_PROGRAM_FILES_PATH = path.join('/', 'etc', 'sourcecontrol');
  public static readonly CONFIG_FILE_NAME = 'config.json';

  constructor(repository?: Repository) {
    this.initializeStores(repository);
    this.loadBuiltinDefaults();
  }

  /**
   * Load all configuration files
   */
  public async load(): Promise<void> {
    await Promise.all(Array.from(this.stores.values()).map((store) => store.load()));
  }

  /**
   * Set command-line configuration values
   */
  public setCommandLine(key: string, value: string): void {
    this.commandLineConfig.set(key, value);
  }

  /**
   * Get a configuration value, respecting hierarchy
   */
  public get(key: string): ConfigEntry | null {
    if (this.commandLineConfig.has(key)) {
      return new ConfigEntry(
        key,
        this.commandLineConfig.get(key)!,
        ConfigLevel.COMMAND_LINE,
        'command-line',
        0
      );
    }

    for (const level of [ConfigLevel.REPOSITORY, ConfigLevel.USER, ConfigLevel.SYSTEM]) {
      const store = this.stores.get(level);
      if (!store) continue;

      const entries = store.getEntries(key);
      if (entries.length > 0) return entries[entries.length - 1]!; // Last value wins
    }

    if (this.builtinDefaults.has(key)) {
      return new ConfigEntry(
        key,
        this.builtinDefaults.get(key)!,
        ConfigLevel.BUILTIN,
        'builtin',
        0
      );
    }

    return null;
  }

  /**
   * Set a configuration value at a specific level
   */
  public async set(
    key: string,
    value: string,
    level: ConfigLevel = ConfigLevel.USER
  ): Promise<void> {
    if (level === ConfigLevel.COMMAND_LINE) {
      this.setCommandLine(key, value);
      return;
    }

    const store = this.stores.get(level);
    if (!store) {
      throw new Error(`Cannot set config at level: ${level}`);
    }

    store.set(key, value);
    await store.save();
  }

  /**
   * Add a value to a multi-value configuration key
   */
  public async add(
    key: string,
    value: string,
    level: ConfigLevel = ConfigLevel.USER
  ): Promise<void> {
    const store = this.stores.get(level);
    if (!store) {
      throw new Error(`Cannot add config at level: ${level}`);
    }

    store.add(key, value);
    await store.save();
  }

  /**
   * Unset a configuration key at a specific level
   */
  public async unset(key: string, level: ConfigLevel = ConfigLevel.USER): Promise<void> {
    const store = this.stores.get(level);
    if (!store) {
      throw new Error(`Cannot unset config at level: ${level}`);
    }

    store.unset(key);
    await store.save();
  }

  /**
   * List all configuration entries
   */
  public list(): ConfigEntry[] {
    const allEntries: ConfigEntry[] = [];
    const allKeys = new Set<string>();

    this.commandLineConfig.forEach((_, key) => {
      allKeys.add(key);
    });

    this.stores.forEach((store) => {
      store.getAllEntries().forEach((_, key) => allKeys.add(key));
    });

    this.builtinDefaults.forEach((_, key) => allKeys.add(key));

    allKeys.forEach((key) => {
      const entry = this.get(key);
      if (entry) allEntries.push(entry);
    });

    return allEntries.sort((a, b) => a.key.localeCompare(b.key));
  }

  /**
   * Export configuration as JSON string
   */
  public async exportJSON(level?: ConfigLevel): Promise<string> {
    if (level) {
      const store = this.stores.get(level);
      return store ? store.toJSON() : '{}';
    } else {
      const entries = this.list();
      const entriesMap = new Map<string, ConfigEntry[]>();

      entries.forEach((entry) => {
        if (!entriesMap.has(entry.key)) entriesMap.set(entry.key, []);
        entriesMap.get(entry.key)!.push(entry);
      });

      return ConfigParser.serialize(entriesMap);
    }
  }

  /**
   * Initialize configuration stores for different levels with JSON file extensions
   */
  private initializeStores(repository?: Repository): void {
    const systemPath =
      process.platform === 'win32'
        ? path.join(GitConfigManager.WINDOWS_PROGRAM_FILES_PATH, GitConfigManager.CONFIG_FILE_NAME)
        : path.join(GitConfigManager.UNIX_PROGRAM_FILES_PATH, GitConfigManager.CONFIG_FILE_NAME);
    this.stores.set(ConfigLevel.SYSTEM, new ConfigStore(systemPath, ConfigLevel.SYSTEM));

    const userPath = path.join(
      GitConfigManager.USER_CONFIG_PATH,
      GitConfigManager.CONFIG_FILE_NAME
    );
    this.stores.set(ConfigLevel.USER, new ConfigStore(userPath, ConfigLevel.USER));

    if (repository) {
      const repoPath = path.join(
        repository.gitDirectory().fullpath(),
        GitConfigManager.CONFIG_FILE_NAME
      );
      this.stores.set(ConfigLevel.REPOSITORY, new ConfigStore(repoPath, ConfigLevel.REPOSITORY));
    }
  }

  /**
   * Load built-in default values
   */
  private loadBuiltinDefaults(): void {
    this.builtinDefaults.set('core.repositoryformatversion', '0');
    this.builtinDefaults.set('core.filemode', 'true');
    this.builtinDefaults.set('core.bare', 'false');
    this.builtinDefaults.set('core.logallrefupdates', 'true');
    this.builtinDefaults.set('core.ignorecase', process.platform === 'win32' ? 'true' : 'false');
    this.builtinDefaults.set('core.autocrlf', process.platform === 'win32' ? 'true' : 'input');
    this.builtinDefaults.set('init.defaultbranch', 'main');
    this.builtinDefaults.set('color.ui', 'auto');
    this.builtinDefaults.set('diff.renames', 'true');
    this.builtinDefaults.set('pull.rebase', 'false');
    this.builtinDefaults.set('push.default', 'simple');
  }
}
