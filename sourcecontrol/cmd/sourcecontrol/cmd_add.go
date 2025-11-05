package main

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/utkarsh5026/SourceControl/pkg/index"
	"github.com/utkarsh5026/SourceControl/pkg/store"
)

func newAddCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "add [file...]",
		Short: "Add file contents to the staging area",
		Long: `Add file contents to the staging area (index).
This stages changes for the next commit.`,
		Args: cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			// Find repository
			repo, err := findRepository()
			if err != nil {
				return err
			}

			// Create index manager
			repoRoot := repo.WorkingDirectory()
			indexMgr := index.NewManager(repoRoot)
			if err := indexMgr.Initialize(); err != nil {
				return fmt.Errorf("failed to initialize index: %w", err)
			}

			// Create object store
			objectStore := store.NewFileObjectStore()
			objectStore.Initialize(repo.WorkingDirectory())

			// Add files
			result, err := indexMgr.Add(args, objectStore)
			if err != nil {
				return fmt.Errorf("failed to add files: %w", err)
			}

			// Display results
			for _, path := range result.Added {
				fmt.Printf("%s %s\n", colorGreen("added:"), path)
			}
			for _, path := range result.Modified {
				fmt.Printf("%s %s\n", colorYellow("modified:"), path)
			}
			for _, failure := range result.Failed {
				fmt.Printf("%s %s: %s\n", colorRed("failed:"), failure.Path, failure.Reason)
			}

			return nil
		},
	}

	return cmd
}
