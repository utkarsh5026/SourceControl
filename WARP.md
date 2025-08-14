# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

SourceControl is a modern TypeScript CLI application that implements a Git-like source control system. It's built with TypeScript 5.x, uses Commander.js for CLI parsing, and follows a modular architecture with comprehensive testing.

## Essential Commands

### Development Commands
```bash
# Install dependencies
npm install

# Development mode (TypeScript with watch)
npm run dev

# Build TypeScript to JavaScript
npm run build

# Build with watch mode
npm run build:watch

# Clean build artifacts
npm run clean
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run a single test file
npx jest path/to/test.test.ts

# Run tests matching a pattern
npx jest --testNamePattern="pattern"
```

### Code Quality
```bash
# Lint TypeScript code
npm run lint

# Fix linting issues automatically
npm run lint:fix

# Format code with Prettier
npm run format

# Check code formatting
npm run format:check
```

### Executable Build
```bash
# Build Windows executable
npm run build:exe:fast

# Build executables for all platforms
npm run build:exe:all

# Watch mode: auto-rebuild executable on changes
npm run watch:exe
```

### CLI Usage
```bash
# Run CLI in development
npm run dev [command]

# Run built CLI
node dist/cli.js [command]

# After global install
sc [command]
sourcecontrol [command]
```

## Architecture Overview

### High-Level Structure
- **CLI Layer** (`src/cli.ts`): Entry point using Commander.js
- **Commands Layer** (`src/commands/`): Individual CLI command implementations
- **Core Layer** (`src/core/`): Business logic and Git operations
- **Utils Layer** (`src/utils/`): Shared utilities and helpers

### Core Modules

#### Repository Management (`src/core/repo/`)
- `Repository` and `SourceRepository`: Core repository abstractions
- `ObjectReader`: Handles reading Git objects
- Manages `.git` directory structure and metadata

#### Object Store (`src/core/objects/`)
- `BlobObject`, `TreeObject`, `CommitObject`: Git object implementations
- `FileObjectStore`: Handles object storage and retrieval
- Implements Git's hash-based storage system

#### Index Management (`src/core/index/`)
- `IndexManager`: Manages the staging area
- `IndexEntry`: Represents staged files
- `IndexFileAdder`: Handles adding files to staging

#### Branch Management (`src/core/branch/`)
- `BranchManager`: Branch operations (create, delete, switch)
- `WorkingDirectoryManager`: Working directory operations
- Branch validation and reference management

#### Tree Operations (`src/core/tree/`)
- `TreeBuilder`: Constructs tree objects from index
- `TreeWalker`: Traverses directory trees
- `TreeAnalyzer`: Analyzes tree differences

#### Working Directory (`src/core/work-dir/`)
- `WorkDirectoryManager`: Manages working directory state
- `AtomicOperation`: Ensures atomic file operations
- `FileOperation`: Handles file system operations

### Command Architecture
Each command follows a consistent pattern:
- `[command].ts`: Command definition and options
- `[command].handler.ts`: Business logic implementation
- `[command].display.ts`: Output formatting and user feedback
- `[command].types.ts`: TypeScript type definitions

### Testing Strategy
- Unit tests for all core modules (`src/__tests__/`)
- Jest with TypeScript support
- Tests organized by module (branch, config, index, objects, etc.)
- Coverage reporting enabled

## Key Configuration Files

### TypeScript Configuration
- `tsconfig.json`: Main TypeScript config with strict mode
- `tsconfig.test.json`: Test-specific TypeScript config
- `tsc-alias.config.json`: Path alias configuration

### Build Tools
- Uses `tsc` + `tsc-alias` for building
- `pkg` for creating executables
- Path aliases: `@/*` maps to `src/*`

### Code Quality
- ESLint with TypeScript rules
- Prettier for formatting
- Pre-commit hooks via npm scripts

## Development Patterns

### Error Handling
- Custom exception classes in `src/core/exceptions/`
- Consistent error display via `display.ts` utilities
- Process exit codes for CLI failures

### Logging
- Centralized logging via `src/utils/cli/logger.ts`
- Supports verbose (`-V`) and quiet (`-q`) modes
- Colorful output with progress indicators

### File Operations
- Atomic operations for data integrity
- Path utilities for cross-platform compatibility
- File system abstraction through utils

### Testing Patterns
- Test files mirror source structure
- Mock external dependencies
- Test both success and failure scenarios
- Use descriptive test names

## Build Process

The build pipeline:
1. Clean previous build (`rimraf dist`)
2. TypeScript compilation (`tsc`)
3. Path alias resolution (`tsc-alias`)
4. Optional executable creation (`pkg`)

For development, use watch mode to automatically rebuild on file changes.
