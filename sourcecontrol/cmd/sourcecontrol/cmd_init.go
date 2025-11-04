package main

import (
	"fmt"
	"path/filepath"

	"github.com/spf13/cobra"
	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
	"github.com/utkarsh5026/SourceControl/pkg/repository/sourcerepo"
)

func newInitCmd() *cobra.Command {
	var bare bool

	cmd := &cobra.Command{
		Use:   "init [path]",
		Short: "Initialize a new SourceControl repository",
		Long: `Initialize a new SourceControl repository in the current directory or specified path.
This creates a .sc directory with all necessary subdirectories and files.`,
		Args: cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			path := "."
			if len(args) > 0 {
				path = args[0]
			}

			absPath, err := filepath.Abs(path)
			if err != nil {
				return fmt.Errorf("failed to resolve path: %w", err)
			}

			repoPath, err := scpath.NewRepositoryPath(absPath)
			if err != nil {
				return fmt.Errorf("invalid path: %w", err)
			}

			repo := sourcerepo.NewSourceRepository()
			if err := repo.Initialize(repoPath); err != nil {
				return fmt.Errorf("failed to initialize repository: %w", err)
			}

			if bare {
				fmt.Printf("Initialized empty bare SourceControl repository in %s/.sc\n", absPath)
			} else {
				fmt.Printf("Initialized empty SourceControl repository in %s/.sc\n", absPath)
			}

			return nil
		},
	}

	cmd.Flags().BoolVar(&bare, "bare", false, "Create a bare repository")

	return cmd
}
