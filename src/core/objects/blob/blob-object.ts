import { GitObject, ObjectType } from '../base';
import { HashUtils } from '@/utils';
import { ObjectException } from '@/core/exceptions';

/**
 * BLOB (Binary Large Object) - Represents the content of a file.
 * Stores the actual file data without any metadata like filename or
 * permissions.
 * Each unique file content gets its own blob object, identified by a SHA-1
 * hash.
 *
 * Visual representation of serialized format:
 * ┌─────────────────────────────────────────────────────┐
 * │ "blob" │ SPACE │ size │ NULL │ content bytes...     │
 * └─────────────────────────────────────────────────────┘
 *
 * Example for "Hello World" content:
 * ┌──────────────────────────────────────────────────────┐
 * │ "blob 11\0Hello World"                               │
 * │ ^     ^  ^                                           │
 * │ │     │  └─ null terminator (0x00)                   │
 * │ │     └─ size as string                              │
 * │ └─ object type                                       │
 * └──────────────────────────────────────────────────────┘
 *
 */
export class BlobObject extends GitObject {
  private _content: Uint8Array;
  private _sha: string | null;

  constructor(content?: Uint8Array, sha?: string) {
    super();
    this._content = content?.slice() || new Uint8Array();
    this._sha = sha || null;
  }

  override type(): ObjectType {
    return ObjectType.BLOB;
  }

  override content(): Uint8Array {
    return new Uint8Array(this._content);
  }

  override async sha(): Promise<string> {
    if (this._sha) {
      return this._sha;
    }
    this._sha = await HashUtils.sha1Hex(this._content);
    return this._sha;
  }

  override size(): number {
    return this._content.length;
  }

  /**
   * Deserialize the blob object from the given data.
   */
  override async deserialize(data: Uint8Array): Promise<void> {
    try {
      const { type, contentStartsAt, contentLength } = this.parseHeader(data);
      if (type !== ObjectType.BLOB) {
        throw new ObjectException('Invalid blob object: invalid type');
      }

      this._content = data.slice(contentStartsAt, contentStartsAt + contentLength);
      this._sha = await HashUtils.sha1Hex(this._content);
    } catch (e) {
      throw new ObjectException('Invalid blob object: ' + (e as Error).message);
    }
  }
}
