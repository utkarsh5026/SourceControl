import { TreeEntry, EntryType } from '../tree-entry';

describe('EntryType', () => {
  it('should have correct values for all entry types', () => {
    expect(EntryType.DIRECTORY).toBe('040000');
    expect(EntryType.REGULAR_FILE).toBe('100644');
    expect(EntryType.EXECUTABLE_FILE).toBe('100755');
    expect(EntryType.SYMBOLIC_LINK).toBe('120000');
    expect(EntryType.SUBMODULE).toBe('160000');
  });
});

describe('TreeEntry', () => {
  const validSha = 'a1b2c3d4e5f6789012345678901234567890abcd';
  const validName = 'test-file.txt';
  const validMode = EntryType.REGULAR_FILE;

  describe('Constructor', () => {
    it('should create a valid tree entry with proper values', () => {
      const entry = new TreeEntry(validMode, validName, validSha);

      expect(entry.mode()).toBe(validMode);
      expect(entry.name()).toBe(validName);
      expect(entry.sha()).toBe(validSha.toLowerCase());
    });

    it('should convert SHA to lowercase', () => {
      const upperCaseSha = 'A1B2C3D4E5F6789012345678901234567890ABCD';
      const entry = new TreeEntry(validMode, validName, upperCaseSha);

      expect(entry.sha()).toBe(upperCaseSha.toLowerCase());
    });

    it('should throw error for null name', () => {
      expect(() => new TreeEntry(validMode, null as any, validSha)).toThrow(
        'Name cannot be null or empty'
      );
    });

    it('should throw error for empty name', () => {
      expect(() => new TreeEntry(validMode, '', validSha)).toThrow('Name cannot be null or empty');
    });

    it('should throw error for name containing forward slash', () => {
      expect(() => new TreeEntry(validMode, 'folder/file.txt', validSha)).toThrow(
        'Invalid characters in name: folder/file.txt'
      );
    });

    it('should throw error for name containing null byte', () => {
      expect(() => new TreeEntry(validMode, 'file\0name', validSha)).toThrow(
        'Invalid characters in name: file\0name'
      );
    });

    it('should throw error for null SHA', () => {
      expect(() => new TreeEntry(validMode, validName, null as any)).toThrow(
        'SHA must be 40 characters long'
      );
    });

    it('should throw error for SHA with wrong length', () => {
      expect(() => new TreeEntry(validMode, validName, 'short')).toThrow(
        'SHA must be 40 characters long'
      );

      expect(() => new TreeEntry(validMode, validName, 'a'.repeat(41))).toThrow(
        'SHA must be 40 characters long'
      );
    });

    it('should throw error for SHA with non-hex characters', () => {
      expect(() => new TreeEntry(validMode, validName, 'g'.repeat(40))).toThrow(
        'SHA must contain only hex characters'
      );

      expect(
        () => new TreeEntry(validMode, validName, '123456789012345678901234567890123456789z')
      ).toThrow('SHA must contain only hex characters');
    });
  });

  describe('Getters', () => {
    let entry: TreeEntry;

    beforeEach(() => {
      entry = new TreeEntry(validMode, validName, validSha);
    });

    it('should return correct mode', () => {
      expect(entry.mode()).toBe(validMode);
    });

    it('should return correct name', () => {
      expect(entry.name()).toBe(validName);
    });

    it('should return correct sha', () => {
      expect(entry.sha()).toBe(validSha.toLowerCase());
    });

    it('should return correct entry type', () => {
      expect(entry.entryType()).toBe(EntryType.REGULAR_FILE);
    });
  });

  describe('fromMode static method', () => {
    it('should return correct EntryType for valid modes', () => {
      expect(TreeEntry.fromMode('040000')).toBe(EntryType.DIRECTORY);
      expect(TreeEntry.fromMode('100644')).toBe(EntryType.REGULAR_FILE);
      expect(TreeEntry.fromMode('100755')).toBe(EntryType.EXECUTABLE_FILE);
      expect(TreeEntry.fromMode('120000')).toBe(EntryType.SYMBOLIC_LINK);
      expect(TreeEntry.fromMode('160000')).toBe(EntryType.SUBMODULE);
    });

    it('should throw error for invalid mode', () => {
      expect(() => TreeEntry.fromMode('999999')).toThrow('Unknown mode: 999999');

      expect(() => TreeEntry.fromMode('100000')).toThrow('Unknown mode: 100000');
    });
  });

  describe('Type checking methods', () => {
    it('should correctly identify directory entries', () => {
      const entry = new TreeEntry(EntryType.DIRECTORY, 'folder', validSha);

      expect(entry.isDirectory()).toBe(true);
      expect(entry.isFile()).toBe(false);
      expect(entry.isExecutable()).toBe(false);
      expect(entry.isSymbolicLink()).toBe(false);
      expect(entry.isSubmodule()).toBe(false);
    });

    it('should correctly identify regular file entries', () => {
      const entry = new TreeEntry(EntryType.REGULAR_FILE, 'file.txt', validSha);

      expect(entry.isDirectory()).toBe(false);
      expect(entry.isFile()).toBe(true);
      expect(entry.isExecutable()).toBe(false);
      expect(entry.isSymbolicLink()).toBe(false);
      expect(entry.isSubmodule()).toBe(false);
    });

    it('should correctly identify executable file entries', () => {
      const entry = new TreeEntry(EntryType.EXECUTABLE_FILE, 'script.sh', validSha);

      expect(entry.isDirectory()).toBe(false);
      expect(entry.isFile()).toBe(true);
      expect(entry.isExecutable()).toBe(true);
      expect(entry.isSymbolicLink()).toBe(false);
      expect(entry.isSubmodule()).toBe(false);
    });

    it('should correctly identify symbolic link entries', () => {
      const entry = new TreeEntry(EntryType.SYMBOLIC_LINK, 'link', validSha);

      expect(entry.isDirectory()).toBe(false);
      expect(entry.isFile()).toBe(false);
      expect(entry.isExecutable()).toBe(false);
      expect(entry.isSymbolicLink()).toBe(true);
      expect(entry.isSubmodule()).toBe(false);
    });

    it('should correctly identify submodule entries', () => {
      const entry = new TreeEntry(EntryType.SUBMODULE, 'submodule', validSha);

      expect(entry.isDirectory()).toBe(false);
      expect(entry.isFile()).toBe(false);
      expect(entry.isExecutable()).toBe(false);
      expect(entry.isSymbolicLink()).toBe(false);
      expect(entry.isSubmodule()).toBe(true);
    });
  });

  describe('Serialization', () => {
    it('should serialize regular file entry correctly', () => {
      const entry = new TreeEntry(EntryType.REGULAR_FILE, 'hello.txt', validSha);
      const serialized = entry.serialize();

      // Check the text portion: "100644 hello.txt\0"
      const textPortion = new TextDecoder().decode(serialized.slice(0, 16));
      expect(textPortion).toBe('100644 hello.txt\0');

      // Check that SHA bytes are present (20 bytes after text)
      expect(serialized.length).toBe(16 + 20);
    });

    it('should serialize directory entry correctly', () => {
      const entry = new TreeEntry(EntryType.DIRECTORY, 'docs', validSha);
      const serialized = entry.serialize();

      const textPortion = new TextDecoder().decode(serialized.slice(0, 12));
      expect(textPortion).toBe('040000 docs\0');
      expect(serialized.length).toBe(12 + 20);
    });

    it('should serialize executable file correctly', () => {
      const entry = new TreeEntry(EntryType.EXECUTABLE_FILE, 'run.sh', validSha);
      const serialized = entry.serialize();

      const textPortion = new TextDecoder().decode(serialized.slice(0, 14));
      expect(textPortion).toBe('100755 run.sh\0');
      expect(serialized.length).toBe(14 + 20);
    });

    it('should handle special characters in filename', () => {
      const entry = new TreeEntry(
        EntryType.REGULAR_FILE,
        'file-with-dashes_and_underscores.txt',
        validSha
      );
      const serialized = entry.serialize();

      const expectedText = '100644 file-with-dashes_and_underscores.txt\0';
      const textPortion = new TextDecoder().decode(serialized.slice(0, expectedText.length));
      expect(textPortion).toBe(expectedText);
    });

    it('should convert SHA hex string to correct binary format', () => {
      const testSha = '0123456789abcdef0123456789abcdef01234567';
      const entry = new TreeEntry(EntryType.REGULAR_FILE, 'test', testSha);
      const serialized = entry.serialize();

      // Extract SHA bytes (last 20 bytes)
      const shaBytes = serialized.slice(-20);

      // Convert back to hex string to verify
      const reconstructedSha = Array.from(shaBytes)
        .map((b: number) => b.toString(16).padStart(2, '0'))
        .join('');

      expect(reconstructedSha).toBe(testSha);
    });
  });

  describe('Deserialization', () => {
    it('should deserialize regular file entry correctly', () => {
      // Create test data: "100644 test.txt\0" + 20 SHA bytes
      const textData = new TextEncoder().encode('100644 test.txt\0');
      const shaBytes = new Uint8Array(20);
      for (let i = 0; i < 20; i++) {
        shaBytes[i] = i; // Simple test pattern
      }

      const data = new Uint8Array(textData.length + shaBytes.length);
      data.set(textData, 0);
      data.set(shaBytes, textData.length);

      const result = TreeEntry.deserialize(data, 0);

      expect(result.entry.mode()).toBe('100644');
      expect(result.entry.name()).toBe('test.txt');
      expect(result.entry.isFile()).toBe(true);
      expect(result.nextOffset).toBe(data.length);
    });

    it('should deserialize directory entry correctly', () => {
      const textData = new TextEncoder().encode('040000 folder\0');
      const shaBytes = new Uint8Array(20).fill(255);

      const data = new Uint8Array(textData.length + shaBytes.length);
      data.set(textData, 0);
      data.set(shaBytes, textData.length);

      const result = TreeEntry.deserialize(data, 0);

      expect(result.entry.mode()).toBe('040000');
      expect(result.entry.name()).toBe('folder');
      expect(result.entry.isDirectory()).toBe(true);
    });

    it('should handle deserialization with offset', () => {
      // Create data with some padding at the beginning
      const padding = new Uint8Array(10).fill(0);
      const textData = new TextEncoder().encode('100755 script.sh\0');
      const shaBytes = new Uint8Array(20).fill(128);

      const data = new Uint8Array(padding.length + textData.length + shaBytes.length);
      data.set(padding, 0);
      data.set(textData, padding.length);
      data.set(shaBytes, padding.length + textData.length);

      const result = TreeEntry.deserialize(data, padding.length);

      expect(result.entry.mode()).toBe('100755');
      expect(result.entry.name()).toBe('script.sh');
      expect(result.entry.isExecutable()).toBe(true);
      expect(result.nextOffset).toBe(data.length);
    });

    it('should correctly reconstruct SHA from binary data', () => {
      const originalSha = 'abcdef0123456789abcdef0123456789abcdef01';
      const textData = new TextEncoder().encode('100644 file.txt\0');

      // Convert SHA to binary
      const shaBytes = new Uint8Array(20);
      for (let i = 0; i < 20; i++) {
        const hexIndex = i * 2;
        shaBytes[i] = parseInt(originalSha.substring(hexIndex, hexIndex + 2), 16);
      }

      const data = new Uint8Array(textData.length + shaBytes.length);
      data.set(textData, 0);
      data.set(shaBytes, textData.length);

      const result = TreeEntry.deserialize(data, 0);
      expect(result.entry.sha()).toBe(originalSha);
    });
  });

  describe('Comparison', () => {
    it('should sort directories before files', () => {
      const dir = new TreeEntry(EntryType.DIRECTORY, 'folder', validSha);
      const file = new TreeEntry(EntryType.REGULAR_FILE, 'file.txt', validSha);

      expect(dir.compareTo(file)).toBeLessThan(0);
      expect(file.compareTo(dir)).toBeGreaterThan(0);
    });

    it('should sort files alphabetically', () => {
      const fileA = new TreeEntry(EntryType.REGULAR_FILE, 'a.txt', validSha);
      const fileB = new TreeEntry(EntryType.REGULAR_FILE, 'b.txt', validSha);

      expect(fileA.compareTo(fileB)).toBeLessThan(0);
      expect(fileB.compareTo(fileA)).toBeGreaterThan(0);
    });

    it('should sort directories alphabetically', () => {
      const dirA = new TreeEntry(EntryType.DIRECTORY, 'alpha', validSha);
      const dirB = new TreeEntry(EntryType.DIRECTORY, 'beta', validSha);

      expect(dirA.compareTo(dirB)).toBeLessThan(0);
      expect(dirB.compareTo(dirA)).toBeGreaterThan(0);
    });

    it('should return 0 for identical entries', () => {
      const entry1 = new TreeEntry(EntryType.REGULAR_FILE, 'same.txt', validSha);
      const entry2 = new TreeEntry(
        EntryType.REGULAR_FILE,
        'same.txt',
        'differentsha1234567890123456789012345678'
      );

      expect(entry1.compareTo(entry2)).toBe(0);
    });

    it('should handle directory with same name as file', () => {
      const dir = new TreeEntry(EntryType.DIRECTORY, 'name', validSha);
      const file = new TreeEntry(EntryType.REGULAR_FILE, 'name', validSha);

      // Directory should come before file (name/ vs name)
      expect(dir.compareTo(file)).toBeLessThan(0);
      expect(file.compareTo(dir)).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle long filenames', () => {
      const longName = 'a'.repeat(255);
      const entry = new TreeEntry(EntryType.REGULAR_FILE, longName, validSha);

      expect(entry.name()).toBe(longName);
      expect(() => entry.serialize()).not.toThrow();
    });

    it('should handle all valid hex characters in SHA', () => {
      const mixedCaseSha = 'ABCDEFabcdef0123456789ABCDEFabcdef012345';
      const entry = new TreeEntry(EntryType.REGULAR_FILE, 'test', mixedCaseSha);

      expect(entry.sha()).toBe(mixedCaseSha.toLowerCase());
    });

    it('should handle UTF-8 characters in filename', () => {
      const unicodeName = 'файл-test-文件.txt';
      const entry = new TreeEntry(EntryType.REGULAR_FILE, unicodeName, validSha);

      expect(entry.name()).toBe(unicodeName);

      // Should serialize without errors
      const serialized = entry.serialize();
      expect(serialized.length).toBeGreaterThan(20); // At least SHA + some text
    });

    it('should maintain immutability of internal state', () => {
      const entry = new TreeEntry(EntryType.REGULAR_FILE, 'test.txt', validSha);
      const mode = entry.mode();
      const name = entry.name();
      const sha = entry.sha();

      // These should remain unchanged regardless of external modifications
      expect(entry.mode()).toBe(mode);
      expect(entry.name()).toBe(name);
      expect(entry.sha()).toBe(sha);
    });
  });

  describe('Integration Tests', () => {
    it('should maintain data integrity through serialize/deserialize cycle', () => {
      const originalEntry = new TreeEntry(EntryType.EXECUTABLE_FILE, 'build.sh', validSha);

      // Serialize
      const serialized = originalEntry.serialize();

      // Deserialize
      const result = TreeEntry.deserialize(serialized, 0);
      const deserializedEntry = result.entry;

      // Verify all properties match
      expect(deserializedEntry.mode()).toBe(originalEntry.mode());
      expect(deserializedEntry.name()).toBe(originalEntry.name());
      expect(deserializedEntry.sha()).toBe(originalEntry.sha());
      expect(deserializedEntry.entryType()).toBe(originalEntry.entryType());
      expect(deserializedEntry.isExecutable()).toBe(originalEntry.isExecutable());
    });

    it('should handle multiple entries in sequence', () => {
      const entries = [
        new TreeEntry(EntryType.DIRECTORY, 'docs', validSha),
        new TreeEntry(EntryType.REGULAR_FILE, 'README.md', validSha),
        new TreeEntry(EntryType.EXECUTABLE_FILE, 'install.sh', validSha),
      ];

      // Serialize all entries into one buffer
      const serializedParts = entries.map((entry) => entry.serialize());
      const totalLength = serializedParts.reduce((sum, part) => sum + part.length, 0);
      const combined = new Uint8Array(totalLength);

      let offset = 0;
      for (const part of serializedParts) {
        combined.set(part, offset);
        offset += part.length;
      }

      // Deserialize all entries
      const deserializedEntries: TreeEntry[] = [];
      offset = 0;
      for (let i = 0; i < entries.length; i++) {
        const { entry, nextOffset } = TreeEntry.deserialize(combined, offset);
        deserializedEntries.push(entry);
        offset = nextOffset;
      }

      // Verify all entries match
      for (let i = 0; i < entries.length; i++) {
        const deserializedEntry = deserializedEntries[i];
        const originalEntry = entries[i];

        expect(deserializedEntry?.mode()).toBe(originalEntry?.mode());
        expect(deserializedEntry?.name()).toBe(originalEntry?.name());
        expect(deserializedEntry?.sha()).toBe(originalEntry?.sha());
      }
    });
  });
});
