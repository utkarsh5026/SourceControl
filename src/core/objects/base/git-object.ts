import { ObjectType, ObjectTypeHelper } from './object-type';

export abstract class GitObject {
  /**
   * Get the object type (blob, tree, commit, tag)
   */
  abstract type(): ObjectType;

  /**
   * Get the raw object content (without header)
   */
  abstract content(): Uint8Array;

  /**
   * Get the SHA-1 hash of this object
   */
  abstract sha(): string;

  /**
   * Get the size of the object content in bytes
   */
  abstract size(): number;

  /**
   * Deserialize object from raw data
   */
  abstract deserialize(data: Uint8Array): void;

  /**
   * Serialize object to byte array for storage (with header)
   * Default implementation that can be used by all Git objects
   */
  serialize(): Uint8Array {
    try {
      const content = this.content();
      const header = this.type().toString() + ' ' + content.length + '\0';
      const headerBytes = new TextEncoder().encode(header);

      const result = new Uint8Array(headerBytes.length + content.length);
      result.set(headerBytes, 0);
      result.set(content, headerBytes.length);

      return result;
    } catch (e) {
      throw new Error(
        'Failed to serialize ' + ObjectTypeHelper.getTypeName(this.type()).toLowerCase(),
        e as Error
      );
    }
  }
}
