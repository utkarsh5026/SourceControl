import { ObjectException } from '../exceptions';
import fs from 'fs-extra';
import { GitTimestamp, IndexEntryFlags, IndexEntryLayout } from './index-entry-utils';

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
  private static readonly NULL_TERMINATOR = 0;

  public creationTime: GitTimestamp; // Creation time
  public modificationTime: GitTimestamp; // Modification time

  // File system metadata
  public deviceId: number; // Device ID
  public inodeNumber: number; // Inode number
  public fileMode: number; // File mode (type + permissions)
  public userId: number; // User ID
  public groupId: number; // Group ID
  public fileSize: number; // File size in bytes

  // Git object reference
  public contentHash: string; // SHA-1 hash of the blob

  // Index-specific flags
  public assumeValid: boolean; // Assume file hasn't changed
  public stageNumber: number; // Staging number (0=normal, 1-3=merge conflict)

  // File path (relative to repository root)
  public filePath: string;

  constructor(data: Partial<IndexEntry> = {}) {
    this.creationTime = data.creationTime || new GitTimestamp(0, 0);
    this.modificationTime = data.modificationTime || new GitTimestamp(0, 0);
    this.deviceId = data.deviceId || 0;
    this.inodeNumber = data.inodeNumber || 0;
    this.fileMode = data.fileMode ?? 0o100644;
    this.userId = data.userId || 0;
    this.groupId = data.groupId || 0;
    this.fileSize = data.fileSize || 0;
    this.contentHash = data.contentHash || '';
    this.assumeValid = data.assumeValid || false;
    this.stageNumber = data.stageNumber || 0;
    this.filePath = data.filePath || '';
  }

  /**
   * Get the file mode type (regular file, symlink, gitlink)
   */
  get modeType(): number {
    return (this.fileMode >> 12) & 0b1111;
  }

  /**
   * Get the file permissions (last 9 bits)
   */
  get modePerms(): number {
    return this.fileMode & 0o777;
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
    const thisKey = this.isDirectory ? this.filePath + '/' : this.filePath;
    const otherKey = other.isDirectory ? other.filePath + '/' : other.filePath;

    if (thisKey < otherKey) return -1;
    if (thisKey > otherKey) return 1;
    return 0;
  }

  /**
   * Serialize this entry to binary format for storage in the index file
   */
  serialize(): Uint8Array {
    const filenameBytes = new TextEncoder().encode(this.filePath);
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
    dataView.setUint32(IndexEntryLayout.CTIME_SECONDS_OFFSET, this.creationTime.seconds, false);
    dataView.setUint32(
      IndexEntryLayout.CTIME_NANOSECONDS_OFFSET,
      this.creationTime.nanoseconds,
      false
    );
    dataView.setUint32(IndexEntryLayout.MTIME_SECONDS_OFFSET, this.modificationTime.seconds, false);
    dataView.setUint32(
      IndexEntryLayout.MTIME_NANOSECONDS_OFFSET,
      this.modificationTime.nanoseconds,
      false
    );

    dataView.setUint32(IndexEntryLayout.DEVICE_ID_OFFSET, this.deviceId, false);
    dataView.setUint32(IndexEntryLayout.INODE_OFFSET, this.inodeNumber, false);
    dataView.setUint32(IndexEntryLayout.MODE_OFFSET, this.fileMode, false);
    dataView.setUint32(IndexEntryLayout.USER_ID_OFFSET, this.userId, false);
    dataView.setUint32(IndexEntryLayout.GROUP_ID_OFFSET, this.groupId, false);
    dataView.setUint32(IndexEntryLayout.FILE_SIZE_OFFSET, this.fileSize, false);

    this.writeShaHash(dataView.buffer, IndexEntryLayout.SHA_OFFSET);
    const flags = IndexEntryFlags.encode(this.assumeValid, this.stageNumber, this.filePath.length);
    dataView.setUint16(IndexEntryLayout.FLAGS_OFFSET, flags, false);
  }

  /**
   * Write the SHA-1 hash as binary data
   */
  private writeShaHash(buffer: ArrayBufferLike, offset: number): void {
    const view = new Uint8Array(buffer, offset, IndexEntryLayout.SHA_BYTE_LENGTH);

    for (let i = 0; i < IndexEntryLayout.SHA_BYTE_LENGTH; i++) {
      const hexIndex = i * 2;
      const hexPair = this.contentHash.substring(hexIndex, hexIndex + 2);
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
    const dataView = new DataView(data.buffer, data.byteOffset + offset);
    const entry = new IndexEntry();

    entry.readFixedHeaderFields(dataView);
    const { filename, bytesRead } = this.readVariableFields(data, offset);
    entry.filePath = filename;

    // Calculate next entry offset (padded to 8-byte boundary)
    const entrySize = IndexEntryLayout.FIXED_HEADER_SIZE + bytesRead;
    const nextOffset =
      offset +
      Math.ceil(entrySize / IndexEntryLayout.ALIGNMENT_BOUNDARY) *
        IndexEntryLayout.ALIGNMENT_BOUNDARY;

    return { entry, nextOffset };
  }

  /**
   * Read the variable-length filename
   */
  private static readVariableFields(
    data: Uint8Array,
    baseOffset: number
  ): { filename: string; bytesRead: number } {
    const filenameStartOffset = baseOffset + IndexEntryLayout.FIXED_HEADER_SIZE;

    // Find the null terminator
    let nullTerminatorOffset = filenameStartOffset;
    while (nullTerminatorOffset < data.length && data[nullTerminatorOffset] !== 0) {
      nullTerminatorOffset++;
    }

    if (nullTerminatorOffset >= data.length) {
      throw new ObjectException('Invalid index entry: filename not null-terminated');
    }

    const filenameLength = nullTerminatorOffset - filenameStartOffset;
    const filenameBytes = data.slice(filenameStartOffset, nullTerminatorOffset);
    const filename = new TextDecoder().decode(filenameBytes);

    // Include null terminator in bytes read
    const bytesRead = filenameLength + 1;

    return { filename, bytesRead };
  }

  /**
   * Read the fixed-size header fields from the buffer
   */
  private readFixedHeaderFields(dataView: DataView): void {
    // Read timestamps
    const ctimeSeconds = dataView.getUint32(IndexEntryLayout.CTIME_SECONDS_OFFSET, false);
    const ctimeNanoseconds = dataView.getUint32(IndexEntryLayout.CTIME_NANOSECONDS_OFFSET, false);
    this.creationTime = new GitTimestamp(ctimeSeconds, ctimeNanoseconds);

    const mtimeSeconds = dataView.getUint32(IndexEntryLayout.MTIME_SECONDS_OFFSET, false);
    const mtimeNanoseconds = dataView.getUint32(IndexEntryLayout.MTIME_NANOSECONDS_OFFSET, false);
    this.modificationTime = new GitTimestamp(mtimeSeconds, mtimeNanoseconds);

    // Read file system metadata
    this.deviceId = dataView.getUint32(IndexEntryLayout.DEVICE_ID_OFFSET, false);
    this.inodeNumber = dataView.getUint32(IndexEntryLayout.INODE_OFFSET, false);
    this.fileMode = dataView.getUint32(IndexEntryLayout.MODE_OFFSET, false);
    this.userId = dataView.getUint32(IndexEntryLayout.USER_ID_OFFSET, false);
    this.groupId = dataView.getUint32(IndexEntryLayout.GROUP_ID_OFFSET, false);
    this.fileSize = dataView.getUint32(IndexEntryLayout.FILE_SIZE_OFFSET, false);

    // Read SHA-1 hash
    this.contentHash = this.readShaHash(
      dataView.buffer,
      dataView.byteOffset + IndexEntryLayout.SHA_OFFSET
    );

    // Read and decode flags
    const flagsValue = dataView.getUint16(IndexEntryLayout.FLAGS_OFFSET, false);
    const { assumeValid, stage } = IndexEntryFlags.decode(flagsValue);
    this.assumeValid = assumeValid;
    this.stageNumber = stage;
  }

  /**
   * Read the SHA-1 hash from binary data and convert to hex string
   */
  private readShaHash(buffer: ArrayBufferLike, offset: number): string {
    const view = new Uint8Array(buffer, offset, IndexEntryLayout.SHA_BYTE_LENGTH);
    return Array.from(view)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Create an index entry from file stats
   */
  public static fromFileStats(path: string, stats: FileStats, sha: string): IndexEntry {
    return new IndexEntry({
      filePath: path,
      creationTime: new GitTimestamp(Math.floor(stats.ctimeMs / 1000), stats.ctimeMs % 1000),
      modificationTime: new GitTimestamp(Math.floor(stats.mtimeMs / 1000), stats.mtimeMs % 1000),
      deviceId: stats.dev,
      inodeNumber: stats.ino,
      fileMode: stats.mode,
      userId: stats.uid,
      groupId: stats.gid,
      fileSize: stats.size,
      contentHash: sha,
    });
  }
}
