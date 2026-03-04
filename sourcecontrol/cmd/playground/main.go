// Package main provides a playground setup tool for manually testing the
// sourcecontrol CLI. It creates a directory containing several pre-configured
// repositories in different states so you can cd into them and run commands.
//
// Usage:
//
//	go run ./cmd/playground [--dir PATH] [--clean]
//	make playground
//
// Each sub-directory contains a distinct repo scenario:
//
//	fresh-repo/      - initialized, no files
//	staged-repo/     - files staged but not yet committed
//	single-commit/   - one commit
//	history-repo/    - 5-commit history with a realistic project layout
//	branched-repo/   - commits + multiple branches
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"github.com/utkarsh5026/SourceControl/pkg/commitmanager"
	"github.com/utkarsh5026/SourceControl/pkg/index"
	"github.com/utkarsh5026/SourceControl/pkg/refs/branch"
	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
	"github.com/utkarsh5026/SourceControl/pkg/repository/sourcerepo"
	"github.com/utkarsh5026/SourceControl/pkg/store"
)

func defaultDir() string {
	if runtime.GOOS == "windows" {
		return `C:\tmp\sc-playground`
	}
	return "/tmp/sc-playground"
}

func main() {
	dir := flag.String("dir", defaultDir(), "directory to create playground repos in")
	clean := flag.Bool("clean", false, "wipe and recreate directory if it exists")
	flag.Parse()

	if *clean {
		if err := os.RemoveAll(*dir); err != nil {
			fmt.Fprintf(os.Stderr, "error: failed to clean %s: %v\n", *dir, err)
			os.Exit(1)
		}
	}

	if err := os.MkdirAll(*dir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "error: failed to create %s: %v\n", *dir, err)
		os.Exit(1)
	}

	fmt.Printf("Playground directory: %s\n\n", *dir)

	scenarios := []struct {
		name string
		fn   func(string) error
		desc string
	}{
		{"fresh-repo", setupFreshRepo, "initialized, no files"},
		{"staged-repo", setupStagedRepo, "files staged but not committed"},
		{"single-commit", setupSingleCommit, "one commit with a few files"},
		{"history-repo", setupHistoryRepo, "5-commit history with a project layout"},
		{"branched-repo", setupBranchedRepo, "commits + feature/develop branches"},
	}

	ok := true
	for _, s := range scenarios {
		repoDir := filepath.Join(*dir, s.name)
		if err := s.fn(repoDir); err != nil {
			fmt.Printf("  %-22s  ERROR: %v\n", s.name+"/", err)
			ok = false
		} else {
			fmt.Printf("  %-22s  %s\n", s.name+"/", s.desc)
		}
	}

	fmt.Println()
	if ok {
		fmt.Printf("All repos ready. Try:\n")
		fmt.Printf("  cd %s/history-repo\n", *dir)
		fmt.Printf("  sourcecontrol log\n")
		fmt.Printf("  sourcecontrol status\n")
	} else {
		fmt.Println("Some repos failed to set up (see errors above).")
	}
}

// --- helpers ---

func initRepo(dir string) (*sourcerepo.SourceRepository, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("mkdir: %w", err)
	}
	repoPath, err := scpath.NewRepositoryPath(dir)
	if err != nil {
		return nil, fmt.Errorf("repo path: %w", err)
	}
	repo := sourcerepo.NewSourceRepository()
	if err := repo.Initialize(repoPath); err != nil {
		return nil, fmt.Errorf("init: %w", err)
	}
	return repo, nil
}

// writeAndStage writes files to disk and stages them in the index.
// files is a map of relative path → content.
func writeAndStage(repo *sourcerepo.SourceRepository, files map[string]string) error {
	repoRoot := repo.WorkingDirectory()

	for relPath, content := range files {
		abs := filepath.Join(repoRoot.String(), relPath)
		if err := os.MkdirAll(filepath.Dir(abs), 0755); err != nil {
			return fmt.Errorf("mkdir for %s: %w", relPath, err)
		}
		if err := os.WriteFile(abs, []byte(content), 0644); err != nil {
			return fmt.Errorf("write %s: %w", relPath, err)
		}
	}

	indexMgr := index.NewManager(repoRoot)
	if err := indexMgr.Initialize(); err != nil {
		return fmt.Errorf("index init: %w", err)
	}

	paths := make([]string, 0, len(files))
	for p := range files {
		paths = append(paths, p)
	}

	objStore := store.NewFileObjectStore()
	objStore.Initialize(repoRoot)

	result, err := indexMgr.Add(paths, objStore)
	if err != nil {
		return fmt.Errorf("index add: %w", err)
	}
	for _, f := range result.Failed {
		return fmt.Errorf("staging %s: %s", f.Path, f.Reason)
	}
	return nil
}

// doCommit creates a commit with message in the given repo.
func doCommit(repo *sourcerepo.SourceRepository, message string) error {
	ctx := context.Background()
	mgr := commitmanager.NewManager(repo)
	if err := mgr.Initialize(ctx); err != nil {
		return fmt.Errorf("commit manager init: %w", err)
	}
	if _, err := mgr.CreateCommit(ctx, commitmanager.CommitOptions{Message: message}); err != nil {
		return fmt.Errorf("create commit: %w", err)
	}
	return nil
}

// stageAndCommit is a convenience wrapper for writeAndStage + doCommit.
func stageAndCommit(repo *sourcerepo.SourceRepository, files map[string]string, message string) error {
	if err := writeAndStage(repo, files); err != nil {
		return err
	}
	return doCommit(repo, message)
}

// createBranch creates a branch at the current HEAD of repo.
func createBranch(repo *sourcerepo.SourceRepository, name string) error {
	ctx := context.Background()
	mgr := branch.NewManager(repo)
	if err := mgr.Init(); err != nil {
		return fmt.Errorf("branch manager init: %w", err)
	}
	if _, err := mgr.CreateBranch(ctx, name); err != nil {
		return fmt.Errorf("create branch %s: %w", name, err)
	}
	return nil
}

func setupFreshRepo(dir string) error {
	_, err := initRepo(dir)
	return err
}

func setupStagedRepo(dir string) error {
	repo, err := initRepo(dir)
	if err != nil {
		return err
	}
	return writeAndStage(repo, map[string]string{
		"README.md":   "# My Project\n\nA work in progress.\n",
		"main.go":     "package main\n\nfunc main() {}\n",
		"config.yaml": "version: 1\ndebug: false\n",
	})
}

func setupSingleCommit(dir string) error {
	repo, err := initRepo(dir)
	if err != nil {
		return err
	}
	return stageAndCommit(repo, map[string]string{
		"README.md": "# Single Commit Repo\n",
		"main.go":   "package main\n\nfunc main() {}\n",
	}, "Initial commit")
}

func setupHistoryRepo(dir string) error {
	repo, err := initRepo(dir)
	if err != nil {
		return err
	}

	steps := []struct {
		files   map[string]string
		message string
	}{
		{
			files:   map[string]string{"README.md": "# History Repo\n"},
			message: "Initial commit: add README",
		},
		{
			files:   map[string]string{"src/main.go": "package main\n\nfunc main() {}\n"},
			message: "feat: add main entry point",
		},
		{
			files: map[string]string{
				"src/util/helper.go": "package util\n\n// Help returns a help string.\nfunc Help() string { return \"help\" }\n",
			},
			message: "feat: add helper utility",
		},
		{
			files:   map[string]string{"docs/GUIDE.md": "# Guide\n\nHow to use this project.\n"},
			message: "docs: add user guide",
		},
		{
			files:   map[string]string{"src/main.go": "package main\n\nimport \"fmt\"\n\nfunc main() { fmt.Println(\"Hello\") }\n"},
			message: "fix: print hello on startup",
		},
	}

	for _, step := range steps {
		if err := stageAndCommit(repo, step.files, step.message); err != nil {
			return fmt.Errorf("%q: %w", step.message, err)
		}
	}
	return nil
}

func setupBranchedRepo(dir string) error {
	repo, err := initRepo(dir)
	if err != nil {
		return err
	}

	if err := stageAndCommit(repo, map[string]string{
		"README.md": "# Branched Repo\n",
		"main.go":   "package main\n\nfunc main() {}\n",
	}, "Initial commit"); err != nil {
		return err
	}

	if err := stageAndCommit(repo, map[string]string{
		"config.yaml": "version: 1\n",
	}, "chore: add config"); err != nil {
		return err
	}

	for _, name := range []string{"feature/login", "feature/dashboard", "develop"} {
		if err := createBranch(repo, name); err != nil {
			return err
		}
	}
	return nil
}
