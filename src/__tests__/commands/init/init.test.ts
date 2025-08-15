import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { initCommand } from '../../../commands/init/init';

describe('init command', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-init-cli-test-'));
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  test('has correct command configuration', () => {
    expect(initCommand.name()).toBe('init');
    expect(initCommand.description()).toBe('Create an empty Git repository or reinitialize an existing one');
    
    // Verify command has options configured
    expect(initCommand.options.length).toBeGreaterThan(0);
  });

});