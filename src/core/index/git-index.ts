import { IndexEntry } from './index-entry';
import { FileUtils } from '@/utils';
import { createHash } from 'crypto';
import { ObjectException } from '../exceptions';

/**
 * The Git Index (Staging Area) - The bridge between working directory and commits.
 *
 * The index is Git's "staging area" - a snapshot of your working directory that
 * you're building up for your next commit. It's stored as a binary file at .git/index.
 *
 * Key Concepts:
 * 1. **Three Trees**: Git manages three trees:
 *    - Working Directory: Your actual files
 *    - Index (Staging Area): What will go into the next commit
 *    - HEAD: The last commit
 *
 * 2. **Performance**: The index caches file metadata (timestamps, size, etc.)
 *    so Git can quickly detect which files have changed without reading content.
 *
 * 3. **Atomic Commits**: Changes are staged incrementally, allowing precise
 *    control over what goes into each commit.
 *
 * Index File Format:
 * ┌────────────────────────────────────────┐
 * │ Header (12 bytes)                      │
 * │   Signature: "DIRC" (4 bytes)          │
 * │   Version: 2 (4 bytes)                 │
 * │   Entry Count: N (4 bytes)             │
 * ├────────────────────────────────────────┤
 * │ Entries (variable length)              │
 * │   Entry 1                              │
 * │   Entry 2                              │
 * │   ...                                  │
 * │   Entry N                              │
 * ├────────────────────────────────────────┤
 * │ Extensions (optional)                  │
 * ├────────────────────────────────────────┤
 * │ SHA-1 Checksum (20 bytes)              │
 * └────────────────────────────────────────┘
 */
export class GitIndex {
  private static readonly SIGNATURE = 'DIRC';
  private static readonly VERSION = 2;
  private static readonly HEADER_SIZE = 12;
  private static readonly CHECKSUM_SIZE = 20;

  public version: number;
  public entries: IndexEntry[];

  constructor(version: number = GitIndex.VERSION, entries: IndexEntry[] = []) {
    this.version = version;
    this.entries = entries;
    this.sortEntries();
  }

  /**
   * Read an index file from disk
   */
  static async read(indexPath: string): Promise<GitIndex> {
    if (!(await FileUtils.exists(indexPath))) {
      return new GitIndex();
    }

    const data = await FileUtils.readFile(indexPath);
    return GitIndex.deserialize(new Uint8Array(data));
  }

  /**
   * Write the index to disk
   */
  async write(indexPath: string): Promise<void> {
    const data = this.serialize();
    await FileUtils.createFile(indexPath, data);
  }

  /**
   * Get all entry names
   */
  entryNames(): string[] {
    return this.entries.map((e) => e.name);
  }

  /**
   * Clear the index (remove all entries)
   */
  public clear(): void {
    this.entries = [];
  }

  /**
   * Serialize the index to binary format
   */
  serialize(): Uint8Array {
    const entriesSize = this.entries.reduce((sum, entry) => {
      const entryData = entry.serialize();
      return sum + entryData.length;
    }, 0);

    const totalSize = GitIndex.HEADER_SIZE + entriesSize + GitIndex.CHECKSUM_SIZE;
    const buffer = new Uint8Array(totalSize);
    const view = new DataView(buffer.buffer);

    let offset = 0;

    // Write header
    // Signature: "DIRC"
    buffer[offset++] = 0x44; // 'D'
    buffer[offset++] = 0x49; // 'I'
    buffer[offset++] = 0x52; // 'R'
    buffer[offset++] = 0x43; // 'C'

    // Version
    view.setUint32(offset, this.version, false);
    offset += 4;

    // Entry count
    view.setUint32(offset, this.entries.length, false);
    offset += 4;

    this.entries.forEach((entry) => {
      const entryData = entry.serialize();
      buffer.set(entryData, offset);
      offset += entryData.length;
    });

    const contentHash = buffer.slice(0, offset);
    const checksum = createHash('sha1').update(contentHash).digest();
    buffer.set(checksum, offset);

    return buffer;
  }

  /**
   * Deserialize an index from binary data
   */
  static deserialize(data: Uint8Array): GitIndex {
    const view = new DataView(data.buffer, data.byteOffset);
    let offset = 0;

    const signature = new TextDecoder().decode(data.slice(0, 4));
    if (signature !== GitIndex.SIGNATURE) {
      throw new ObjectException(`Invalid index signature: ${signature}`);
    }
    offset += 4;

    const entryCount = view.getUint32(offset, false);
    offset += 4;

    const entries: IndexEntry[] = [];
    for (let i = 0; i < entryCount; i++) {
      const { entry, nextOffset } = IndexEntry.deserialize(data, offset);
      entries.push(entry);
      offset = nextOffset;
    }

    const contentSize = data.length - GitIndex.CHECKSUM_SIZE;
    const content = data.slice(0, contentSize);

    const expectedChecksum = data.slice(contentSize);
    const actualChecksum = createHash('sha1').update(content).digest();

    if (!GitIndex.compareChecksums(expectedChecksum, actualChecksum)) {
      throw new ObjectException('Index checksum mismatch');
    }

    return new GitIndex(GitIndex.VERSION, entries);
  }

  /**
   * Check if the index has been modified compared to file stats
   * This is used to detect changes between the index and working directory
   */
  isEntryModified(
    entry: IndexEntry,
    stats: {
      mtimeMs: number;
      size: number;
    }
  ): boolean {
    if (entry.fileSize !== stats.size) {
      return true;
    }

    const mtimeSeconds = Math.floor(stats.mtimeMs / 1000);
    if (entry.mtime[0] !== mtimeSeconds) {
      return true;
    }

    if (entry.assumeValid) {
      return false;
    }

    // For more accurate detection, we'd need to actually read
    // the file and compare SHA-1, but this is good enough for
    // basic change detection
    return false;
  }

  /**
   * Compare two checksums
   */
  private static compareChecksums(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Sort entries according to Git's rules
   * Git sorts by name, treating directories as having a trailing '/'
   */
  private sortEntries(): void {
    this.entries.sort((a, b) => a.compareTo(b));
  }
}
