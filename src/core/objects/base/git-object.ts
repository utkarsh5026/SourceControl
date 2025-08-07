import { ObjectType, ObjectTypeHelper } from './object-type';
import { ObjectException } from '@/core/exceptions';

/**
 * Abstract base class for all Git objects (blob, tree, commit, tag).
 *
 * In Git's internal storage system, everything is stored as objects with a specific format:
 * - Header: "<type> <size>\0" (e.g., "blob 12\0")
 * - Content: The actual object data
 *
 * This class provides the common functionality shared by all Git object types,
 * including serialization (converting to bytes for storage) and deserialization
 * (reading from stored bytes back into objects).
 *
 * Each Git object has:
 * - A type (blob for files, tree for directories, commit for snapshots, tag for labels)
 * - Content (the actual data being stored)
 * - A SHA-1 hash (unique identifier calculated from type + size + content)
 * - A size (number of bytes in the content)
 *
 */
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
  abstract sha(): Promise<string>;

  /**
   * Get the size of the object content in bytes
   */
  abstract size(): number;

  /**
   * Deserialize object from raw data
   */
  abstract deserialize(data: Uint8Array): Promise<void>;

  /**
   * Converts this object into the Git storage format (header + content).
   *
   * This creates the exact byte sequence that Git stores in .git/objects/.
   * The format is: "<type> <size>\0<content>"
   *
   * For example, a blob containing "Hello World" becomes:
   * "blob 11\0Hello World" (where \0 is a null byte)
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
      throw new ObjectException(
        'Failed to serialize ' + ObjectTypeHelper.getTypeName(this.type()).toLowerCase()
      );
    }
  }

  /**
   * Parses and validates the Git object header from raw data.
   *
   * Git objects start with a header in the format: "<type> <size>\0"
   * This method:
   * 1. Finds the null terminator that ends the header
   * 2. Extracts and parses the type and size
   * 3. Validates the type matches what this object expects
   * 4. Validates the size matches the actual content length
   * 5. Returns information about where the content starts
   */
  protected parseHeader(data: Uint8Array) {
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

    const objectType = this.type();
    const nullIndex = getNullIndex();
    if (nullIndex === -1) {
      throw new ObjectException(
        `Invalid ${objectType.toString().toLowerCase()} object: no null terminator found`
      );
    }

    const header = new TextDecoder('utf-8').decode(data.slice(0, nullIndex));
    const [type, size] = header.split(' ');

    if (!size) {
      throw new ObjectException(`Invalid ${objectType.toString()}: invalid size`);
    }

    if (type != objectType) {
      throw new ObjectException(
        `Invalid ${objectType.toString().toLowerCase()} object: invalid type`
      );
    }

    const contentLength = data.length - nullIndex - 1;
    if (contentLength !== parseInt(size)) {
      throw new ObjectException(`Content size mismatch expected: ${size}, got ${contentLength}`);
    }

    return {
      type,
      contentStartsAt: nullIndex + 1,
      contentLength,
    };
  }
}
