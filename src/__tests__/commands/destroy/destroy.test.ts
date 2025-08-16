import { destroyCommand } from '../../../commands/destroy/destroy';

describe('destroy command', () => {
  test('has correct command configuration', () => {
    expect(destroyCommand.name()).toBe('destroy');
    expect(destroyCommand.description()).toBe('🗑️ Remove a Git repository completely');

    // Verify command has options configured
    expect(destroyCommand.options.length).toBeGreaterThan(0);

    // Check for specific options
    const forceOption = destroyCommand.options.find((opt) => opt.short === '-f');
    expect(forceOption).toBeDefined();
    expect(forceOption?.long).toBe('--force');

    const quietOption = destroyCommand.options.find((opt) => opt.short === '-q');
    expect(quietOption).toBeDefined();
    expect(quietOption?.long).toBe('--quiet');
  });
});
