# SourceControl CLI

A modern TypeScript CLI application for source control operations, built with best practices and modern tooling.

## Features

- 🚀 **Modern TypeScript** - Built with TypeScript 5.x for type safety
- 🎨 **Beautiful CLI** - Colorful output with progress indicators and spinners
- 🔧 **Interactive Commands** - User-friendly prompts and confirmations
- ⚡ **Fast & Reliable** - Efficient Git operations with proper error handling
- 🧪 **Well Tested** - Comprehensive test suite with Jest
- 📦 **Easy Installation** - Simple npm installation and setup

## Installation

### Global Installation
```bash
npm install -g sourcecontrol
```

### Local Development
```bash
# Clone the repository
git clone <repository-url>
cd sourcecontrol

# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev
```

## Usage

### Basic Commands

```bash
# Initialize a new repository
sc init

# Check repository status
sc status
sc st  # short alias

# Commit changes
sc commit -m "Your commit message"
sc commit -a -m "Stage and commit all changes"

# Manage branches
sc branch                    # list branches
sc branch feature-branch     # create new branch
sc branch -d old-branch      # delete branch

# Manage remotes
sc remote                    # list remotes
sc remote add origin <url>   # add remote
sc remote -v                 # verbose output
```

### Interactive Mode

Most commands support interactive mode when run without full arguments:

```bash
sc init      # Interactive repository setup
sc commit    # Interactive commit with prompts
sc remote add # Interactive remote addition
```

### Command Options

#### Global Options
- `-v, --verbose` - Enable verbose logging
- `-q, --quiet` - Suppress output
- `--config <path>` - Specify custom config file

#### Status Command
```bash
sc status [options]
  -s, --short     Show short-format output
  -b, --branch    Show branch information
```

#### Commit Command
```bash
sc commit [options]
  -m, --message <msg>  Commit message
  -a, --all            Stage all modified files
  --amend              Amend previous commit
  -s, --signoff        Add Signed-off-by line
```

#### Branch Command
```bash
sc branch [options] [name]
  -a, --all                List local and remote branches
  -r, --remotes           List remote branches
  -d, --delete <branch>   Delete branch
  -D, --force-delete <branch>  Force delete branch
```

#### Remote Command
```bash
sc remote [subcommand] [name] [url]
  -v, --verbose    Show URLs
  
Subcommands:
  add <name> <url>   Add remote
  remove <name>      Remove remote
  show <name>        Show remote details
```

## Configuration

SourceControl uses a configuration file located at `~/.sourcecontrol/config.json`:

```json
{
  "defaultBranch": "main",
  "editor": "nano",
  "user": {
    "name": "Your Name",
    "email": "your.email@example.com"
  },
  "remote": {
    "origin": ""
  },
  "ui": {
    "colorOutput": true,
    "showProgress": true
  }
}
```

You can specify a custom config file using the `--config` option.

## Development

### Scripts

```bash
npm run build         # Build TypeScript to dist/
npm run build:watch   # Build with watch mode
npm run dev           # Run in development mode
npm run test          # Run tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage
npm run lint          # Run ESLint
npm run lint:fix      # Fix ESLint issues
npm run format        # Format code with Prettier
npm run format:check  # Check code formatting
npm run clean         # Clean dist directory
```

### Project Structure

```
src/
├── cli.ts              # CLI entry point
├── index.ts            # Library exports
├── types/              # TypeScript type definitions
│   └── index.ts
├── utils/              # Utility modules
│   ├── config.ts       # Configuration management
│   ├── git.ts          # Git operations
│   ├── logger.ts       # Logging utility
│   └── spinner.ts      # Progress indicators
├── commands/           # CLI commands
│   ├── init.ts         # Repository initialization
│   ├── status.ts       # Status checking
│   ├── commit.ts       # Commit operations
│   ├── branch.ts       # Branch management
│   └── remote.ts       # Remote management
└── __tests__/          # Test files
    └── utils/
        ├── logger.test.ts
        └── git.test.ts
```

### Testing

The project uses Jest for testing with TypeScript support:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Code Quality

- **ESLint** - Code linting with TypeScript rules
- **Prettier** - Code formatting
- **TypeScript** - Type checking and compilation
- **Jest** - Unit testing

## Dependencies

### Production Dependencies
- `commander` - CLI argument parsing
- `chalk` - Terminal colors
- `inquirer` - Interactive prompts
- `ora` - Progress spinners
- `boxen` - Terminal boxes
- `update-notifier` - Update notifications
- `fs-extra` - Enhanced file system operations

### Development Dependencies
- `typescript` - TypeScript compiler
- `jest` - Testing framework
- `eslint` - Code linting
- `prettier` - Code formatting
- `ts-node` - TypeScript execution

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Run the test suite (`npm test`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Roadmap

- [ ] Add push/pull commands
- [ ] Git hooks support
- [ ] Plugin system
- [ ] Configuration templates
- [ ] Merge conflict resolution helpers
- [ ] Advanced branch operations
- [ ] Git flow support
- [ ] Performance optimizations