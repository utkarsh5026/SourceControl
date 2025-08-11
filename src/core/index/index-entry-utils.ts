import { ObjectException } from '../exceptions';

/**
 * Git Index Entry Binary Layout Constants
 *
 * Git stores each index entry in a specific binary format for efficiency.
 * Understanding this layout is crucial for serialization/deserialization.
 */
export class IndexEntryLayout {
  static readonly CTIME_SECONDS_OFFSET = 0;
  static readonly CTIME_NANOSECONDS_OFFSET = 4;
  static readonly MTIME_SECONDS_OFFSET = 8;
  static readonly MTIME_NANOSECONDS_OFFSET = 12;
  static readonly DEVICE_ID_OFFSET = 16;
  static readonly INODE_OFFSET = 20;
  static readonly MODE_OFFSET = 24;
  static readonly USER_ID_OFFSET = 28;
  static readonly GROUP_ID_OFFSET = 32;
  static readonly FILE_SIZE_OFFSET = 36;
  static readonly SHA_OFFSET = 40;
  static readonly FLAGS_OFFSET = 60;

  // Size constants
  static readonly FIXED_HEADER_SIZE = 62; // Everything before filename
  static readonly SHA_BYTE_LENGTH = 20; // SHA-1 is always 20 bytes
  static readonly FLAGS_BYTE_LENGTH = 2; // Flags are 2 bytes
  static readonly FIELD_SIZE_BYTES = 4; // Most fields are 4 bytes
  static readonly ALIGNMENT_BOUNDARY = 8; // Entries are padded to 8-byte boundaries

  // Maximum values
  static readonly MAX_FILENAME_LENGTH = 0xfff; // 4095 bytes max filename in flags
}

/**
 * Git File Mode Constants and Utilities
 *
 * Git stores file type and permissions in a single 32-bit mode field.
 * The upper 4 bits indicate the file type, lower bits contain permissions.
 */
export class GitFileMode {
  // File type masks (upper 4 bits of mode >> 12)
  static readonly TYPE_MASK = 0b1111;
  static readonly TYPE_SHIFT = 12;

  // File type constants
  static readonly REGULAR_FILE_TYPE = 0b1000; // 0x8000 - regular file
  static readonly SYMBOLIC_LINK_TYPE = 0b1010; // 0xA000 - symbolic link
  static readonly GITLINK_TYPE = 0b1110; // 0xE000 - gitlink (submodule)
  static readonly DIRECTORY_TYPE = 0b0000; // 0x0000 - directory (rare in index)

  // Permission masks
  static readonly PERMISSION_MASK = 0o777; // Lower 9 bits for permissions
  static readonly EXECUTABLE_MASK = 0o111; // Execute bits for owner/group/other

  // Common mode values that Git uses
  static readonly DEFAULT_FILE_MODE = 0o100644; // Regular file, rw-r--r--
  static readonly EXECUTABLE_FILE_MODE = 0o100755; // Executable file, rwxr-xr-x

  /**
   * Extract the file type from a Git mode value
   */
  static getFileType(mode: number): number {
    return (mode >> this.TYPE_SHIFT) & this.TYPE_MASK;
  }

  /**
   * Extract the permission bits from a Git mode value
   */
  static getPermissions(mode: number): number {
    return mode & this.PERMISSION_MASK;
  }

  /**
   * Check if a mode represents a regular file
   */
  static isRegularFile(mode: number): boolean {
    return this.getFileType(mode) === this.REGULAR_FILE_TYPE;
  }

  /**
   * Check if a mode represents a symbolic link
   */
  static isSymbolicLink(mode: number): boolean {
    return this.getFileType(mode) === this.SYMBOLIC_LINK_TYPE;
  }

  /**
   * Check if a mode represents a gitlink (submodule)
   */
  static isGitlink(mode: number): boolean {
    return this.getFileType(mode) === this.GITLINK_TYPE;
  }

  /**
   * Check if a mode represents a directory
   */
  static isDirectory(mode: number): boolean {
    return this.getFileType(mode) === this.DIRECTORY_TYPE;
  }

  /**
   * Check if the file has execute permissions
   */
  static isExecutable(mode: number): boolean {
    return (this.getPermissions(mode) & this.EXECUTABLE_MASK) !== 0;
  }
}

/**
 * Git Index Entry Flags Utilities
 *
 * The flags field contains several pieces of information packed into 16 bits:
 * - Bit 15: assume-valid flag
 * - Bit 14: extended flag (must be 0 for version 2)
 * - Bits 13-12: stage number (0-3, for merge conflicts)
 * - Bits 11-0: filename length (max 4095)
 */
export class IndexEntryFlags {
  static readonly ASSUME_VALID_BIT = 15;
  static readonly ASSUME_VALID_MASK = 0x8000;

  static readonly EXTENDED_BIT = 14;
  static readonly EXTENDED_MASK = 0x4000;

  static readonly STAGE_SHIFT = 12;
  static readonly STAGE_MASK = 0x3000;

  static readonly FILENAME_LENGTH_MASK = 0x0fff;
  static readonly MAX_FILENAME_LENGTH = 0x0fff;

  /**
   * Encode flags from individual components
   */
  static encode(assumeValid: boolean, stage: number, filenameLength: number): number {
    let flags = 0;

    if (assumeValid) {
      flags |= this.ASSUME_VALID_MASK;
    }

    flags |= (stage & 0x3) << this.STAGE_SHIFT;

    const cappedLength = Math.min(filenameLength, this.MAX_FILENAME_LENGTH);
    flags |= cappedLength;

    return flags;
  }

  /**
   * Decode flags into individual components
   */
  static decode(flags: number): { assumeValid: boolean; stage: number; filenameLength: number } {
    const assumeValid = (flags & this.ASSUME_VALID_MASK) !== 0;
    const stage = (flags & this.STAGE_MASK) >> this.STAGE_SHIFT;
    const filenameLength = flags & this.FILENAME_LENGTH_MASK;

    // Check for extended flag (not supported in version 2)
    if (flags & this.EXTENDED_MASK) {
      throw new ObjectException('Extended flags not supported in index version 2');
    }

    return { assumeValid, stage, filenameLength };
  }
}

/**
 * Timestamp Utilities for Git Index
 *
 * Git stores timestamps as [seconds_since_epoch, nanoseconds] pairs
 * This provides nanosecond precision for change detection
 */
export class GitTimestamp {
  readonly seconds: number;
  readonly nanoseconds: number;

  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }

  /**
   * Create a GitTimestamp from JavaScript milliseconds
   */
  static fromMilliseconds(milliseconds: number): GitTimestamp {
    const seconds = Math.floor(milliseconds / 1000);
    const nanoseconds = (milliseconds % 1000) * 1_000_000; // Convert ms to ns
    return new GitTimestamp(seconds, nanoseconds);
  }

  /**
   * Convert to JavaScript Date object
   */
  toDate(): Date {
    return new Date(this.seconds * 1000 + this.nanoseconds / 1_000_000);
  }

  /**
   * Convert to [seconds, nanoseconds] array for compatibility
   */
  toArray(): [number, number] {
    return [this.seconds, this.nanoseconds];
  }

  /**
   * Create from [seconds, nanoseconds] array
   */
  static fromArray([seconds, nanoseconds]: [number, number]): GitTimestamp {
    return new GitTimestamp(seconds, nanoseconds);
  }
}
