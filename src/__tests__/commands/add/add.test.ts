import { addCommand } from '../../../commands/add/add';

describe('add command', () => {
  test('has correct command configuration', () => {
    expect(addCommand.name()).toBe('add');
    expect(addCommand.description()).toBe('➕ Add file contents to the staging area');

    // Verify command has options configured
    expect(addCommand.options.length).toBeGreaterThan(0);

    // Check for specific options
    const allOption = addCommand.options.find((opt) => opt.short === '-A');
    expect(allOption).toBeDefined();
    expect(allOption?.long).toBe('--all');

    const updateOption = addCommand.options.find((opt) => opt.short === '-u');
    expect(updateOption).toBeDefined();
    expect(updateOption?.long).toBe('--update');

    const forceOption = addCommand.options.find((opt) => opt.short === '-f');
    expect(forceOption).toBeDefined();
    expect(forceOption?.long).toBe('--force');

    const verboseOption = addCommand.options.find((opt) => opt.short === '-v');
    expect(verboseOption).toBeDefined();
    expect(verboseOption?.long).toBe('--verbose');

    const quietOption = addCommand.options.find((opt) => opt.short === '-q');
    expect(quietOption).toBeDefined();
    expect(quietOption?.long).toBe('--quiet');

    const dryRunOption = addCommand.options.find((opt) => opt.short === '-n');
    expect(dryRunOption).toBeDefined();
    expect(dryRunOption?.long).toBe('--dry-run');
  });

  test('has proper command structure', () => {
    // Test that the command is properly configured
    expect(addCommand.args).toBeDefined();
    expect(Array.isArray(addCommand.args)).toBe(true);
  });
});
