import { writeTreeCommand } from '../../../commands/write-tree/write-tree';

describe('write-tree command', () => {
  test('has correct command configuration', () => {
    expect(writeTreeCommand.name()).toBe('write-tree');
    expect(writeTreeCommand.description()).toBe('🌲 Create a tree object from the current working directory');
    
    // Verify command has options configured
    expect(writeTreeCommand.options.length).toBe(2);
    
    // Check for prefix option
    const prefixOption = writeTreeCommand.options.find(opt => opt.long === '--prefix');
    expect(prefixOption).toBeDefined();
    expect(prefixOption?.description).toBe('Write tree for subdirectory only');
    
    // Check for exclude-git-dir option
    const excludeGitDirOption = writeTreeCommand.options.find(opt => opt.long === '--exclude-git-dir');
    expect(excludeGitDirOption).toBeDefined();
    expect(excludeGitDirOption?.description).toBe('Exclude .git/.source directories');
    expect(excludeGitDirOption?.defaultValue).toBe(true);
  });
});