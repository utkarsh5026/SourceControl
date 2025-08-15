import { lsTreeCommand } from '../../../commands/ls-tree/ls-tree';

describe('ls-tree command', () => {
  test('has correct command configuration', () => {
    expect(lsTreeCommand.name()).toBe('ls-tree');
    expect(lsTreeCommand.description()).toBe('🌳 List the contents of a tree object');
    
    // Verify command has options configured
    expect(lsTreeCommand.options.length).toBe(4);
    
    // Check for recursive option
    const recursiveOption = lsTreeCommand.options.find(opt => opt.long === '--recursive');
    expect(recursiveOption).toBeDefined();
    expect(recursiveOption?.short).toBe('-r');
    
    // Check for name-only option
    const nameOnlyOption = lsTreeCommand.options.find(opt => opt.long === '--name-only');
    expect(nameOnlyOption).toBeDefined();
    
    // Check for long format option
    const longOption = lsTreeCommand.options.find(opt => opt.long === '--long');
    expect(longOption).toBeDefined();
    expect(longOption?.short).toBe('-l');
    expect(longOption?.description).toBe('Show object size (only for blobs)');
    
    // Check for tree-only option
    const treeOnlyOption = lsTreeCommand.options.find(opt => opt.long === '--tree-only');
    expect(treeOnlyOption).toBeDefined();
    expect(treeOnlyOption?.short).toBe('-d');
    expect(treeOnlyOption?.description).toBe('Show only trees, not blobs');
  });

  test('has required argument configured', () => {
    // The argument is defined in the command, we can check usage string
    expect(lsTreeCommand.usage()).toContain('<tree-ish>');
  });
});