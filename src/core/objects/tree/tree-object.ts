import { GitObject } from '../base';
import { TreeEntry } from './tree-entry';
import { ObjectType } from '../base';
import { HashUtils } from '@/utils';
import { ObjectException } from '@/core/exceptions';

/**
 * Git Tree Object Implementation
 *
 * A tree object represents a directory snapshot in Git. It contains entries for
 * files and subdirectories, each with their mode, name, and SHA-1 hash.
 *
 * Tree Object Structure:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Header: "tree" SPACE size NULL                                  │
 * │ Entry 1: mode SPACE name NULL [20-byte SHA-1]                   │
 * │ Entry 2: mode SPACE name NULL [20-byte SHA-1]                   │
 * │ ...                                                             │
 * │ Entry N: mode SPACE name NULL [20-byte SHA-1]                   │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Example tree object content (without header):
 * "100644 README.md\0[20 bytes]040000 src\0[20 bytes]100755 build.sh\0[20 bytes]"
 *
 * Tree objects are essential for Git's content tracking because they:
 * 1. Preserve directory structure and file organization
 * 2. Track file permissions and types
 * 3. Enable efficient diff calculations between directory states
 * 4. Form the backbone of commit objects (each commit points to a root tree)
 *
 * Sorting Rules:
 * Git sorts tree entries in a specific way to ensure deterministic hashes:
 * - Entries are sorted lexicographically by name
 * - Directories are treated as if they have a trailing "/"
 * - This ensures that "file" comes before "file.txt" and "dir/" comes before "dir2"
 */
export class TreeObject extends GitObject {
  private _entries: TreeEntry[];
  private _sha: string | null;

  constructor(entries: TreeEntry[] = []) {
    super();
    this._entries = entries;
    this._sha = null;
    this.sortEntries();
  }

  override type(): ObjectType {
    return ObjectType.TREE;
  }

  override size(): number {
    return this.content().length;
  }

  override content(): Uint8Array {
    return this.serializeContent();
  }

  override async sha(): Promise<string> {
    if (this._sha) return this._sha;
    this._sha = await HashUtils.sha1Hex(this.content());
    return this._sha;
  }

  private sortEntries(): void {
    this._entries.sort((a, b) => a.compareTo(b));
  }

  /**
   * Deserialize a tree object from a byte array
   */
  override async deserialize(data: Uint8Array): Promise<void> {
    const { type, contentStartsAt, contentLength } = this.parseHeader(data);
    if (type !== ObjectType.TREE) {
      throw new ObjectException('Invalid tree object: invalid type');
    }

    const content = data.slice(contentStartsAt, contentStartsAt + contentLength);
    this._entries = this.parseEntries(content, contentStartsAt, contentLength);
    this.sortEntries();
    this._sha = await HashUtils.sha1Hex(this.content());
  }

  isEmpty(): boolean {
    return this._entries.length === 0;
  }

  private serializeContent(): Uint8Array {
    if (this._entries.length === 0) return new Uint8Array(0);

    const totalSize = this._entries.reduce((acc, entry) => acc + entry.serialize().length, 0);

    const serialized = new Uint8Array(totalSize);
    let offset = 0;

    for (const entry of this._entries) {
      const serializedEntry = entry.serialize();
      serialized.set(serializedEntry, offset);
      offset += serializedEntry.length;
    }

    return serialized;
  }

  private parseEntries(content: Uint8Array, start: number, length: number): TreeEntry[] {
    const entries: TreeEntry[] = [];
    let offset = start;
    const endOffset = start + length;

    while (offset < endOffset) {
      const { entry, nextOffset } = TreeEntry.deserialize(content, offset);
      entries.push(entry);
      offset = nextOffset;
    }

    if (offset !== endOffset) {
      throw new ObjectException('Invalid tree object: invalid entries');
    }

    return entries;
  }
}
