import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { PathScurry } from 'path-scurry';
import type { Path } from 'glob';
import { IgnoreManager } from '../../core/ignore';
import { Repository } from '../../core/repo';
import { logger } from '../../utils';

class MockRepository extends Repository {
  constructor(private readonly _wd: Path) {
    super();
  }
  // Not used in these tests
  async init(): Promise<void> {}
  gitDirectory(): Path {
    return this._wd;
  }
  objectStore(): any {
    throw new Error('not used');
  }
  async readObject(): Promise<any> {
    return null;
  }
  async writeObject(): Promise<string> {
    return '';
  }
  workingDirectory(): Path {
    return this._wd;
  }
}

describe('IgnoreManager', () => {
  let tmp: string;
  let homeBackup: string | undefined;
  let userProfileBackup: string | undefined;

  beforeAll(() => {
    logger.level = 'silent';
  });

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-ignore-'));
    homeBackup = process.env['HOME'];
    userProfileBackup = process.env['USERPROFILE'];

    // Use an isolated HOME for global ignore file
    process.env['HOME'] = path.join(tmp, 'home');
    process.env['USERPROFILE'] = '';
    await fs.ensureDir(path.join(process.env['HOME']!, '.config', 'sourcecontrol'));
  });

  afterEach(async () => {
    process.env['HOME'] = homeBackup;
    process.env['USERPROFILE'] = userProfileBackup;
    await fs.remove(tmp);
  });

  const createManager = async () => {
    const scurry = new PathScurry(tmp);
    const repoPath = scurry.cwd;
    const repo = new MockRepository(repoPath);
    const mgr = new IgnoreManager(repo);
    await mgr.initialize();
    return mgr;
  };

  test('applies default patterns and special .source handling', async () => {
    const mgr = await createManager();

    // defaults include macOS & Windows metadata
    expect(mgr.isIgnored('.DS_Store', false)).toBe(true);
    expect(mgr.isIgnored('Thumbs.db', false)).toBe(true);

    // .source always ignored
    expect(mgr.isIgnored('.source', true)).toBe(true);
    expect(mgr.isIgnored('.source/config', false)).toBe(true);
  });

  test('loads global ignore patterns and supports negation', async () => {
    const globalFile = path.join(process.env['HOME']!, '.config', 'sourcecontrol', 'ignore');
    await fs.writeFile(globalFile, '*.log\n!keep.log\n', 'utf8');

    const mgr = await createManager();

    expect(mgr.isIgnored('app.log', false)).toBe(true);
    expect(mgr.isIgnored('keep.log', false)).toBe(false);
  });

  test('addPattern appends to root .sourceignore and is applied', async () => {
    const mgr = await createManager();

    await mgr.addPattern('dist/');
    expect(mgr.isIgnored('dist', true)).toBe(true);
    expect(mgr.isIgnored('dist/sub', true)).toBe(true);

    // Add negation and verify it overrides within the same set
    await mgr.addPattern('!dist/keep');
    expect(mgr.isIgnored('dist/keep', true)).toBe(false);
  });

  test('directory-level patterns apply only within that subtree', async () => {
    // Create a subdir with its own .sourceignore
    const subdir = path.join(tmp, 'packages', 'pkg');
    await fs.ensureDir(subdir);
    const subIgnore = path.join(subdir, '.sourceignore');
    await fs.writeFile(subIgnore, 'dist/\n', 'utf8');

    const mgr = await createManager();

    // Inject directory patterns to avoid async scan races
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (mgr as any).addDirectoryPatterns(subIgnore, 'packages/pkg');

    expect(mgr.isIgnored('packages/pkg/dist', true)).toBe(true);
    expect(mgr.isIgnored('packages/other/dist', true)).toBe(false);
  });

  test('areIgnored returns a map of results', async () => {
    const mgr = await createManager();
    await mgr.addPattern('build/');

    const results = await mgr.areIgnored(['build', 'README.md'], true);
    expect(results.get('build')).toBe(true);
    expect(results.get('README.md')).toBe(false);
  });
});
