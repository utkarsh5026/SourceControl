import { Path } from 'glob';
import fs from 'fs-extra';
import { Repository } from './repo';
import { ObjectStore, FileObjectStore } from '@/core/object-store';
import { FileUtils } from '@/utils';
import { RepositoryException } from './exceptions';
import { GitObject } from '@/core/objects';

/**
 * Git repository implementation that manages the complete Git repository
 * structure
 * and provides access to Git objects, references, and configuration.
 *
 * This class represents a standard Git repository with the following structure:
 * ┌─ <working-directory>/
 * │ ├─ .git/ ← Git metadata directory
 * │ │ ├─ objects/ ← Object storage (blobs, trees, commits, tags)
 * │ │ │ ├─ ab/ ← Object subdirectories (first 2 chars of SHA)
 * │ │ │ │ └─ cdef123... ← Object files (remaining 38 chars of SHA)
 * │ │ │ └─ ...
 * │ │ ├─ refs/ ← References (branches and tags)
 * │ │ │ ├─ heads/ ← Branch references
 * │ │ │ └─ tags/ ← Tag references
 * │ │ ├─ HEAD ← Current branch pointer
 * │ │ ├─ config ← Repository configuration
 * │ │ └─ description ← Repository description
 * │ ├─ file1.txt ← Working directory files
 * │ ├─ file2.txt
 * │ └─ ...
 *
 * The repository manages both the working directory (user files) and the Git
 * directory (metadata and object storage).
 */
export class SourceRepository extends Repository {
  private _workingDirectory: Path | null = null;
  private _gitDirectory: Path | null = null;
  private _objectStore: ObjectStore;

  private static DEFAULT_GIT_DIR = '.source';
  private static DEFAULT_OBJECTS_DIR = 'objects';
  private static DEFAULT_REFS_DIR = 'refs';
  private static DEFAULT_CONFIG_FILE = 'config';

  constructor() {
    super();
    this._objectStore = new FileObjectStore();
  }

  /**
   * Initialize a new repository at the given path
   */
  override async init(path: Path): Promise<void> {
    try {
      this._workingDirectory = path.resolve();
      this._gitDirectory = this._workingDirectory.resolve(SourceRepository.DEFAULT_GIT_DIR);

      if (await SourceRepository.exists(this._workingDirectory)) {
        throw new RepositoryException('Already a git repository: ' + this._workingDirectory);
      }
      const gitDir = this._gitDirectory;

      await this.createDirectories(gitDir);
      await this.createDirectories(gitDir.resolve(SourceRepository.DEFAULT_OBJECTS_DIR));
      await this.createDirectories(gitDir.resolve(SourceRepository.DEFAULT_REFS_DIR));

      await this.createDirectories(
        gitDir.resolve(SourceRepository.DEFAULT_REFS_DIR).resolve('heads')
      );
      await this.createDirectories(
        gitDir.resolve(SourceRepository.DEFAULT_REFS_DIR).resolve('tags')
      );

      await this._objectStore.initialize(this._gitDirectory);
      await this.createInitialFiles();
    } catch (e) {
      if (e instanceof RepositoryException) {
        throw e;
      }
      throw new RepositoryException('Failed to initialize repository: ' + e);
    }
  }

  /**
   * Get the working directory path
   */
  override workingDirectory(): Path {
    if (!this._workingDirectory) {
      throw new RepositoryException('Repository not initialized');
    }
    return this._workingDirectory;
  }

  /**
   * Get the .git directory path
   */
  override gitDirectory(): Path {
    if (!this._gitDirectory) {
      throw new RepositoryException('Repository not initialized');
    }
    return this._gitDirectory;
  }

  /**
   * Get the object store
   */
  override objectStore(): ObjectStore {
    return this._objectStore;
  }

  /**
   * Read an object from the repository
   */
  override async readObject(sha: string): Promise<GitObject | null> {
    try {
      return await this._objectStore.readObject(sha);
    } catch {
      throw new RepositoryException('Failed to read object');
    }
  }

  /**
   * Write an object to the repository
   */
  override async writeObject(object: GitObject): Promise<string> {
    try {
      return await this._objectStore.writeObject(object);
    } catch {
      throw new RepositoryException('Failed to write object');
    }
  }

  /**
   * Find repository by walking up the directory tree from current path
   */
  public static async findRepository(startPath: Path): Promise<SourceRepository | null> {
    let current: Path | null = startPath.resolve();

    while (current != null) {
      if (await SourceRepository.exists(current)) {
        const repo = new SourceRepository();
        repo._workingDirectory = current;
        repo._gitDirectory = current.resolve(SourceRepository.DEFAULT_GIT_DIR);
        try {
          await repo._objectStore.initialize(repo._gitDirectory);
        } catch {
          return null;
        }
        return repo;
      }
      current = current.parent || null;
    }

    return null;
  }

  /**
   * Create initial files for the repository
   */
  private async createInitialFiles() {
    if (!this._gitDirectory) {
      throw new RepositoryException('Repository not initialized');
    }

    const headContent = 'ref: refs/heads/master\n';
    await this.createFile(this._gitDirectory.resolve('HEAD'), headContent);

    const description =
      "Unnamed repository; edit this file 'description' to name the repository.\n";
    await this.createFile(this._gitDirectory.resolve('description'), description);

    const config =
      '[core]\n' +
      '    repositoryformatversion = 0\n' +
      '    filemode = false\n' +
      '    bare = false\n';
    await this.createFile(this._gitDirectory.resolve(SourceRepository.DEFAULT_CONFIG_FILE), config);
  }

  private async createDirectories(path: Path) {
    await FileUtils.createDirectories(path.fullpath());
  }

  private async createFile(path: Path, content: string) {
    await FileUtils.createFile(path.fullpath(), content);
  }

  /**
   * Check if repository exists at path
   */
  static async exists(path: Path): Promise<boolean> {
    return await fs.pathExists(path.resolve(SourceRepository.DEFAULT_GIT_DIR).fullpath());
  }
}
