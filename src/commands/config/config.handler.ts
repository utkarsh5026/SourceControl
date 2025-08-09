import { GitConfigManager, ConfigLevel, ConfigEntry, TypedConfig } from '@/core/config';
import { Repository } from '@/core/repo';

export interface ConfigGetOptions {
  all?: boolean;
  showOrigin?: boolean;
}

export interface ConfigSetOptions {
  level?: string;
}

export interface ConfigListOptions {
  showOrigin?: boolean;
  level?: string;
}

export interface ConfigUnsetOptions {
  level?: string;
}

export interface ConfigAddOptions {
  level?: string;
}

export class ConfigHandler {
  private config: GitConfigManager;

  constructor(config: GitConfigManager) {
    this.config = config;
  }

  /**
   * Get configuration value(s)
   */
  async get(key: string, options: ConfigGetOptions): Promise<ConfigEntry[]> {
    if (options.all) {
      return this.config.getAll(key);
    } else {
      const entry = this.config.get(key);
      return entry ? [entry] : [];
    }
  }

  /**
   * Set configuration value
   */
  async set(key: string, value: string, options: ConfigSetOptions): Promise<void> {
    const level = this.parseLevel(options.level);
    await this.config.set(key, value, level);
  }

  /**
   * Add configuration value (for multi-value keys)
   */
  async add(key: string, value: string, options: ConfigAddOptions): Promise<void> {
    const level = this.parseLevel(options.level);
    await this.config.add(key, value, level);
  }

  /**
   * Unset configuration key
   */
  async unset(key: string, options: ConfigUnsetOptions): Promise<void> {
    const level = this.parseLevel(options.level);
    await this.config.unset(key, level);
  }

  /**
   * List all configuration
   */
  async list(options: ConfigListOptions): Promise<ConfigEntry[]> {
    const allEntries = this.config.list();

    if (options.level) {
      const level = this.parseLevel(options.level);
      return allEntries.filter((entry) => entry.level === level);
    }

    return allEntries;
  }

  /**
   * Get configuration file path for editing
   */
  getConfigPath(level?: string): string {
    const configLevel = this.parseLevel(level || 'user');

    // Access the internal store to get the file path
    const stores = (this.config as any).stores as Map<ConfigLevel, any>;
    const store = stores.get(configLevel);

    if (!store) {
      throw new Error(`No configuration store available for level: ${configLevel}`);
    }

    return (store as any).path;
  }

  /**
   * Validate configuration for common operations
   */
  validateUserConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const typedConfig = this.getTypedConfig();

    if (!typedConfig.userName) {
      errors.push('user.name is not set. Use: sourcecontrol config set user.name "Your Name"');
    }

    if (!typedConfig.userEmail) {
      errors.push(
        'user.email is not set. Use: sourcecontrol config set user.email "your@email.com"'
      );
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get typed configuration for common access patterns
   */
  getTypedConfig() {
    return new TypedConfig(this.config);
  }

  /**
   * Parse configuration level from string
   */
  private parseLevel(levelStr?: string): ConfigLevel {
    if (!levelStr) return ConfigLevel.USER;

    switch (levelStr.toLowerCase()) {
      case 'system':
        return ConfigLevel.SYSTEM;
      case 'user':
      case 'global':
        return ConfigLevel.USER;
      case 'repository':
      case 'local':
        return ConfigLevel.REPOSITORY;
      default:
        throw new Error(
          `Invalid configuration level: ${levelStr}. Valid levels: system, user, repository`
        );
    }
  }
}

/**
 * Create configuration manager with repository context if available
 */
export async function createConfigManager(repository?: Repository): Promise<GitConfigManager> {
  const config = new GitConfigManager(repository);
  await config.load();
  return config;
}

/**
 * Parse command-line config overrides
 * Format: --config.user.name="John Doe" --config.core.editor="vim"
 */
export function parseConfigOverrides(args: string[]): Map<string, string> {
  const overrides = new Map<string, string>();

  args.forEach((arg) => {
    if (arg.startsWith('--config.')) {
      const configPart = arg.substring(9); // Remove '--config.'
      const equalIndex = configPart.indexOf('=');

      if (equalIndex > 0) {
        const key = configPart.substring(0, equalIndex);
        const value = configPart.substring(equalIndex + 1).replace(/^["']|["']$/g, '');
        overrides.set(key, value);
      }
    }
  });

  return overrides;
}

/**
 * Apply command-line config overrides to config manager
 */
export function applyConfigOverrides(
  config: GitConfigManager,
  overrides: Map<string, string>
): void {
  for (const [key, value] of overrides) {
    config.setCommandLine(key, value);
  }
}
