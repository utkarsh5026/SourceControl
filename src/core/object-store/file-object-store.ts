import type { ObjectStore } from './store';
import { ObjectException } from '../exceptions';
import { CompressionUtils, FileUtils, HashUtils } from '@/utils';
import { Path } from 'glob';
import { GitObject, ObjectType, BlobObject, TreeObject, CommitObject } from '../objects';

/**
 * File-based implementation of Git object storage that mimics Git's internal
 * object database.
 *
 * This class stores Git objects in a directory structure where each object is:
 * 1. Serialized to Git's standard format
 * 2. Compressed using DEFLATE algorithm
 * 3. Stored in a file named by its SHA-1 hash
 *
 * Directory Structure:
 * ┌─ .git/objects/
 * │ ├─ ab/ ← First 2 characters of SHA
 * │ │ └─ cdef123... ← Remaining 38 characters of SHA
 * │ ├─ cd/
 * │ │ └─ ef456789...
 * │ └─ ...
 *
 * Example for SHA "abcdef1234567890abcdef1234567890abcdef12":
 * File path: .git/objects/ab/cdef1234567890abcdef1234567890abcdef12
 *
 * This structure provides efficient storage and lookup while distributing files
 * across subdirectories to avoid filesystem performance issues with too many
 * files in a single directory.
 */
export class FileObjectStore implements ObjectStore {
  private objectsPath: Path | null = null;

  /**
   * Initializes the object store by creating the objects directory structure.
   *
   * Sets up the base objects directory at <gitDir>/objects where all Git objects
   * will be stored. Creates the directory if it doesn't exist.
   */
  async initialize(gitDir: Path): Promise<void> {
    this.objectsPath = gitDir.resolve('objects');
    try {
      await FileUtils.createDirectories(this.objectsPath.toString());
    } catch (error) {
      throw new ObjectException('Failed to initialize object store');
    }
  }

  /**
   * Writes a Git object to the object store.
   *
   * If the object already exists, it returns the SHA-1 hash of the existing object.
   * Otherwise, it compresses the object and writes it to the file system.
   */
  async writeObject(object: GitObject) {
    try {
      const serialized = object.serialize();
      const sha = await HashUtils.sha1Hex(serialized);

      const filePath = this.resolveObjectPath(sha);

      if (await FileUtils.exists(filePath.toString())) {
        return sha;
      }

      const compressed = await CompressionUtils.compress(serialized);
      await FileUtils.createFile(filePath.toString(), compressed);

      return sha;
    } catch (error) {
      throw new ObjectException('Failed to write object');
    }
  }

  /**
   * Reads and reconstructs a Git object from storage using its SHA-1 hash.
   * The method first determines the object type from the header, creates an
   * appropriate object instance, then deserializes the data into that object.
   */
  async readObject(sha: string) {
    if (!sha || sha.length < 3) {
      return null;
    }

    try {
      const filePath = this.resolveObjectPath(sha);
      if (!FileUtils.exists(filePath.toString())) {
        return null;
      }

      const compressed = await FileUtils.readFile(filePath.toString());
      const decompressed = await CompressionUtils.decompress(compressed);

      const object = this.createObjectFromHeader(decompressed);
      object.deserialize(decompressed);

      return object;
    } catch (error) {
      throw new ObjectException(`Failed to read object: ${sha}`);
    }
  }

  /**
   * Checks if a Git object exists in the object store.
   *
   * Returns true if the object exists, false otherwise.
   */
  async hasObject(sha: string) {
    if (!sha || sha.length < 3) {
      return false;
    }

    const filePath = this.resolveObjectPath(sha);
    return FileUtils.exists(filePath.toString());
  }

  /**
   * Converts a SHA-1 hash to the corresponding file path in Git's object storage
   * structure.
   *
   * Git uses a two-level directory structure to avoid having too many files in a
   * single
   * directory, which can cause filesystem performance issues.
   */
  private resolveObjectPath(sha: string) {
    if (!this.objectsPath) {
      throw new ObjectException('Object store not initialized');
    }

    const dirName = sha.substring(0, 2);
    const fileName = sha.substring(2);

    const dirPath = this.objectsPath.resolve(dirName);
    return dirPath.resolve(fileName);
  }

  /**
   * Creates a Git object from the given data.
   *
   * The method first determines the object type from the header, creates an
   * appropriate object instance, then deserializes the data into that object.
   */
  private createObjectFromHeader(data: Uint8Array) {
    let nullIndex = -1;
    for (let i = 0; i < data.length; i++) {
      if (data[i] == 0) {
        nullIndex = i;
        break;
      }
    }

    if (nullIndex == -1) {
      throw new ObjectException('Invalid object format: no null terminator');
    }

    const header = new TextDecoder().decode(data.slice(0, nullIndex));
    const parts = header.split(' ');

    if (parts.length != 2) {
      throw new ObjectException('Invalid object header format');
    }

    const type = parts[0];
    const objectType = ObjectType[type as keyof typeof ObjectType];

    switch (objectType) {
      case ObjectType.BLOB:
        return new BlobObject();
      case ObjectType.TREE:
        return new TreeObject();
      case ObjectType.COMMIT:
        return new CommitObject();
      case ObjectType.TAG:
        // TODO: Implement GitTag
        throw new ObjectException('Tag objects not yet implemented');
      default:
        throw new ObjectException('Unknown object type: ' + type);
    }
  }
}
