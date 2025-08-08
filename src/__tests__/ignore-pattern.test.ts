// src/core/ignore/__tests__/ignore-pattern.test.ts
import { IgnorePattern } from '../core/ignore';

describe('IgnorePattern.fromLine', () => {
  test('returns null for empty and comment lines', () => {
    expect(IgnorePattern.fromLine('')).toBeNull();
    expect(IgnorePattern.fromLine('   ')).toBeNull();
    expect(IgnorePattern.fromLine('# comment')).toBeNull();
  });

  test('trims trailing whitespace', () => {
    const p = IgnorePattern.fromLine('file.txt   ');
    expect(p).not.toBeNull();
    expect(p!.pattern).toBe('file.txt');
  });

  test('supports escaped special characters (e.g., leading #)', () => {
    const p = IgnorePattern.fromLine('\\#note.txt');
    expect(p).not.toBeNull();
    expect(p!.pattern).toBe('#note.txt');
    expect(p!.isNegation).toBe(false);
  });

  test('negation prefix is preserved in metadata', () => {
    const p = IgnorePattern.fromLine('!important.log');
    expect(p).not.toBeNull();
    expect(p!.isNegation).toBe(true);
    expect(p!.pattern).toBe('important.log');
  });
});

describe('IgnorePattern constructor flags', () => {
  test('isDirectory for patterns ending with /', () => {
    const p = new IgnorePattern('build/');
    expect(p.isDirectory).toBe(true);
    expect(p.pattern).toBe('build');
  });

  test('isRooted for patterns starting with /', () => {
    const p = new IgnorePattern('/TODO');
    expect(p.isRooted).toBe(true);
    expect(p.pattern).toBe('TODO');
  });

  test('unescapePattern handles escaped spaces', () => {
    const p = new IgnorePattern('file\\ name.txt');
    expect(p.pattern).toBe('file name.txt');
  });
});

describe('IgnorePattern.matches - directory-only patterns', () => {
  test('matches directory itself', () => {
    const p = new IgnorePattern('node_modules/');
    expect(p.matches('node_modules', true)).toBe(true);
  });

  test('does not match files when pattern is directory-only', () => {
    const p = new IgnorePattern('build/');
    expect(p.matches('build/file.txt', false)).toBe(false);
  });

  test('matches directory nested anywhere (non-rooted)', () => {
    const p = new IgnorePattern('dist/');
    expect(p.matches('packages/a/dist', true)).toBe(true);
    expect(p.matches('dist', true)).toBe(true);
  });
});

describe('IgnorePattern.matches - literal (no wildcard)', () => {
  test('matches by basename anywhere for non-rooted literal', () => {
    const p = new IgnorePattern('README.md');
    expect(p.matches('README.md', false)).toBe(true);
    expect(p.matches('docs/README.md', false)).toBe(true);
  });
});

describe('IgnorePattern.matches - globs and special patterns', () => {
  test('*.log matches logs at any depth', () => {
    const p = new IgnorePattern('*.log');
    expect(p.matches('app.log', false)).toBe(true);
    expect(p.matches('logs/app.log', false)).toBe(true);
  });

  test('globstar ** works across directories', () => {
    const p = new IgnorePattern('src/**/*.test.ts');
    expect(p.matches('src/foo/bar/baz.test.ts', false)).toBe(true);
    expect(p.matches('src/baz.test.ts', false)).toBe(true);
    expect(p.matches('src/foo/bar/baz.ts', false)).toBe(false);
  });

  test('character class', () => {
    const p = new IgnorePattern('file[0-9].txt');
    expect(p.matches('file1.txt', false)).toBe(true);
    expect(p.matches('file10.txt', false)).toBe(false);
  });

  test('question mark single-character', () => {
    const p = new IgnorePattern('a?.txt');
    expect(p.matches('a1.txt', false)).toBe(true);
    expect(p.matches('ab.txt', false)).toBe(true);
    expect(p.matches('a10.txt', false)).toBe(false);
  });

  test('dotfiles are matched due to dot:true', () => {
    const p = new IgnorePattern('*.env');
    expect(p.matches('.env', false)).toBe(true);
    expect(p.matches('config/.env', false)).toBe(true);
  });
});

describe('IgnorePattern.matches - rooted and fromDirectory', () => {
  test('rooted pattern currently matches by basename in subfolders (current behavior)', () => {
    const p = new IgnorePattern('/TODO');
    // Current implementation uses basename matching even for rooted,
    // so this returns true:
    expect(p.matches('docs/TODO', false)).toBe(true);
    // And at repo root:
    expect(p.matches('TODO', false)).toBe(true);
  });

  test('fromDirectory scopes matching to a subtree', () => {
    const p = new IgnorePattern('dist/');
    expect(p.matches('packages/pkg/dist', true, 'packages/pkg')).toBe(true);
    expect(p.matches('packages/other/dist', true, 'packages/pkg')).toBe(false);
  });

  test('fromDirectory and path normalization (Windows style paths)', () => {
    const p = new IgnorePattern('dist/');
    expect(p.matches('packages\\pkg\\dist', true, 'packages\\pkg')).toBe(true);
    expect(p.matches('packages\\other\\dist', true, 'packages\\pkg')).toBe(false);
  });

  test('path normalization for file globs with backslashes', () => {
    const p = new IgnorePattern('src/**/*.ts');
    expect(p.matches('src\\app\\index.ts', false)).toBe(true);
  });

  test.todo('rooted patterns ("/foo") should only match from repository root, not subfolders');
});

describe('IgnorePattern metadata', () => {
  test('stores source and line number', () => {
    const p = new IgnorePattern('*.log', 'custom.ignore', 42);
    expect(p.source).toBe('custom.ignore');
    expect(p.lineNumber).toBe(42);
    expect(p.originalPattern).toBe('*.log');
  });
});
