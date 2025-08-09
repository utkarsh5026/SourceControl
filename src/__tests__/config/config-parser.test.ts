import { ConfigParser, ConfigLevel, ConfigEntry } from '../../core/config';

describe('ConfigParser.parse', () => {
  test('returns empty map for blank content', () => {
    const out = ConfigParser.parse('   ', 'blank.json', ConfigLevel.USER);
    expect(out.size).toBe(0);
  });

  test('parses nested sections and string values', () => {
    const json = JSON.stringify({
      core: { bare: 'false' },
      user: { name: 'John Doe', email: 'john@example.com' },
      remote: { origin: { url: 'https://github.com/user/repo.git' } },
    });

    const out = ConfigParser.parse(json, 'repo.json', ConfigLevel.REPOSITORY);

    expect(Array.from(out.keys()).sort()).toEqual(
      ['core.bare', 'remote.origin.url', 'user.email', 'user.name'].sort()
    );

    const name = out.get('user.name')!;
    expect(name).toHaveLength(1);
    expect(name[0]?.value).toBe('John Doe');
    expect(name[0]?.level).toBe(ConfigLevel.REPOSITORY);
    expect(name[0]?.source).toBe('repo.json');
  });

  test('parses arrays as multiple entries for the same key', () => {
    const json = JSON.stringify({
      remote: {
        origin: {
          fetch: ['+refs/heads/*:refs/remotes/origin/*', '+refs/tags/*:refs/tags/*'],
        },
      },
    });

    const out = ConfigParser.parse(json, 'repo.json', ConfigLevel.REPOSITORY);
    const fetch = out.get('remote.origin.fetch')!;
    expect(fetch).toHaveLength(2);
    expect(fetch.map((e) => e.value)).toEqual([
      '+refs/heads/*:refs/remotes/origin/*',
      '+refs/tags/*:refs/tags/*',
    ]);
  });

  test('throws with descriptive error for invalid JSON', () => {
    expect(() => ConfigParser.parse('{', 'broken.json', ConfigLevel.USER)).toThrow(
      /Invalid JSON in configuration file broken\.json:/
    );
  });
});

describe('ConfigParser.serialize', () => {
  test('reconstructs nested structure and collapses repeated keys into arrays', () => {
    const entries = new Map<string, ConfigEntry[]>();

    entries.set('user.name', [
      new ConfigEntry(
        'user.name',
        'John Doe',
        ConfigLevel.USER,
        '~/.config/sourcecontrol/config',
        0
      ),
    ]);
    entries.set('user.email', [
      new ConfigEntry(
        'user.email',
        'john@example.com',
        ConfigLevel.USER,
        '~/.config/sourcecontrol/config',
        0
      ),
    ]);
    entries.set('remote.origin.url', [
      new ConfigEntry(
        'remote.origin.url',
        'https://github.com/user/repo.git',
        ConfigLevel.REPOSITORY,
        '.source/config',
        0
      ),
    ]);
    entries.set('remote.origin.fetch', [
      new ConfigEntry(
        'remote.origin.fetch',
        '+refs/heads/*:refs/remotes/origin/*',
        ConfigLevel.REPOSITORY,
        '.source/config',
        0
      ),
      new ConfigEntry(
        'remote.origin.fetch',
        '+refs/tags/*:refs/tags/*',
        ConfigLevel.REPOSITORY,
        '.source/config',
        0
      ),
    ]);

    const json = ConfigParser.serialize(entries);
    const obj = JSON.parse(json);

    expect(obj).toStrictEqual({
      user: { name: 'John Doe', email: 'john@example.com' },
      remote: {
        origin: {
          url: 'https://github.com/user/repo.git',
          fetch: ['+refs/heads/*:refs/remotes/origin/*', '+refs/tags/*:refs/tags/*'],
        },
      },
    });
  });
});

describe('ConfigParser.validate', () => {
  test('valid config passes', () => {
    const json = JSON.stringify({
      user: { name: 'John', email: 'john@example.com' },
      remote: { origin: { fetch: ['a', 'b'] } },
    });
    const res = ConfigParser.validate(json);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  test('rejects non-string values', () => {
    const json = JSON.stringify({ core: { bare: false, version: 2 } });
    const res = ConfigParser.validate(json);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("Configuration value at 'core.bare'"))).toBe(true);
    expect(res.errors.some((e) => e.includes("Configuration value at 'core.version'"))).toBe(true);
  });

  test('rejects arrays with non-string elements', () => {
    const json = JSON.stringify({ remote: { origin: { fetch: ['ok', 1, true] } } });
    const res = ConfigParser.validate(json);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("Configuration array at 'remote.origin.fetch'"))).toBe(
      true
    );
  });
});
