import chalk from 'chalk';
import { display } from '@/utils';
import { ConfigEntry, ConfigLevel } from '@/core/config';

export const displayConfigEntry = (entry: ConfigEntry, showOrigin: boolean = false): void => {
  const keyColor = chalk.blue(entry.key);
  const valueColor = chalk.green(entry.value);

  if (showOrigin) {
    const levelColor = formatLevelColor(entry.level);
    const sourceColor = chalk.gray(entry.source);
    console.log(
      `${keyColor} = ${valueColor} ${chalk.gray('(')}${levelColor}${chalk.gray(': ')}${sourceColor}${chalk.gray(')')}`
    );
  } else {
    console.log(`${keyColor} = ${valueColor}`);
  }
};

export const displayConfigList = (
  entries: ConfigEntry[],
  showOrigin: boolean = false,
  title?: string
): void => {
  if (entries.length === 0) {
    display.info('No configuration found', title || '🔧 Configuration');
    return;
  }

  const headerTitle = title || '🔧 Configuration';

  if (showOrigin) {
    const details = [
      `${chalk.gray('Showing:')} ${chalk.white('all configuration with origins')}`,
      `${chalk.gray('Format:')} ${chalk.blue('key')} = ${chalk.green('value')} ${chalk.gray('(level: source)')}`,
      `${chalk.gray('Count:')} ${chalk.yellow(entries.length.toString())} entries`,
    ].join('\n');
    display.info(details, headerTitle);
  } else {
    const details = [
      `${chalk.gray('Showing:')} ${chalk.white('effective configuration values')}`,
      `${chalk.gray('Format:')} ${chalk.blue('key')} = ${chalk.green('value')}`,
      `${chalk.gray('Count:')} ${chalk.yellow(entries.length.toString())} entries`,
    ].join('\n');
    display.info(details, headerTitle);
  }

  console.log(); // Empty line before entries

  // Group entries by section for better readability
  const sections = groupEntriesBySection(entries);

  for (const [sectionName, sectionEntries] of sections) {
    console.log(chalk.bold.magenta(`[${sectionName}]`));

    for (const entry of sectionEntries) {
      const keyPart = entry.key.substring(sectionName.length + 1); // Remove section prefix
      const paddedKey = `  ${keyPart}`.padEnd(24);
      const valueColor = chalk.green(entry.value);

      if (showOrigin) {
        const levelColor = formatLevelColor(entry.level);
        const sourceColor = chalk.gray(entry.source);
        console.log(
          `${chalk.blue(paddedKey)} = ${valueColor} ${chalk.gray('(')}${levelColor}${chalk.gray(': ')}${sourceColor}${chalk.gray(')')}`
        );
      } else {
        console.log(`${chalk.blue(paddedKey)} = ${valueColor}`);
      }
    }
    console.log(); // Empty line between sections
  }
};

export const displayConfigSetResult = (key: string, value: string, level: ConfigLevel): void => {
  const title = chalk.bold.green('✅ Configuration Updated');
  const levelColor = formatLevelColor(level);

  const details = [
    `${chalk.gray('Key:')} ${chalk.blue(key)}`,
    `${chalk.gray('Value:')} ${chalk.green(value)}`,
    `${chalk.gray('Level:')} ${levelColor}`,
    `${chalk.gray('Status:')} ${chalk.green('Successfully set')}`,
  ].join('\n');

  display.success(details, title);
};

export const displayConfigUnsetResult = (key: string, level: ConfigLevel): void => {
  const title = chalk.bold.green('🗑️ Configuration Removed');
  const levelColor = formatLevelColor(level);

  const details = [
    `${chalk.gray('Key:')} ${chalk.blue(key)}`,
    `${chalk.gray('Level:')} ${levelColor}`,
    `${chalk.gray('Status:')} ${chalk.green('Successfully removed')}`,
  ].join('\n');

  display.success(details, title);
};

export const displayConfigGetResult = (
  key: string,
  entries: ConfigEntry[],
  showOrigin: boolean = false,
  showAll: boolean = false
): void => {
  if (entries.length === 0) {
    const title = chalk.bold.red('❌ Configuration Not Found');
    const details = [
      `${chalk.gray('Key:')} ${chalk.blue(key)}`,
      `${chalk.gray('Status:')} ${chalk.red('Not found in any configuration level')}`,
      `${chalk.gray('Suggestion:')} Use ${chalk.cyan(`sourcecontrol config set ${key} <value>`)} to set it`,
    ].join('\n');

    display.error(details, title);
    return;
  }

  if (showAll) {
    const title = `🔍 All Values for ${chalk.blue(key)}`;
    const details = [
      `${chalk.gray('Key:')} ${chalk.blue(key)}`,
      `${chalk.gray('Found:')} ${chalk.yellow(entries.length.toString())} value(s)`,
      `${chalk.gray('Order:')} ${chalk.white('highest to lowest precedence')}`,
    ].join('\n');

    display.info(details, title);
    console.log();

    entries.forEach((entry, index) => {
      const prefix = index === 0 ? '→' : ' ';
      const levelColor = formatLevelColor(entry.level);
      const valueColor = index === 0 ? chalk.green.bold(entry.value) : chalk.green(entry.value);

      if (showOrigin) {
        const sourceColor = chalk.gray(entry.source);
        console.log(
          `${prefix} ${valueColor} ${chalk.gray('(')}${levelColor}${chalk.gray(': ')}${sourceColor}${chalk.gray(')')}`
        );
      } else {
        console.log(`${prefix} ${valueColor} ${chalk.gray('(')}${levelColor}${chalk.gray(')')}`);
      }
    });
  } else {
    // Show only the effective value
    const effectiveEntry = entries[0]; // First entry has highest precedence
    const title = `🎯 Configuration Value`;

    const details = [
      `${chalk.gray('Key:')} ${chalk.blue(key)}`,
      `${chalk.gray('Value:')} ${chalk.green.bold(effectiveEntry?.value)}`,
      ...(showOrigin
        ? [
            `${chalk.gray('Level:')} ${formatLevelColor(effectiveEntry?.level ?? ConfigLevel.USER)}`,
            `${chalk.gray('Source:')} ${chalk.gray(effectiveEntry?.source ?? '')}`,
          ]
        : []),
    ].join('\n');

    display.info(details, title);
  }
};

export const displayConfigAddResult = (key: string, value: string, level: ConfigLevel): void => {
  const title = chalk.bold.green('➕ Configuration Added');
  const levelColor = formatLevelColor(level);

  const details = [
    `${chalk.gray('Key:')} ${chalk.blue(key)}`,
    `${chalk.gray('Value:')} ${chalk.green(value)}`,
    `${chalk.gray('Level:')} ${levelColor}`,
    `${chalk.gray('Action:')} ${chalk.green('Added to existing values')}`,
  ].join('\n');

  display.success(details, title);
};

export const displayConfigHelp = (): void => {
  const title = chalk.bold.blue('🔧 Configuration Help');

  const commonCommands = [
    `${chalk.green('sourcecontrol config get <key>')}          ${chalk.gray('Get configuration value')}`,
    `${chalk.green('sourcecontrol config set <key> <value>')}  ${chalk.gray('Set configuration value')}`,
    `${chalk.green('sourcecontrol config list')}               ${chalk.gray('List all configuration')}`,
    `${chalk.green('sourcecontrol config unset <key>')}        ${chalk.gray('Remove configuration key')}`,
    `${chalk.green('sourcecontrol config edit')}               ${chalk.gray('Edit configuration file')}`,
    `${chalk.green('sourcecontrol config export')}             ${chalk.gray('Export configuration as JSON')}`,
  ].join('\n');

  const commonKeys = [
    `${chalk.blue('user.name')}              ${chalk.gray('Your name for commits')}`,
    `${chalk.blue('user.email')}             ${chalk.gray('Your email for commits')}`,
    `${chalk.blue('init.defaultbranch')}     ${chalk.gray('Default branch name')}`,
    `${chalk.blue('core.editor')}            ${chalk.gray('Text editor for commit messages')}`,
    `${chalk.blue('color.ui')}               ${chalk.gray('Enable/disable colored output')}`,
  ].join('\n');

  const levels = [
    `${chalk.yellow('system')}     ${chalk.gray('/etc/sourcecontrol/config.json (all users)')}`,
    `${chalk.yellow('user')}       ${chalk.gray('~/.config/sourcecontrol/config.json (current user)')}`,
    `${chalk.yellow('repository')} ${chalk.gray('.source/config.json (current repository)')}`,
  ].join('\n');

  const jsonExample = [
    `${chalk.gray('# Example configuration file structure (JSON):')}`,
    `${chalk.green('{')}`,
    `${chalk.green('  "user": {')}`,
    `${chalk.green('    "name": "John Doe",')}`,
    `${chalk.green('    "email": "john@example.com"')}`,
    `${chalk.green('  },')}`,
    `${chalk.green('  "core": {')}`,
    `${chalk.green('    "editor": "code --wait",')}`,
    `${chalk.green('    "autocrlf": "input"')}`,
    `${chalk.green('  },')}`,
    `${chalk.green('  "remote": {')}`,
    `${chalk.green('    "origin": {')}`,
    `${chalk.green('      "url": "https://github.com/user/repo.git",')}`,
    `${chalk.green('      "fetch": [')}`,
    `${chalk.green('        "+refs/heads/*:refs/remotes/origin/*"')}`,
    `${chalk.green('      ]')}`,
    `${chalk.green('    }')}`,
    `${chalk.green('  }')}`,
    `${chalk.green('}')}`,
  ].join('\n');

  display.info(commonCommands, `${title} - Common Commands`);
  display.info(commonKeys, `${title} - Common Configuration Keys`);
  display.info(levels, `${title} - Configuration Levels`);
  display.info(jsonExample, `${title} - JSON Format`);
};

export const displayConfigExport = (jsonContent: string, level?: string): void => {
  const title = level
    ? chalk.bold.green(`📄 Configuration Export (${level} level)`)
    : chalk.bold.green('📄 Configuration Export');

  const details = [
    `${chalk.gray('Format:')} ${chalk.white('JSON')}`,
    `${chalk.gray('Use:')} ${chalk.white('Copy and save to file, or pipe to another command')}`,
  ].join('\n');

  display.info(details, title);
  console.log();
  console.log(jsonContent);
};

export const displayConfigImport = (sourceFile: string, targetLevel: ConfigLevel): void => {
  const title = chalk.bold.green('📥 Configuration Imported');

  const details = [
    `${chalk.gray('Source:')} ${chalk.white(sourceFile)}`,
    `${chalk.gray('Target Level:')} ${formatLevelColor(targetLevel)}`,
    `${chalk.gray('Status:')} ${chalk.green('Successfully imported')}`,
  ].join('\n');

  display.success(details, title);
};

const formatLevelColor = (level: ConfigLevel): string => {
  switch (level) {
    case ConfigLevel.COMMAND_LINE:
      return chalk.red.bold('cmdline');
    case ConfigLevel.REPOSITORY:
      return chalk.yellow('local');
    case ConfigLevel.USER:
      return chalk.cyan('global');
    case ConfigLevel.SYSTEM:
      return chalk.magenta('system');
    case ConfigLevel.BUILTIN:
      return chalk.gray('builtin');
    default:
      return chalk.white(level);
  }
};

const groupEntriesBySection = (entries: ConfigEntry[]): Map<string, ConfigEntry[]> => {
  const sections = new Map<string, ConfigEntry[]>();
  entries.forEach((entry) => {
    const sectionName = entry.key.split('.')[0];
    if (!sectionName) return;

    if (!sections.has(sectionName)) sections.set(sectionName, []);
    sections.get(sectionName)!.push(entry);
  });

  return new Map([...sections.entries()].sort());
};
