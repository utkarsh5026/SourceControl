import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { logger } from './logger';

export interface Config {
  defaultBranch: string;
  editor: string;
  user: {
    name: string;
    email: string;
  };
  remote: {
    origin: string;
  };
  ui: {
    colorOutput: boolean;
    showProgress: boolean;
  };
}

export class ConfigManager {
  private static instance: ConfigManager;
  private static configPath: string;
  private config: Partial<Config> = {};

  private constructor() {
    this.loadConfig();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  static setConfigPath(customPath: string): void {
    ConfigManager.configPath = customPath;
    // Reset instance to reload config from new path
    ConfigManager.instance = new ConfigManager();
  }

  private getConfigPath(): string {
    if (ConfigManager.configPath) {
      return ConfigManager.configPath;
    }

    // Default config locations
    const configDir = path.join(os.homedir(), '.sourcecontrol');
    return path.join(configDir, 'config.json');
  }

  private getDefaultConfig(): Config {
    return {
      defaultBranch: 'main',
      editor: process.env['EDITOR'] || 'nano',
      user: {
        name: '',
        email: '',
      },
      remote: {
        origin: '',
      },
      ui: {
        colorOutput: true,
        showProgress: true,
      },
    };
  }

  private async loadConfig(): Promise<void> {
    try {
      const configPath = this.getConfigPath();

      if (await fs.pathExists(configPath)) {
        const configData = await fs.readJson(configPath);
        this.config = { ...this.getDefaultConfig(), ...configData };
      } else {
        this.config = this.getDefaultConfig();
        await this.saveConfig();
      }
    } catch (error) {
      logger.warn('Failed to load config, using defaults');
      this.config = this.getDefaultConfig();
    }
  }

  async saveConfig(): Promise<void> {
    try {
      const configPath = this.getConfigPath();
      await fs.ensureDir(path.dirname(configPath));
      await fs.writeJson(configPath, this.config, { spaces: 2 });
    } catch (error) {
      logger.error('Failed to save config:', error);
    }
  }

  get<K extends keyof Config>(key: K): Config[K] {
    return this.config[key] as Config[K];
  }

  set<K extends keyof Config>(key: K, value: Config[K]): void {
    this.config[key] = value;
  }

  getAll(): Partial<Config> {
    return { ...this.config };
  }

  reset(): void {
    this.config = this.getDefaultConfig();
  }
}
