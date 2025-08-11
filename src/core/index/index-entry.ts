import { ObjectException } from '../exceptions';
import fs from 'fs-extra';
import { IndexEntryFlags, IndexEntryLayout } from './index-entry-utils';

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
  private static readonly SHA_SIZE = 20;
  private static readonly NULL_TERMINATOR = 0;

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
    const filenameBytes = new TextEncoder().encode(this.name);
    const filenameLength = filenameBytes.length;

    // Calculate total size including padding to 8-byte boundary
    const entrySize = IndexEntryLayout.FIXED_HEADER_SIZE + filenameLength + 1; // +1 for null terminator
    const paddedSize =
      Math.ceil(entrySize / IndexEntryLayout.ALIGNMENT_BOUNDARY) *
      IndexEntryLayout.ALIGNMENT_BOUNDARY;

    const buffer = new Uint8Array(paddedSize);
    const dataView = new DataView(buffer.buffer);

    this.writeFixedHeaderFields(dataView);
    this.writeVariableFields(buffer, filenameBytes, filenameLength);

    return buffer;
  }

  /**
   * Write the fixed-size header fields to the buffer
   */
  private writeFixedHeaderFields(dataView: DataView): void {
    dataView.setUint32(IndexEntryLayout.CTIME_SECONDS_OFFSET, this.ctime[0], false);
    dataView.setUint32(IndexEntryLayout.CTIME_NANOSECONDS_OFFSET, this.ctime[1], false);
    dataView.setUint32(IndexEntryLayout.MTIME_SECONDS_OFFSET, this.mtime[0], false);
    dataView.setUint32(IndexEntryLayout.MTIME_NANOSECONDS_OFFSET, this.mtime[1], false);

    dataView.setUint32(IndexEntryLayout.DEVICE_ID_OFFSET, this.dev, false);
    dataView.setUint32(IndexEntryLayout.INODE_OFFSET, this.ino, false);
    dataView.setUint32(IndexEntryLayout.MODE_OFFSET, this.mode, false);
    dataView.setUint32(IndexEntryLayout.USER_ID_OFFSET, this.uid, false);
    dataView.setUint32(IndexEntryLayout.GROUP_ID_OFFSET, this.gid, false);
    dataView.setUint32(IndexEntryLayout.FILE_SIZE_OFFSET, this.fileSize, false);

    this.writeShaHash(dataView.buffer, IndexEntryLayout.SHA_OFFSET);
    const flags = IndexEntryFlags.encode(this.assumeValid, this.stage, this.name.length);
    dataView.setUint16(IndexEntryLayout.FLAGS_OFFSET, flags, false);
  }

  /**
   * Write the SHA-1 hash as binary data
   */
  private writeShaHash(buffer: ArrayBufferLike, offset: number): void {
    const view = new Uint8Array(buffer, offset, IndexEntryLayout.SHA_BYTE_LENGTH);

    for (let i = 0; i < IndexEntryLayout.SHA_BYTE_LENGTH; i++) {
      const hexIndex = i * 2;
      const hexPair = this.sha.substring(hexIndex, hexIndex + 2);
      view[i] = parseInt(hexPair, 16);
    }
  }

  /**
   * Write the variable-length filename and null terminator
   */
  private writeVariableFields(
    buffer: Uint8Array,
    filenameBytes: Uint8Array,
    filenameLength: number
  ): void {
    const filenameOffset = IndexEntryLayout.FIXED_HEADER_SIZE;
    buffer.set(filenameBytes, filenameOffset);
    buffer[filenameOffset + filenameLength] = IndexEntry.NULL_TERMINATOR;
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
