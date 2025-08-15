import { statusCommand } from '../../../commands/status/status';

describe('status command', () => {
  test('has correct command configuration', () => {
    expect(statusCommand.name()).toBe('status');
    expect(statusCommand.description()).toBe('Show the working tree status');
    
    // Verify command has options configured
    expect(statusCommand.options.length).toBeGreaterThan(0);
    
    // Check for specific options
    const shortOption = statusCommand.options.find(opt => opt.short === '-s');
    expect(shortOption).toBeDefined();
    expect(shortOption?.long).toBe('--short');
    
    const branchOption = statusCommand.options.find(opt => opt.short === '-b');
    expect(branchOption).toBeDefined();
    expect(branchOption?.long).toBe('--branch');
    
    const verboseOption = statusCommand.options.find(opt => opt.short === '-v');
    expect(verboseOption).toBeDefined();
    expect(verboseOption?.long).toBe('--verbose');
    
    const ignoredOption = statusCommand.options.find(opt => opt.long === '--ignored');
    expect(ignoredOption).toBeDefined();
    
    const untrackedOption = statusCommand.options.find(opt => opt.long === '--untracked-files');
    expect(untrackedOption).toBeDefined();
  });

  test('has proper command structure', () => {
    // Test that the command is properly configured
    expect(statusCommand.args).toBeDefined();
    expect(Array.isArray(statusCommand.args)).toBe(true);
  });
});