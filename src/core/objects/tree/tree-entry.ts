export enum EntryType {
  DIRECTORY = '040000',
  REGULAR_FILE = '100644',
  EXECUTABLE_FILE = '100755',
  SYMBOLIC_LINK = '120000',
  SUBMODULE = '160000',
}

/**
 * Represents a single entry in a Git tree object.
 *
 * Each entry contains:
 * - mode: File permissions and type (6 bytes, octal)
 * - name: Filename or directory name (variable length string)
 * - sha: SHA-1 hash of the referenced object (40 character hex string)
 *
 * Entry types by mode:
 * - 040000: Directory (tree object)
 * - 100644: Regular file (blob object)
 * - 100755: Executable file (blob object)
 * - 120000: Symbolic link (blob object)
 * - 160000: Git submodule (commit object)
 *
 * Serialized format in tree object:
 * [mode] [space] [filename] [null byte] [20-byte SHA-1 binary]
 *
 * Example serialized entry for "hello.txt" file:
 * "100644 hello.txt\0[20 bytes of SHA-1]"
 */

export class TreeEntry {
  private _mode: string;
  private _name: string;
  private _sha: string;

  private static readonly NULL_BYTE = 0x00;
  private static readonly SPACE_BYTE = 0x20;
  private static readonly SHA_LENGTH_BYTES = 20;

  constructor(mode: string, name: string, sha: string) {
    this._mode = mode;
    this._name = this.validateName(name);
    this._sha = this.validateSha(sha);
  }

  mode(): string {
    return this._mode;
  }

  name(): string {
    return this._name;
  }

  sha(): string {
    return this._sha;
  }

  entryType(): EntryType {
    return TreeEntry.fromMode(this._mode);
  }

  static fromMode(mode: string): EntryType {
    const entryType = Object.values(EntryType).find((type) => type === mode);
    if (!entryType) {
      throw new Error(`Unknown mode: ${mode}`);
    }
    return entryType;
  }

  isDirectory(): boolean {
    return this.entryType() === EntryType.DIRECTORY;
  }

  isFile(): boolean {
    const type = this.entryType();
    return type === EntryType.REGULAR_FILE || type === EntryType.EXECUTABLE_FILE;
  }

  isExecutable(): boolean {
    return this.entryType() === EntryType.EXECUTABLE_FILE;
  }

  isSymbolicLink(): boolean {
    return this.entryType() === EntryType.SYMBOLIC_LINK;
  }

  isSubmodule(): boolean {
    return this.entryType() === EntryType.SUBMODULE;
  }

  /**
   * Serialize this entry for inclusion in a tree object
   * Format: [mode] [space] [filename] [null byte] [20-byte SHA-1 binary]
   */
  serialize(): Uint8Array {
    const modeAndName = `${this.mode} ${this.name}\0`;
    const modeNameBytes = new TextEncoder().encode(modeAndName);

    // Convert SHA-1 hex string to binary (20 bytes)
    const shaBytes = new Uint8Array(20);
    for (let i = 0; i < 20; i++) {
      const index = i * 2;
      shaBytes[i] = parseInt(this._sha.substring(index, index + 2), 16);
    }

    const result = new Uint8Array(modeNameBytes.length + shaBytes.length);
    result.set(modeNameBytes, 0);
    result.set(shaBytes, modeNameBytes.length);

    return result;
  }

  /**
   * Compare this entry with another entry.
   * The comparison is based on the entry's name, with directories sorted before files.
   * @param other - The other entry to compare with.
   * @returns A negative value if this entry is less than the other, zero if they are equal, or a positive value if this entry is greater than the other.
   */
  compareTo(other: TreeEntry): number {
    const thisKey = this.isDirectory() ? this._name + '/' : this._name;
    const otherKey = other.isDirectory() ? other._name + '/' : other._name;

    if (thisKey < otherKey) {
      return -1;
    }
    if (thisKey > otherKey) {
      return 1;
    }
    return 0;
  }

  /**
   * Create a TreeEntry from serialized data
   */
  static deserialize(data: Uint8Array, offset: number): { entry: TreeEntry; nextOffset: number } {
    let spaceIndex = offset;
    while (spaceIndex < data.length && data[spaceIndex] !== TreeEntry.SPACE_BYTE) {
      spaceIndex++;
    }

    const mode = new TextDecoder().decode(data.slice(offset, spaceIndex));

    let nullIndex = spaceIndex + 1;
    while (nullIndex < data.length && data[nullIndex] !== TreeEntry.NULL_BYTE) {
      nullIndex++;
    }

    const name = new TextDecoder().decode(data.slice(spaceIndex + 1, nullIndex));

    const shaStartIndex = nullIndex + 1;
    const shaEndIndex = shaStartIndex + TreeEntry.SHA_LENGTH_BYTES;
    const shaBytes = data.slice(shaStartIndex, shaEndIndex);
    const sha = Array.from(shaBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return {
      entry: new TreeEntry(mode, name, sha),
      nextOffset: nullIndex + TreeEntry.SHA_LENGTH_BYTES + 1,
    };
  }

  /**
   * Validate the name of the entry.
   * Git doesn't allow certain characters in filenames
   */
  private validateName(name: string): string {
    if (name == null || name.length === 0) {
      throw new Error('Name cannot be null or empty');
    }

    // Git doesn't allow certain characters in filenames
    if (name.includes('/') || name.includes('\0')) {
      throw new Error(`Invalid characters in name: ${name}`);
    }

    return name;
  }

  /**
   * Validate the SHA of the entry.
   * The SHA should only be hex characters and should not exceed 40 chars
   */
  private validateSha(sha: string): string {
    const expectedLength = TreeEntry.SHA_LENGTH_BYTES * 2;
    if (sha == null || sha.length !== expectedLength) {
      throw new Error(`SHA must be ${expectedLength} characters long`);
    }

    // Validate hex characters
    if (!sha.match(/[0-9a-fA-F]+/)) {
      throw new Error('SHA must contain only hex characters');
    }

    return sha.toLowerCase();
  }
}
