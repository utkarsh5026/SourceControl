package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
	"github.com/utkarsh5026/SourceControl/pkg/repository/sourcerepo"
)

// findRepository finds the repository starting from current directory
func findRepository() (*sourcerepo.SourceRepository, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return nil, fmt.Errorf("failed to get current directory: %w", err)
	}

	dir := cwd
	for {
		sourceDir := filepath.Join(dir, ".source")
		if info, err := os.Stat(sourceDir); err == nil && info.IsDir() {
			repoPath, err := scpath.NewRepositoryPath(dir)
			if err != nil {
				return nil, fmt.Errorf("invalid repository path: %w", err)
			}
			return sourcerepo.Open(repoPath)
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			return nil, fmt.Errorf("not a sourcecontrol repository (or any parent up to mount point)")
		}
		dir = parent
	}
}

// Color functions for terminal output
func colorGreen(s string) string {
	return fmt.Sprintf("\033[32m%s\033[0m", s)
}

func colorRed(s string) string {
	return fmt.Sprintf("\033[31m%s\033[0m", s)
}

func colorYellow(s string) string {
	return fmt.Sprintf("\033[33m%s\033[0m", s)
}
