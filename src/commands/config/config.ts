import { Command } from 'commander';
import { logger } from '@/utils';
import fs from 'fs-extra';
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
  displayConfigExport,
  displayConfigImport,
} from './config.display';
import { Repository } from '@/core/repo';
import { ConfigParser } from '@/core/config/config-parser';

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

configCommand
  .command('export')
  .description('Export configuration as JSON')
  .option('--level <level>', 'Export specific level only (system|user|repository)')
  .option('--output <file>', 'Write to file instead of stdout')
  .action(async (options: { level?: string; output?: string }) => {
    try {
      let repository;
      try {
        repository = await getRepo();
      } catch {}

      const config = await createConfigManager(repository);
      const handler = new ConfigHandler(config);

      let jsonContent: string;

      if (options.level) {
        const entries = await handler.list({ level: options.level });
        const entriesMap = new Map<string, any[]>();

        entries.forEach((entry) => {
          if (!entriesMap.has(entry.key)) entriesMap.set(entry.key, []);
          entriesMap.get(entry.key)!.push(entry);
        });
        jsonContent = ConfigParser.serialize(entriesMap);
      } else {
        const entries = await handler.list({});
        const entriesMap = new Map<string, any[]>();

        entries.forEach((entry) => {
          if (!entriesMap.has(entry.key)) {
            entriesMap.set(entry.key, []);
          }
          entriesMap.get(entry.key)!.push(entry);
        });
        jsonContent = ConfigParser.serialize(entriesMap);
      }

      if (options.output) {
        await fs.writeFile(options.output, jsonContent, 'utf8');
        logger.info(`Configuration exported to ${options.output}`);
      } else {
        displayConfigExport(jsonContent, options.level);
      }
    } catch (error) {
      logger.error(`Failed to export configuration: ${(error as Error).message}`);
      process.exit(1);
    }
  });

configCommand
  .command('import')
  .description('Import configuration from JSON file')
  .argument('<file>', 'JSON file to import')
  .option('--level <level>', 'Import to specific level (user|repository)', 'user')
  .option('--merge', 'Merge with existing configuration (default: replace)')
  .action(async (file: string, options: { level?: string; merge?: boolean }) => {
    try {
      let repository;
      if (options.level === 'repository') {
        repository = await getRepo();
      } else {
        try {
          repository = await getRepo();
        } catch {
          // No repository context needed for user config
        }
      }

      const config = await createConfigManager(repository);
      const handler = new ConfigHandler(config);

      // Read and validate JSON file
      const jsonContent = await fs.readFile(file, 'utf8');

      const validation = ConfigParser.validate(jsonContent);
      if (!validation.valid) {
        logger.error('Invalid JSON configuration file:');
        validation.errors.forEach((error) => logger.error(`  ${error}`));
        process.exit(1);
      }

      // Parse and import configuration
      const level = handler['parseLevel'](options.level);
      const entries = ConfigParser.parse(jsonContent, file, level);

      if (!options.merge) {
        // Clear existing configuration at this level first
        const existingKeys = (config as any).stores.get(level)?.keys() || [];
        for (const key of existingKeys) {
          await handler.unset(key, { level: options.level ?? '' });
        }
      }

      for (const [key, entryList] of entries) {
        for (const entry of entryList) {
          await handler.set(key, entry.value, { level: options.level ?? '' });
        }
      }

      displayConfigImport(file, level);
    } catch (error) {
      logger.error(`Failed to import configuration: ${(error as Error).message}`);
      process.exit(1);
    }
  });

configCommand
  .command('template')
  .description('Generate configuration templates')
  .option('--type <type>', 'Template type (user|repository|developer)', 'user')
  .option('--output <file>', 'Write to file instead of stdout')
  .action(async (options: { type?: string; output?: string }) => {
    try {
      let template: any = {};

      switch (options.type) {
        case 'user':
          template = {
            user: {
              name: 'Your Name',
              email: 'your@email.com',
            },
            init: {
              defaultbranch: 'main',
            },
            color: {
              ui: 'auto',
            },
          };
          break;

        case 'repository':
          template = {
            core: {
              repositoryformatversion: '0',
              filemode: 'false',
              bare: 'false',
            },
            user: {
              name: 'Project Name',
              email: 'project@company.com',
            },
          };
          break;

        case 'developer':
          template = {
            user: {
              name: 'Developer Name',
              email: 'dev@company.com',
            },
            core: {
              editor: 'code --wait',
              autocrlf: 'input',
            },
            init: {
              defaultbranch: 'main',
            },
            color: {
              ui: 'auto',
            },
            diff: {
              renames: 'true',
            },
            push: {
              default: 'simple',
            },
          };
          break;

        default:
          throw new Error(`Unknown template type: ${options.type}`);
      }

      const jsonContent = JSON.stringify(template, null, 2);

      if (options.output) {
        await fs.writeFile(options.output, jsonContent, 'utf8');
        logger.info(`Template written to ${options.output}`);
      } else {
        console.log(`# ${options.type} configuration template`);
        console.log(jsonContent);
      }
    } catch (error) {
      logger.error(`Failed to generate template: ${(error as Error).message}`);
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
