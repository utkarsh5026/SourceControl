import { ObjectException } from '../exceptions';
import fs from 'fs-extra';

type FileStats = Pick<
  fs.Stats,
  'ctimeMs' | 'mtimeMs' | 'dev' | 'ino' | 'mode' | 'uid' | 'gid' | 'size'
>;

/**
 * Represents a single file entry in the Git index (staging area).
 *
 * Each entry contains comprehensive metadata about a file:
 * - Timestamps (creation and modification times with nanosecond precision)
 * - File system metadata (device ID, inode, permissions)
 * - Content hash (SHA-1 of the file's blob object)
 * - Flags (staging state, assumptions about validity)
 *
 * Binary Layout (62 bytes + filename + padding):
 * ┌────────────────────────────────────────────────────┐
 * │ ctime seconds    (4 bytes) │ ctime nanosecs (4)    │
 * │ mtime seconds    (4 bytes) │ mtime nanosecs (4)    │
 * │ device ID        (4 bytes) │ inode         (4)     │
 * │ mode             (4 bytes) │ uid           (4)     │
 * │ gid              (4 bytes) │ file size     (4)     │
 * │ SHA-1 hash      (20 bytes)                         │
 * │ flags            (2 bytes)                         │
 * │ filename (variable) + null terminator + padding    │
 * └────────────────────────────────────────────────────┘
 */
export class IndexEntry {
  private static readonly HEADER_SIZE = 62;
  private static readonly SHA_SIZE = 20;

  public ctime: [number, number]; // Creation time
  public mtime: [number, number]; // Modification time

  // File system metadata
  public dev: number; // Device ID
  public ino: number; // Inode number
  public mode: number; // File mode (type + permissions)
  public uid: number; // User ID
  public gid: number; // Group ID
  public fileSize: number; // File size in bytes

  // Git object reference
  public sha: string; // SHA-1 hash of the blob

  // Index-specific flags
  public assumeValid: boolean; // Assume file hasn't changed
  public stage: number; // Staging number (0=normal, 1-3=merge conflict)

  // File path (relative to repository root)
  public name: string;

  constructor(data: Partial<IndexEntry> = {}) {
    this.ctime = data.ctime || [0, 0];
    this.mtime = data.mtime || [0, 0];
    this.dev = data.dev || 0;
    this.ino = data.ino || 0;
    this.mode = data.mode ?? 0o100644;
    this.uid = data.uid || 0;
    this.gid = data.gid || 0;
    this.fileSize = data.fileSize || 0;
    this.sha = data.sha || '';
    this.assumeValid = data.assumeValid || false;
    this.stage = data.stage || 0;
    this.name = data.name || '';
  }

  /**
   * Get the file mode type (regular file, symlink, gitlink)
   */
  get modeType(): number {
    return (this.mode >> 12) & 0b1111;
  }

  /**
   * Get the file permissions (last 9 bits)
   */
  get modePerms(): number {
    return this.mode & 0o777;
  }

  /**
   * Check if this is a regular file
   */
  get isRegularFile(): boolean {
    return this.modeType === 0b1000;
  }

  /**
   * Check if this is a symbolic link
   */
  get isSymlink(): boolean {
    return this.modeType === 0b1010;
  }

  get isDirectory(): boolean {
    return this.modeType === 0b0000;
  }

  /**
   * Check if this is a gitlink (submodule)
   */
  get isGitlink(): boolean {
    return this.modeType === 0b1110;
  }

  /**
   * Compare this entry with another for sorting
   * Git sorts entries by name, treating directories as having a trailing '/'
   */
  compareTo(other: IndexEntry): number {
    const thisKey = this.isDirectory ? this.name + '/' : this.name;
    const otherKey = other.isDirectory ? other.name + '/' : other.name;

    if (thisKey < otherKey) return -1;
    if (thisKey > otherKey) return 1;
    return 0;
  }

  /**
   * Serialize this entry to binary format for storage in the index file
   */
  serialize(): Uint8Array {
    const nameBytes = new TextEncoder().encode(this.name);
    const nameLength = nameBytes.length;

    const totalSize = IndexEntry.HEADER_SIZE + nameLength + 1;
    const paddedSize = Math.ceil(totalSize / 8) * 8;

    const buffer = new Uint8Array(paddedSize);
    const view = new DataView(buffer.buffer);

    let offset = 0;

    // Write timestamps
    view.setUint32(offset, this.ctime[0], false);
    offset += 4;
    view.setUint32(offset, this.ctime[1], false);
    offset += 4;
    view.setUint32(offset, this.mtime[0], false);
    offset += 4;
    view.setUint32(offset, this.mtime[1], false);
    offset += 4;

    // Write file system metadata
    view.setUint32(offset, this.dev, false);
    offset += 4;
    view.setUint32(offset, this.ino, false);
    offset += 4;
    view.setUint32(offset, this.mode, false);
    offset += 4;
    view.setUint32(offset, this.uid, false);
    offset += 4;
    view.setUint32(offset, this.gid, false);
    offset += 4;
    view.setUint32(offset, this.fileSize, false);
    offset += 4;

    // Write SHA-1 hash (20 bytes)
    for (let i = 0; i < 20; i++) {
      const byte = parseInt(this.sha.substring(i * 2, (i + 1) * 2), 16);
      buffer[offset++] = byte;
    }

    // Write flags
    const flags = this.encodeFlags(nameLength);
    view.setUint16(offset, flags, false);
    offset += 2;

    // Write filename
    buffer.set(nameBytes, offset);
    offset += nameLength;

    // Null terminator
    buffer[offset] = 0;

    return buffer;
  }

  /**
   * Deserialize an entry from binary data
   */
  static deserialize(data: Uint8Array, offset: number): { entry: IndexEntry; nextOffset: number } {
    const view = new DataView(data.buffer, data.byteOffset + offset);
    let pos = 0;

    const entry = new IndexEntry();

    entry.ctime = [view.getUint32(pos, false), view.getUint32(pos + 4, false)];
    pos += 8;
    entry.mtime = [view.getUint32(pos, false), view.getUint32(pos + 4, false)];
    pos += 8;

    // Read file system metadata
    entry.dev = view.getUint32(pos, false);
    pos += 4;
    entry.ino = view.getUint32(pos, false);
    pos += 4;
    entry.mode = view.getUint32(pos, false);
    pos += 4;
    entry.uid = view.getUint32(pos, false);
    pos += 4;
    entry.gid = view.getUint32(pos, false);
    pos += 4;
    entry.fileSize = view.getUint32(pos, false);
    pos += 4;

    const shaBytes = new Uint8Array(
      data.buffer,
      data.byteOffset + offset + pos,
      IndexEntry.SHA_SIZE
    );
    entry.sha = Array.from(shaBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    pos += IndexEntry.SHA_SIZE;

    const flags = view.getUint16(pos, false);
    pos += 2;
    entry.decodeFlags(flags);

    const nameLength = flags & 0xfff;
    let actualNameLength = nameLength;

    if (nameLength === 0xfff) {
      // Name is at least 4095 bytes, find null terminator
      let nullPos = offset + pos + 0xfff;
      while (nullPos < data.length && data[nullPos] !== 0) {
        nullPos++;
      }
      actualNameLength = nullPos - (offset + pos);
    }

    const nameBytes = new Uint8Array(data.buffer, data.byteOffset + offset + pos, actualNameLength);
    entry.name = new TextDecoder().decode(nameBytes);
    pos += actualNameLength + 1; // +1 for null terminator

    // Calculate next offset (with padding)
    const nextOffset = offset + Math.ceil(pos / 8) * 8;

    return { entry, nextOffset };
  }

  /**
   * Create an index entry from file stats
   */
  public static fromFileStats(path: string, stats: FileStats, sha: string): IndexEntry {
    return new IndexEntry({
      name: path,
      ctime: [Math.floor(stats.ctimeMs / 1000), stats.ctimeMs % 1000],
      mtime: [Math.floor(stats.mtimeMs / 1000), stats.mtimeMs % 1000],
      dev: stats.dev,
      ino: stats.ino,
      mode: stats.mode,
      uid: stats.uid,
      gid: stats.gid,
      fileSize: stats.size,
      sha,
    });
  }

  /**
   * Encode flags into a 16-bit value
   * Bit layout:
   * - Bit 15: assume-valid flag
   * - Bit 14: extended flag (must be 0 for version 2)
   * - Bits 13-12: stage (0-3)
   * - Bits 11-0: name length (max 4095)
   */
  private encodeFlags(nameLength: number): number {
    let flags = 0;

    if (this.assumeValid) {
      flags |= 0x8000;
    }

    flags |= (this.stage & 0x3) << 12;

    // Name length is capped at 4095 (0xfff)
    const cappedLength = Math.min(nameLength, 0xfff);
    flags |= cappedLength;

    return flags;
  }

  /**
   * Decode flags from a 16-bit value
   */
  private decodeFlags(flags: number): void {
    this.assumeValid = (flags & 0x8000) !== 0;
    this.stage = (flags >> 12) & 0x3;

    const extended = (flags & 0x4000) !== 0;
    if (extended) {
      throw new ObjectException('Extended flags not supported');
    }
  }
}
