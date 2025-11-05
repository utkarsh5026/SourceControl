package main

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/utkarsh5026/SourceControl/pkg/workdir"
)

func newStatusCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "status",
		Short: "Show the working directory status",
		Long: `Show the status of the working directory and staging area.
Displays which files are modified, staged, untracked, etc.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			repo, err := findRepository()
			if err != nil {
				return err
			}

			manager := workdir.NewManager(repo)
			status, err := manager.IsClean()
			if err != nil {
				return fmt.Errorf("failed to get status: %w", err)
			}

			// Get current branch
			branchName := "master" // Default branch name

			// Display status
			fmt.Printf("On branch %s\n\n", branchName)

			if status.Clean {
				fmt.Println("nothing to commit, working tree clean")
			} else {
				if len(status.ModifiedFiles) > 0 {
					fmt.Println("Changes not staged for commit:")
					for _, path := range status.ModifiedFiles {
						fmt.Printf("  modified: %s\n", path)
					}
					fmt.Println()
				}
				if len(status.DeletedFiles) > 0 {
					fmt.Println("Deleted files:")
					for _, path := range status.DeletedFiles {
						fmt.Printf("  deleted: %s\n", path)
					}
					fmt.Println()
				}
			}

			return nil
		},
	}

	return cmd
}
