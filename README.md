# SourceControl

```
███████╗ ██████╗ ██╗   ██╗██████╗  ██████╗███████╗
██╔════╝██╔═══██╗██║   ██║██╔══██╗██╔════╝██╔════╝
███████╗██║   ██║██║   ██║██████╔╝██║     █████╗
╚════██║██║   ██║██║   ██║██╔══██╗██║     ██╔══╝
███████║╚██████╔╝╚██████╔╝██║  ██║╚██████╗███████╗
╚══════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝╚══════╝

 ██████╗ ██████╗ ███╗   ██╗████████╗██████╗  ██████╗ ██╗
██╔════╝██╔═══██╗████╗  ██║╚══██╔══╝██╔══██╗██╔═══██╗██║
██║     ██║   ██║██╔██╗ ██║   ██║   ██████╔╝██║   ██║██║
██║     ██║   ██║██║╚██╗██║   ██║   ██╔══██╗██║   ██║██║
╚██████╗╚██████╔╝██║ ╚████║   ██║   ██║  ██║╚██████╔╝███████╗
 ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝
```

A Git-like version control system implemented from scratch in Go.

[![CI](https://github.com/utkarsh5026/SourceControl/actions/workflows/ci.yml/badge.svg)](https://github.com/utkarsh5026/SourceControl/actions/workflows/ci.yml)
[![Go Version](https://img.shields.io/badge/go-1.24.2-blue)](https://golang.org/dl/)

---

## Overview

SourceControl (`srcc`) is a ground-up implementation of the core Git object model and workflow in Go. It reproduces the fundamental mechanics of Git — content-addressed object storage, a binary staging index, branch references, and commit history — while serving as a clear, well-structured reference for how version control systems work internally.

**This is not a wrapper around Git.** Every component — blob/tree/commit objects, the index, reference management, and the working directory reconciler — is written from scratch.

---

## Features

- **Core object model** — blob, tree, and commit objects stored with DEFLATE compression and SHA-1 addressing
- **Staging area** — binary index with SHA-1 checksum integrity and O(1) entry lookup
- **Branch management** — create, delete, rename, and checkout branches including orphan branches and detached HEAD
- **Commit history** — BFS traversal of the commit DAG with configurable depth
- **Working directory status** — detects modified, deleted, and untracked files
- **Hierarchical configuration** — command-line > repo > user > system precedence
- **Colored terminal output** — readable, Git-familiar UI via lipgloss
- **Cross-platform** — Linux, macOS (Intel + ARM), Windows
- **Concurrent operations** — generic worker pool for parallel object processing

---

## Installation

### Prerequisites

- Go 1.24.2 or later

### Build from source

```bash
git clone https://github.com/utkarsh5026/SourceControl.git
cd SourceControl/sourcecontrol
make build
```

The binary is written to `bin/sourcecontrol`. Add it to your `$PATH`:

```bash
# Linux / macOS
export PATH="$PATH:$(pwd)/bin"

# Or install to $GOPATH/bin
make install
```

### Cross-platform builds

```bash
make build-all
# Produces:
#   bin/sourcecontrol-linux-amd64
#   bin/sourcecontrol-darwin-amd64
#   bin/sourcecontrol-darwin-arm64
#   bin/sourcecontrol-windows-amd64.exe
```

---

## Quick Start

```bash
# Initialize a new repository
srcc init

# Create some files
echo "Hello, world!" > hello.txt

# Stage files
srcc add hello.txt

# Commit
srcc commit -m "Initial commit"

# Check status
srcc status

# View history
srcc log
```

---

## Commands

### `srcc init [path]`

Initialize a new repository. Creates a `.source/` directory (analogous to `.git/`).

```bash
srcc init              # Initialize in current directory
srcc init ./myproject  # Initialize in a specific path
```

---

### `srcc add <file...>`

Stage file contents to the index.

```bash
srcc add file.txt           # Stage a single file
srcc add src/main.go tests/ # Stage multiple files/directories
```

Output shows `added:`, `modified:`, or `failed:` per file.

---

### `srcc commit -m <message>`

Create a commit from staged changes.

```bash
srcc commit -m "Fix authentication bug"
```

---

### `srcc status`

Show working directory status. Displays modified, deleted, and untracked files relative to the index.

```bash
srcc status
```

---

### `srcc log`

Show commit history from HEAD.

```bash
srcc log              # Detailed view, last 20 commits
srcc log -n 50        # Show last 50 commits
srcc log --table      # Compact table format
```

---

### `srcc branch`

List, create, delete, or rename branches.

```bash
srcc branch                        # List all branches
srcc branch -v                     # List with commit info
srcc branch feature-x              # Create a branch at HEAD
srcc branch feature-x abc123       # Create a branch at a specific commit
srcc branch --start-point=main fix # Create from another branch
srcc branch -d old-branch          # Delete a branch
srcc branch -D old-branch          # Force delete
srcc branch -m new-name            # Rename current branch
srcc branch -m old new             # Rename a specific branch
srcc branch -M old new             # Force rename
```

---

### `srcc checkout <branch|commit>`

Switch branches or check out a commit.

```bash
srcc checkout main             # Switch to existing branch
srcc checkout -b feature-x     # Create and switch to new branch
srcc checkout -b new abc123    # Create branch from specific commit
srcc checkout abc123           # Detached HEAD at a commit
srcc checkout -f branch        # Force (discard local changes)
srcc checkout --orphan root    # New orphan branch (no parents)
srcc checkout --detach HEAD    # Explicitly detach HEAD
```

---

### Global flags

```bash
--log-level string    Log level: debug, info, warn, error (default "info")
--log-format string   Log format: text, json (default "text")
-v, --verbose         Enable verbose output (sets log level to debug)
```

---

## Architecture

### Storage layout

SourceControl uses a `.source/` directory at the repository root instead of `.git/`:

```
.source/
├── objects/
│   └── ab/
│       └── cdef1234...   # DEFLATE-compressed object (SHA-1 addressed)
├── refs/
│   └── heads/
│       └── main          # Plain-text SHA-1 of branch tip
├── HEAD                  # "ref: refs/heads/main" or bare SHA-1
└── index                 # Binary staging area with SHA-1 checksum
```

### Object model

All stored data is one of three object types, mirroring Git's model:

| Type   | Description |
|--------|-------------|
| `blob` | Raw file content |
| `tree` | Directory listing (name + mode + object hash per entry) |
| `commit` | Snapshot: tree hash, parent hashes, author/committer, message |

Objects are serialized as `<type> <size>\0<content>`, DEFLATE-compressed, and stored at a path derived from their SHA-1 hash.

### Package structure

```
pkg/
├── objects/          # Object types and serialization
├── index/            # Staging area (binary format, O(1) entryMap)
├── store/            # File-based object store
├── commitmanager/    # Commit creation + BFS history traversal
├── refs/branch/      # Branch and HEAD management
├── workdir/          # Working directory reconciler
├── config/           # Hierarchical configuration
├── repository/       # Repository interface, path types, .gitignore
└── common/
    ├── err/          # Typed error system
    ├── fileops/      # Atomic file writes
    ├── logger/       # slog-based structured logging
    └── concurrency/  # Generic worker pool
```

---

## Development

All commands run from the `sourcecontrol/` directory.

### Running tests

```bash
make test              # All tests with race detection + coverage
make test-coverage     # Tests + generate coverage.html
make bench             # Benchmarks

# Specific package
go test -v -race ./pkg/index/...
```

### Code quality

```bash
make fmt               # Format with gofmt
make lint              # golangci-lint (falls back to go vet)
```

### Test structure

- **Unit tests** — per-package, table-driven with `t.Run()`
- **Integration tests** — full init → add → commit → branch workflows (`integration_test.go`, `integration_complex_test.go`)
- **Compatibility tests** — compare output against real Git (`git_compat_test.go`)

---

## Dependencies

| Package | Purpose |
|---------|---------|
| [`spf13/cobra`](https://github.com/spf13/cobra) | CLI framework |
| [`charmbracelet/lipgloss`](https://github.com/charmbracelet/lipgloss) | Terminal styling |
| [`olekukonko/tablewriter`](https://github.com/olekukonko/tablewriter) | Table output |
| [`stretchr/testify`](https://github.com/stretchr/testify) | Test assertions |
| [`golang.org/x/sync`](https://pkg.go.dev/golang.org/x/sync) | `errgroup` for concurrent ops |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes, ensuring `make test` and `make lint` pass
4. Run `make fmt` to format code before committing
5. Submit a pull request

See [CHANGELOG.md](CHANGELOG.md) for version history.
