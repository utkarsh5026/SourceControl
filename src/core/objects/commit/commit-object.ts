import { ObjectException } from '@/core/exceptions';
import { GitObject, ObjectType } from '../base';
import { CommitPerson } from './commit-person';

export type CommitCreateOptions = {
  treeSha: string;
  parentShas?: string[];
  author: CommitPerson;
  committer: CommitPerson;
  message: string;
  sha?: string;
};

/**
 * Git Commit Object Implementation
 *
 * A commit object represents a snapshot in the repository's history. It contains:
 * - A reference to a tree object (the root directory snapshot)
 * - Zero or more parent commit references
 * - Author information (who wrote the changes)
 * - Committer information (who committed the changes)
 * - A commit message describing the changes
 *
 * Commit Object Structure:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Header: "commit" SPACE size NULL                                │
 * │ "tree" SPACE tree-sha LF                                        │
 * │ "parent" SPACE parent-sha LF (zero or more)                     │
 * │ "author" SPACE name SPACE email SPACE timestamp SPACE tz LF     │
 * │ "committer" SPACE name SPACE email SPACE timestamp SPACE tz LF  │
 * │ LF                                                              │
 * │ commit-message                                                  │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Example commit object content:
 * tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904
 * author John Doe <john@example.com> 1609459200 +0000
 * committer John Doe <john@example.com> 1609459200 +0000
 *
 * Initial commit
 *
 * Commits form a directed acyclic graph (DAG) where:
 * - Each commit points to its parent(s)
 * - Most commits have exactly one parent
 * - Merge commits have multiple parents
 * - The initial commit has no parents
 * - The graph represents the complete history of the repository
 */
export class CommitObject extends GitObject {
  private _treeSha: string | null = null;
  private _parentShas: string[] = [];
  private _author: CommitPerson | null = null;
  private _committer: CommitPerson | null = null;
  private _message: string | null = null;
  private _sha: string | null = null;

  constructor(commit?: CommitCreateOptions) {
    super();
    if (!commit) return;

    if (commit.treeSha != null) {
      this._treeSha = this.validateSha(commit.treeSha);
    }

    if (Array.isArray(commit.parentShas)) {
      this._parentShas = commit.parentShas.map((p) => this.validateSha(p));
    }

    this._author = commit.author ?? null;
    this._committer = commit.committer ?? null;
    this._message = commit.message ?? '';
    this._sha = commit.sha ?? null;
  }

  /**
   * Get the type of this commit object
   */
  override type(): ObjectType {
    return ObjectType.COMMIT;
  }

  /**
   * Get the SHA-1 hash of this commit object
   */
  override async sha(): Promise<string> {
    if (this._sha != null) {
      return this._sha;
    }
    const sha = await super.sha();
    this._sha = sha;
    return this._sha;
  }

  /**
   * Get the content of this commit object
   */
  override content(): Uint8Array {
    return this.serializeContent();
  }

  /**
   * Deserialize the commit object
   */
  override async deserialize(data: Uint8Array): Promise<void> {
    try {
      const { type, contentStartsAt, contentLength } = this.parseHeader(data);
      if (type !== ObjectType.COMMIT) {
        throw new ObjectException(`Expected commit type, got: ${type}`);
      }

      const content = new TextDecoder().decode(
        data.slice(contentStartsAt, contentStartsAt + contentLength)
      );
      this.parseCommitContent(content);
      this._sha = null;
    } catch (e) {
      throw new ObjectException('Failed to deserialize commit');
    }
    return Promise.resolve();
  }

  /**
   * Get the size of the content of this commit object
   */
  override size(): number {
    return this.content().length;
  }

  /**
   * Serialize the content of this commit object
   */
  private serializeContent(): Uint8Array {
    const content = [];
    if (this.treeSha == null) {
      throw new ObjectException('Tree SHA is required for commit');
    }
    content.push('tree '.concat(this.treeSha, '\n'));

    for (const parentSha of this.parentShas) {
      content.push('parent '.concat(parentSha, '\n'));
    }

    if (this._author == null) {
      throw new ObjectException('Author is required for commit');
    }
    content.push('author '.concat(this._author.formatForGit(), '\n'));

    if (this._committer == null) {
      throw new ObjectException('Committer is required for commit');
    }
    content.push('committer '.concat(this._committer.formatForGit(), '\n'));

    content.push('\n');
    content.push(this._message);

    return new TextEncoder().encode(content.join(''));
  }

  /**
   * Parse the commit content
   */
  private parseCommitContent(content: string) {
    const lines = content.split('\n');
    let messageStartIndex = -1;
    this.resetFields();

    for (const [index, line] of lines.entries()) {
      if (line.trim().length === 0) {
        messageStartIndex = index + 1;
        break;
      }

      if (line.startsWith('tree ')) this.parseTreeLine(line, 5);
      else if (line.startsWith('parent ')) this.parseParentLine(line, 7);
      else if (line.startsWith('author ')) this.parseAuthorLine(line, 7);
      else if (line.startsWith('committer ')) this.parseCommitterLine(line, 10);
      else throw new ObjectException(`Unknown header line: ${line}`);
    }

    this.validateParsedFields();

    this._message =
      messageStartIndex != -1 && messageStartIndex < lines.length
        ? lines.slice(messageStartIndex).join('\n')
        : null;
  }

  /**
   * Reset all fields to their initial state
   */
  private resetFields(): void {
    this._treeSha = null;
    this._parentShas = [];
    this._author = null;
    this._committer = null;
    this._message = null;
  }

  /**
   * Parse author line
   */
  private parseAuthorLine(line: string, prefixLength: number): void {
    if (this._author !== null) {
      throw new ObjectException('Multiple author entries found');
    }

    const authorData = line.substring(prefixLength);
    this._author = CommitPerson.parseFromGit(authorData);
  }

  /**
   * Parse committer line
   */
  private parseCommitterLine(line: string, prefixLength: number): void {
    if (this._committer !== null) {
      throw new ObjectException('Multiple committer entries found');
    }

    const committerData = line.substring(prefixLength);
    this._committer = CommitPerson.parseFromGit(committerData);
  }

  /**
   * Parse tree line
   */
  private parseTreeLine(line: string, prefixLength: number): void {
    if (this._treeSha !== null) {
      throw new ObjectException('Multiple tree entries found');
    }

    this._treeSha = line.substring(prefixLength);
    this.validateSha(this._treeSha);
  }

  /**
   * Parse parent line
   */
  private parseParentLine(line: string, prefixLength: number): void {
    const parentSha = line.substring(prefixLength);
    this.validateSha(parentSha);
    this._parentShas.push(parentSha);
  }

  /**
   * Validate that all required fields are present after parsing
   */
  private validateParsedFields(): void {
    if (this._treeSha === null) {
      throw new ObjectException('Tree SHA is required');
    }
    if (this._author === null) {
      throw new ObjectException('Author is required');
    }
    if (this._committer === null) {
      throw new ObjectException('Committer is required');
    }
  }

  get treeSha(): string | null {
    return this._treeSha;
  }
  get parentShas(): string[] {
    return this._parentShas;
  }
  get author(): CommitPerson | null {
    return this._author;
  }
  get committer(): CommitPerson | null {
    return this._committer;
  }
  get message(): string | null {
    return this._message;
  }
}
