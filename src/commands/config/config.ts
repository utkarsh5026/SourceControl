import { Command } from 'commander';
import { logger } from '@/utils';
import { getRepo } from '@/utils/helpers';
import {
  ConfigHandler,
  createConfigManager,
  ConfigGetOptions,
  ConfigSetOptions,
  ConfigListOptions,
  ConfigUnsetOptions,
  ConfigAddOptions,
} from './config.handler';
import {
  displayConfigGetResult,
  displayConfigSetResult,
  displayConfigUnsetResult,
  displayConfigAddResult,
  displayConfigList,
  displayConfigHelp,
} from './config.display';
import { Repository } from '@/core/repo';

export const configCommand = new Command('config').description(
  '🔧 Get and set repository or global options'
);

configCommand
  .command('get')
  .description('Get configuration value')
  .argument('<key>', 'Configuration key to get')
  .option('--all', 'Get all values for multi-value keys')
  .option('--show-origin', 'Show the origin of configuration values')
  .action(async (key: string, options: ConfigGetOptions) => {
    try {
      // Try to get repository context, but don't require it
      let repository;
      try {
        repository = await getRepo();
      } catch {
        // No repository context, continue with global config only
      }

      const config = await createConfigManager(repository);
      const handler = new ConfigHandler(config);

      const entries = await handler.get(key, options);
      displayConfigGetResult(key, entries, options.showOrigin, options.all);

      if (entries.length === 0) {
        process.exit(1);
      }
    } catch (error) {
      logger.error(`Failed to get configuration: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Set configuration value
configCommand
  .command('set')
  .description('Set configuration value')
  .argument('<key>', 'Configuration key to set')
  .argument('<value>', 'Configuration value')
  .option('--level <level>', 'Configuration level (system|user|repository)', 'user')
  .action(async (key: string, value: string, options: ConfigSetOptions) => {
    try {
      let repository;
      if (options.level === 'repository' || options.level === 'local') {
        repository = await getRepo();
      } else {
        try {
          repository = await getRepo();
        } catch {
          // No repository context needed for user/system config
        }
      }

      const config = await createConfigManager(repository);
      const handler = new ConfigHandler(config);

      await handler.set(key, value, options);
      displayConfigSetResult(key, value, handler['parseLevel'](options.level));
    } catch (error) {
      logger.error(`Failed to set configuration: ${(error as Error).message}`);
      process.exit(1);
    }
  });

configCommand
  .command('add')
  .description('Add configuration value')
  .argument('<key>', 'Configuration key to add to')
  .argument('<value>', 'Configuration value to add')
  .option('--level <level>', 'Configuration level (system|user|repository)', 'user')
  .action(async (key: string, value: string, options: ConfigAddOptions) => {
    try {
      let repository;
      if (options.level === 'repository' || options.level === 'local') {
        repository = await getRepo();
      } else {
        try {
          repository = await getRepo();
        } catch {}
      }

      const config = await createConfigManager(repository);
      const handler = new ConfigHandler(config);

      await handler.add(key, value, options);
      displayConfigAddResult(key, value, handler['parseLevel'](options.level));
    } catch (error) {
      logger.error(`Failed to add configuration: ${(error as Error).message}`);
      process.exit(1);
    }
  });

configCommand
  .command('unset')
  .description('Unset configuration key')
  .argument('<key>', 'Configuration key to unset')
  .option('--level <level>', 'Configuration level (system|user|repository)', 'user')
  .action(async (key: string, options: ConfigUnsetOptions) => {
    try {
      let repository;
      if (options.level === 'repository' || options.level === 'local') {
        repository = await getRepo();
      } else {
        try {
          repository = await getRepo();
        } catch {}
      }

      const config = await createConfigManager(repository);
      const handler = new ConfigHandler(config);

      await handler.unset(key, options);
      displayConfigUnsetResult(key, handler['parseLevel'](options.level));
    } catch (error) {
      logger.error(`Failed to unset configuration: ${(error as Error).message}`);
      process.exit(1);
    }
  });

configCommand
  .command('list')
  .alias('l')
  .description('List all configuration')
  .option('--show-origin', 'Show the origin of configuration values')
  .option('--level <level>', 'Show only configuration from specific level')
  .action(async (options: ConfigListOptions) => {
    try {
      let repository: Repository | undefined;
      try {
        repository = await getRepo();
      } catch {}

      const config = await createConfigManager(repository);
      const handler = new ConfigHandler(config);

      const entries = await handler.list(options);
      const title = options.level
        ? `🔧 Configuration (${options.level} level)`
        : '🔧 Configuration';

      displayConfigList(entries, options.showOrigin, title);
    } catch (error) {
      logger.error(`Failed to list configuration: ${(error as Error).message}`);
      process.exit(1);
    }
  });

configCommand
  .command('edit')
  .description('Edit configuration file')
  .option('--level <level>', 'Configuration level to edit (system|user|repository)', 'user')
  .action(async (options: { level?: string }) => {
    try {
      let repository;
      if (options.level === 'repository' || options.level === 'local') {
        repository = await getRepo();
      } else {
        try {
          repository = await getRepo();
        } catch {
          // No repository context needed for user/system config
        }
      }

      const config = await createConfigManager(repository);
      const handler = new ConfigHandler(config);

      const configPath = handler.getConfigPath(options.level);
      console.log(`Configuration file: ${configPath}`);
      console.log(`Use your preferred editor to modify the configuration file.`);
      console.log(`Example: code "${configPath}"`);
    } catch (error) {
      logger.error(`Failed to edit configuration: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Help command
configCommand
  .command('help')
  .description('Show configuration help and examples')
  .action(() => {
    displayConfigHelp();
  });

// Add validate subcommand for checking user config
configCommand
  .command('validate')
  .description('Validate configuration for common operations')
  .action(async () => {
    try {
      let repository;
      try {
        repository = await getRepo();
      } catch {
        // No repository context, continue with global config only
      }

      const config = await createConfigManager(repository);
      const handler = new ConfigHandler(config);

      const validation = handler.validateUserConfig();

      if (validation.valid) {
        logger.info('✅ Configuration validation passed');
      } else {
        logger.error('❌ Configuration validation failed:');
        validation.errors.forEach((error) => {
          logger.error(`  ${error}`);
        });
        process.exit(1);
      }
    } catch (error) {
      logger.error(`Failed to validate configuration: ${(error as Error).message}`);
      process.exit(1);
    }
  });
