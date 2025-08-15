import { ConfigStore } from '../../core/config/config-store';
import { ConfigLevel, ConfigEntry } from '../../core/config/config-level';
import { ConfigParser } from '../../core/config/config-parser';
import { FileUtils } from '../../utils';
import fs from 'fs-extra';
import { logger } from '../../utils/cli/logger';

jest.mock('fs-extra', () => ({
  readFile: jest.fn(),
}));

jest.mock('../../utils', () => ({
  FileUtils: {
    exists: jest.fn(),
    createFile: jest.fn(),
  },
}));

jest.mock('../../core/config/config-parser', () => ({
  ConfigParser: {
    validate: jest.fn(),
    parse: jest.fn(),
    serialize: jest.fn(),
    formatForDisplay: jest.fn(),
  },
}));

jest.mock('../../utils/cli/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

const mockedFs = jest.mocked(fs);
const mockedFileUtils = jest.mocked(FileUtils);
const mockedConfigParser = jest.mocked(ConfigParser);
const mockedLogger = jest.mocked(logger);

describe('ConfigStore', () => {
  const testPath = '/test/config.json';
  const testLevel = ConfigLevel.USER;
  let configStore: ConfigStore;

  beforeEach(() => {
    configStore = new ConfigStore(testPath, testLevel);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('creates instance with correct path and level', () => {
      const store = new ConfigStore('/custom/path', ConfigLevel.REPOSITORY);
      expect(store).toBeInstanceOf(ConfigStore);
    });
  });

  describe('load', () => {
    test('loads configuration from existing file successfully', async () => {
      const testContent = '{"user": {"name": "John Doe"}}';
      const mockEntries = new Map([
        ['user.name', [new ConfigEntry('user.name', 'John Doe', testLevel, testPath, 0)]]
      ]);

      mockedFileUtils.exists.mockResolvedValue(true);
      (mockedFs.readFile as jest.Mock).mockResolvedValue(testContent);
      mockedConfigParser.validate.mockReturnValue({ valid: true, errors: [] });
      mockedConfigParser.parse.mockReturnValue(mockEntries);

      await configStore.load();

      expect(mockedFileUtils.exists).toHaveBeenCalledWith(testPath);
      expect(mockedFs.readFile).toHaveBeenCalledWith(testPath, 'utf8');
      expect(mockedConfigParser.validate).toHaveBeenCalledWith(testContent);
      expect(mockedConfigParser.parse).toHaveBeenCalledWith(testContent, testPath, testLevel);
      expect(configStore.getEntries('user.name')).toEqual(mockEntries.get('user.name'));
    });

    test('handles non-existent file gracefully', async () => {
      mockedFileUtils.exists.mockResolvedValue(false);

      await configStore.load();

      expect(mockedFileUtils.exists).toHaveBeenCalledWith(testPath);
      expect(mockedFs.readFile).not.toHaveBeenCalled();
      expect(configStore.getAllEntries().size).toBe(0);
    });

    test('handles invalid JSON configuration with warning', async () => {
      const testContent = '{"user": {"name": "John"}}';
      const validationErrors = ['Invalid configuration structure'];

      mockedFileUtils.exists.mockResolvedValue(true);
      (mockedFs.readFile as jest.Mock).mockResolvedValue(testContent);
      mockedConfigParser.validate.mockReturnValue({ valid: false, errors: validationErrors });

      await configStore.load();

      expect(mockedLogger.warn).toHaveBeenCalledWith(`Warning: Invalid configuration in ${testPath}:`);
      expect(mockedLogger.warn).toHaveBeenCalledWith('  Invalid configuration structure');
      expect(mockedConfigParser.parse).not.toHaveBeenCalled();
    });

    test('handles file read errors with warning', async () => {
      const error = new Error('Permission denied');

      mockedFileUtils.exists.mockResolvedValue(true);
      (mockedFs.readFile as jest.Mock).mockRejectedValue(error);

      await configStore.load();

      expect(mockedLogger.warn).toHaveBeenCalledWith(
        `Warning: Could not read config file ${testPath}:`,
        error
      );
    });

    test('handles ConfigParser.parse errors with warning', async () => {
      const testContent = 'invalid json';
      const parseError = new Error('JSON parse error');

      mockedFileUtils.exists.mockResolvedValue(true);
      (mockedFs.readFile as jest.Mock).mockResolvedValue(testContent);
      mockedConfigParser.validate.mockReturnValue({ valid: true, errors: [] });
      mockedConfigParser.parse.mockImplementation(() => {
        throw parseError;
      });

      await configStore.load();

      expect(mockedLogger.warn).toHaveBeenCalledWith(
        `Warning: Could not read config file ${testPath}:`,
        parseError
      );
    });
  });

  describe('save', () => {
    test('saves configuration to file successfully', async () => {
      const mockEntries = new Map([
        ['user.name', [new ConfigEntry('user.name', 'John Doe', testLevel, testPath, 0)]]
      ]);
      const serializedContent = '{"user": {"name": "John Doe"}}';

      // Setup internal state
      configStore.set('user.name', 'John Doe');
      mockedConfigParser.serialize.mockReturnValue(serializedContent);

      await configStore.save();

      expect(mockedConfigParser.serialize).toHaveBeenCalledWith(expect.any(Map));
      expect(mockedFileUtils.createFile).toHaveBeenCalledWith(testPath, serializedContent);
    });

    test('throws error on file write failure', async () => {
      const writeError = new Error('Disk full');
      const serializedContent = '{}';

      mockedConfigParser.serialize.mockReturnValue(serializedContent);
      mockedFileUtils.createFile.mockRejectedValue(writeError);

      await expect(configStore.save()).rejects.toThrow(writeError);

      expect(mockedLogger.error).toHaveBeenCalledWith(
        `Failed to save configuration to ${testPath}: Disk full`
      );
    });

    test('handles ConfigParser.serialize errors', async () => {
      const serializeError = new Error('Serialization failed');

      mockedConfigParser.serialize.mockImplementation(() => {
        throw serializeError;
      });

      await expect(configStore.save()).rejects.toThrow(serializeError);

      expect(mockedLogger.error).toHaveBeenCalledWith(
        `Failed to save configuration to ${testPath}: Serialization failed`
      );
    });
  });

  describe('getEntries', () => {
    test('returns entries for existing key', () => {
      const entries = [new ConfigEntry('user.name', 'John Doe', testLevel, testPath, 0)];
      configStore.set('user.name', 'John Doe');

      const result = configStore.getEntries('user.name');

      expect(result).toHaveLength(1);
      expect(result[0]?.value).toBe('John Doe');
    });

    test('returns empty array for non-existent key', () => {
      const result = configStore.getEntries('non.existent.key');

      expect(result).toEqual([]);
    });
  });

  describe('set', () => {
    test('sets a single configuration value', () => {
      configStore.set('user.name', 'Jane Doe');

      const entries = configStore.getEntries('user.name');
      expect(entries).toHaveLength(1);
      expect(entries[0]?.value).toBe('Jane Doe');
      expect(entries[0]?.key).toBe('user.name');
      expect(entries[0]?.level).toBe(testLevel);
      expect(entries[0]?.source).toBe(testPath);
    });

    test('replaces existing values for the same key', () => {
      configStore.set('user.name', 'John Doe');
      configStore.set('user.name', 'Jane Doe');

      const entries = configStore.getEntries('user.name');
      expect(entries).toHaveLength(1);
      expect(entries[0]?.value).toBe('Jane Doe');
    });
  });

  describe('add', () => {
    test('adds a configuration value to new key', () => {
      configStore.add('remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*');

      const entries = configStore.getEntries('remote.origin.fetch');
      expect(entries).toHaveLength(1);
      expect(entries[0]?.value).toBe('+refs/heads/*:refs/remotes/origin/*');
    });

    test('adds multiple values to the same key', () => {
      configStore.add('remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*');
      configStore.add('remote.origin.fetch', '+refs/tags/*:refs/tags/*');

      const entries = configStore.getEntries('remote.origin.fetch');
      expect(entries).toHaveLength(2);
      expect(entries[0]?.value).toBe('+refs/heads/*:refs/remotes/origin/*');
      expect(entries[1]?.value).toBe('+refs/tags/*:refs/tags/*');
    });

    test('preserves existing values when adding new ones', () => {
      configStore.set('user.email', 'existing@example.com');
      configStore.add('user.email', 'new@example.com');

      const entries = configStore.getEntries('user.email');
      expect(entries).toHaveLength(2);
      expect(entries[0]?.value).toBe('existing@example.com');
      expect(entries[1]?.value).toBe('new@example.com');
    });
  });

  describe('unset', () => {
    test('removes all values for a key', () => {
      configStore.set('user.name', 'John Doe');
      configStore.add('user.name', 'Jane Doe');

      expect(configStore.getEntries('user.name')).toHaveLength(2);

      configStore.unset('user.name');

      expect(configStore.getEntries('user.name')).toEqual([]);
    });

    test('handles unsetting non-existent key gracefully', () => {
      configStore.unset('non.existent.key');

      expect(configStore.getEntries('non.existent.key')).toEqual([]);
    });
  });

  describe('getAllEntries', () => {
    test('returns copy of all entries', () => {
      configStore.set('user.name', 'John Doe');
      configStore.set('user.email', 'john@example.com');

      const allEntries = configStore.getAllEntries();

      expect(allEntries.size).toBe(2);
      expect(allEntries.has('user.name')).toBe(true);
      expect(allEntries.has('user.email')).toBe(true);

      // Verify it's a copy, not the original
      allEntries.clear();
      expect(configStore.getAllEntries().size).toBe(2);
    });

    test('returns empty map when no entries exist', () => {
      const allEntries = configStore.getAllEntries();

      expect(allEntries.size).toBe(0);
    });
  });

  describe('toJSON', () => {
    test('exports configuration as formatted JSON string', () => {
      const mockFormattedJSON = '{\n  "user": {\n    "name": "John Doe"\n  }\n}';

      configStore.set('user.name', 'John Doe');
      mockedConfigParser.formatForDisplay.mockReturnValue(mockFormattedJSON);

      const result = configStore.toJSON();

      expect(mockedConfigParser.formatForDisplay).toHaveBeenCalledWith(expect.any(Map));
      expect(result).toBe(mockFormattedJSON);
    });
  });

  describe('fromJSON', () => {
    test('imports valid JSON configuration', () => {
      const jsonContent = '{"user": {"name": "John Doe"}}';
      const mockEntries = new Map([
        ['user.name', [new ConfigEntry('user.name', 'John Doe', testLevel, testPath, 0)]]
      ]);

      mockedConfigParser.validate.mockReturnValue({ valid: true, errors: [] });
      mockedConfigParser.parse.mockReturnValue(mockEntries);

      configStore.fromJSON(jsonContent);

      expect(mockedConfigParser.validate).toHaveBeenCalledWith(jsonContent);
      expect(mockedConfigParser.parse).toHaveBeenCalledWith(jsonContent, testPath, testLevel);
      expect(configStore.getEntries('user.name')).toEqual(mockEntries.get('user.name'));
    });

    test('handles invalid JSON with error logging', () => {
      const jsonContent = 'invalid json';
      const validationErrors = ['Invalid JSON syntax'];

      mockedConfigParser.validate.mockReturnValue({ valid: false, errors: validationErrors });

      configStore.fromJSON(jsonContent);

      expect(mockedLogger.error).toHaveBeenCalledWith(
        'Invalid JSON configuration: Invalid JSON syntax'
      );
      expect(mockedConfigParser.parse).not.toHaveBeenCalled();
    });

    test('replaces existing configuration when importing', () => {
      const initialJSON = '{"user": {"name": "John Doe"}}';
      const newJSON = '{"user": {"name": "Jane Doe", "email": "jane@example.com"}}';

      const initialEntries = new Map([
        ['user.name', [new ConfigEntry('user.name', 'John Doe', testLevel, testPath, 0)]]
      ]);
      const newEntries = new Map([
        ['user.name', [new ConfigEntry('user.name', 'Jane Doe', testLevel, testPath, 0)]],
        ['user.email', [new ConfigEntry('user.email', 'jane@example.com', testLevel, testPath, 0)]]
      ]);

      mockedConfigParser.validate.mockReturnValue({ valid: true, errors: [] });
      mockedConfigParser.parse
        .mockReturnValueOnce(initialEntries)
        .mockReturnValueOnce(newEntries);

      configStore.fromJSON(initialJSON);
      expect(configStore.getEntries('user.name')[0]?.value).toBe('John Doe');

      configStore.fromJSON(newJSON);
      expect(configStore.getEntries('user.name')[0]?.value).toBe('Jane Doe');
      expect(configStore.getEntries('user.email')[0]?.value).toBe('jane@example.com');
    });
  });

  describe('integration scenarios', () => {
    test('complete workflow: load, modify, save', async () => {
      const initialContent = '{"user": {"name": "John Doe"}}';
      const initialEntries = new Map([
        ['user.name', [new ConfigEntry('user.name', 'John Doe', testLevel, testPath, 0)]]
      ]);
      const finalContent = '{"user": {"name": "Jane Doe", "email": "jane@example.com"}}';

      // Reset mocks to ensure clean state
      jest.clearAllMocks();
      
      // Setup load
      mockedFileUtils.exists.mockResolvedValue(true);
      (mockedFs.readFile as jest.Mock).mockResolvedValue(initialContent);
      mockedConfigParser.validate.mockReturnValue({ valid: true, errors: [] });
      mockedConfigParser.parse.mockReturnValue(initialEntries);

      // Setup save
      mockedConfigParser.serialize.mockReturnValue(finalContent);
      mockedFileUtils.createFile.mockResolvedValue(undefined);

      // Execute workflow
      await configStore.load();
      configStore.set('user.name', 'Jane Doe');
      configStore.add('user.email', 'jane@example.com');
      await configStore.save();

      // Verify the workflow
      expect(configStore.getEntries('user.name')[0]?.value).toBe('Jane Doe');
      expect(configStore.getEntries('user.email')[0]?.value).toBe('jane@example.com');
      expect(mockedFileUtils.createFile).toHaveBeenCalledWith(testPath, finalContent);
    });

    test('handles empty configuration gracefully', async () => {
      mockedFileUtils.exists.mockResolvedValue(false);

      await configStore.load();

      expect(configStore.getAllEntries().size).toBe(0);
      expect(configStore.getEntries('any.key')).toEqual([]);
      expect(configStore.toJSON()).toBeDefined();
    });
  });
});