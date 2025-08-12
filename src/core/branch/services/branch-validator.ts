import { BranchValidationResult } from '../types';

export class BranchValidator {
  public static readonly RESERVED_NAMES = [
    'HEAD',
    'refs',
    'refs/heads',
    'refs/tags',
    'refs/remotes',
  ];

  public static readonly INVALID_CHARS = /[\x00-\x1f\x7f ~^:?*\[]/;
  public static readonly INVALID_SEQUENCES = ['..', '//', '@{', '\\'];

  /**
   * Validates a branch name
   */
  public static validateBranchName(name: string): BranchValidationResult {
    const errors: string[] = [];

    if (!name || name.length === 0) {
      errors.push('Branch name cannot be empty');
    }

    if (BranchValidator.RESERVED_NAMES.includes(name)) {
      errors.push(`Branch name '${name}' is reserved`);
    }

    if (name.startsWith('.') || name.endsWith('.')) {
      errors.push('Branch name cannot start or end with a dot');
    }

    if (name.endsWith('/')) {
      errors.push('Branch name cannot end with a slash');
    }

    if (BranchValidator.INVALID_CHARS.test(name)) {
      errors.push('Branch name contains invalid characters');
    }

    for (const sequence of BranchValidator.INVALID_SEQUENCES) {
      if (name.includes(sequence)) {
        errors.push(`Branch name cannot contain '${sequence}'`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validates and throws if branch name is invalid
   */
  static validateAndThrow(name: string): void {
    const result = this.validateBranchName(name);
    if (!result.isValid) {
      throw new Error(`Invalid branch name: ${result.errors.join(', ')}`);
    }
  }
}
