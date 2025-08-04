import { GitObject, ObjectType } from '../base';
import { sha1Hex } from '@/utils/hash';
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
    this._sha = await sha1Hex(this._content);
    return this._sha;
  }

  override size(): number {
    return this._content.length;
  }

  /**
   * Deserialize the blob object from the given data.
   */
  override async deserialize(data: Uint8Array): Promise<void> {
    const getNullIndex = () => {
      let nullIndex = -1;
      for (let i = 0; i < data.length; i++) {
        if (data[i] == 0) {
          nullIndex = i;
          break;
        }
      }
      return nullIndex;
    };
    try {
      const nullIndex = getNullIndex();
      if (nullIndex === -1) {
        throw new ObjectException('Invalid blob object: no null terminator found');
      }

      const header = new TextDecoder('utf-8').decode(data.slice(0, nullIndex));
      const headerParts = header.split(' ');

      const [type, size] = headerParts;
      if (!size) {
        throw new ObjectException('Invalid blob object: invalid size');
      }

      if (type !== ObjectType.BLOB.toString()) {
        throw new ObjectException('Invalid blob object: invalid type');
      }

      const contentLength = data.length - nullIndex - 1;

      if (contentLength !== parseInt(size)) {
        throw new ObjectException(`Content size mismatch expected: ${size}, got ${contentLength}`);
      }

      this._content = data.slice(nullIndex + 1, nullIndex + 1 + contentLength);
      this._sha = await sha1Hex(this._content);
    } catch (e) {
      throw new ObjectException('Invalid blob object: ' + (e as Error).message);
    }
  }
}
