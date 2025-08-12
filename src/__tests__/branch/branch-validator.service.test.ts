import { BranchValidator } from '../../core/branch/services/branch-validator';

describe('BranchValidator', () => {
  describe('validateBranchName - valid names', () => {
    const valid = [
      'main',
      'feature/x',
      'feature/foo.bar',
      'hotfix-123',
      'release/v1.2.3',
      'team/alpha/beta',
      'rfc/2024-xyz',
      'bugfix_under_score',
    ];

    it.each(valid)('accepts %s', (name) => {
      const res = BranchValidator.validateBranchName(name);
      expect(res.isValid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });
  });

  describe('validateBranchName - empty', () => {
    it('rejects empty', () => {
      const res = BranchValidator.validateBranchName('');
      expect(res.isValid).toBe(false);
      expect(res.errors).toContain('Branch name cannot be empty');
    });
  });

  describe('validateBranchName - reserved names', () => {
    const reserved = ['HEAD', 'refs', 'refs/heads', 'refs/tags', 'refs/remotes'];

    it.each(reserved)('rejects reserved name %s', (name) => {
      const res = BranchValidator.validateBranchName(name);
      expect(res.isValid).toBe(false);
      expect(res.errors).toContain(`Branch name '${name}' is reserved`);
    });
  });

  describe('validateBranchName - leading/trailing dot', () => {
    it('rejects names starting with dot', () => {
      const res = BranchValidator.validateBranchName('.foo');
      expect(res.isValid).toBe(false);
      expect(res.errors).toContain('Branch name cannot start or end with a dot');
    });

    it('rejects names ending with dot', () => {
      const res = BranchValidator.validateBranchName('bar.');
      expect(res.isValid).toBe(false);
      expect(res.errors).toContain('Branch name cannot start or end with a dot');
    });
  });

  describe('validateBranchName - trailing slash', () => {
    it('rejects names ending with slash', () => {
      const res = BranchValidator.validateBranchName('foo/');
      expect(res.isValid).toBe(false);
      expect(res.errors).toContain('Branch name cannot end with a slash');
    });
  });

  describe('validateBranchName - invalid characters', () => {
    const cases: Array<[string, string]> = [
      ['space', 'feat branch'],
      ['tilde', 'feat~branch'],
      ['caret', 'feat^branch'],
      ['colon', 'feat:branch'],
      ['question', 'feat?branch'],
      ['asterisk', 'feat*branch'],
      ['left-bracket', 'feat[branch'],
      ['newline', 'feat\nbranch'],
      ['NUL', 'feat\u0000branch'],
      ['DEL', 'feat\u007Fbranch'],
    ];

    it.each(cases)('rejects %s', (_label, name) => {
      const res = BranchValidator.validateBranchName(name);
      expect(res.isValid).toBe(false);
      expect(res.errors).toContain('Branch name contains invalid characters');
    });
  });

  describe('validateBranchName - invalid sequences', () => {
    const seqCases: Array<[string, string, string]> = [
      ['double dot', 'a..b', '..'],
      ['double slash', 'a//b', '//'],
      ['at brace', 'a@{b', '@{'],
      ['backslash', 'a\\b', '\\'],
    ];

    it.each(seqCases)('rejects %s', (_label, name, seq) => {
      const res = BranchValidator.validateBranchName(name);
      expect(res.isValid).toBe(false);
      expect(res.errors).toContain(`Branch name cannot contain '${seq}'`);
    });
  });

  describe('validateBranchName - multiple errors aggregation', () => {
    it('collects all relevant errors', () => {
      const name = ' bad..name/';
      const res = BranchValidator.validateBranchName(name);
      expect(res.isValid).toBe(false);
      expect(res.errors).toEqual(
        expect.arrayContaining([
          'Branch name cannot end with a slash',
          'Branch name contains invalid characters',
          "Branch name cannot contain '..'",
        ])
      );
      // Ensure we have exactly the three expected messages for this input
      expect(res.errors.length).toBe(3);
    });
  });

  describe('validateAndThrow', () => {
    it('throws with a clear message for reserved names', () => {
      expect(() => BranchValidator.validateAndThrow('refs')).toThrowError(
        "Invalid branch name: Branch name 'refs' is reserved"
      );
    });

    it('throws and includes all messages for multi-error input', () => {
      const name = ' bad..name/';
      try {
        BranchValidator.validateAndThrow(name);
        fail('Expected to throw');
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        expect(msg).toContain('Invalid branch name:');
        expect(msg).toContain('Branch name cannot end with a slash');
        expect(msg).toContain('Branch name contains invalid characters');
        expect(msg).toContain("Branch name cannot contain '..'");
      }
    });

    it('does not throw for a valid name', () => {
      expect(() => BranchValidator.validateAndThrow('feature/x')).not.toThrow();
    });
  });
});
