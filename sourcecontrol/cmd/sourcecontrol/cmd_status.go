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

			// Display beautiful status
			fmt.Println(renderHeader(" Repository Status "))
			fmt.Printf("%s %s\n\n", colorCyan(IconBranch), colorBlue("Branch: "+branchName))

			if status.Clean {
				fmt.Println(colorGreen(fmt.Sprintf("  %s  Working tree clean - nothing to commit", IconCheck)))
			} else {
				hasChanges := false

				if len(status.ModifiedFiles) > 0 {
					hasChanges = true
					fmt.Println(renderSection("Changes not staged for commit:"))
					for _, path := range status.ModifiedFiles {
						fmt.Println(formatModified(string(path)))
					}
					fmt.Println()
				}

				if len(status.DeletedFiles) > 0 {
					hasChanges = true
					fmt.Println(renderSection("Deleted files:"))
					for _, path := range status.DeletedFiles {
						fmt.Println(formatDeleted(string(path)))
					}
					fmt.Println()
				}

				if hasChanges {
					fmt.Println(colorYellow("  💡 Use 'sc add <file>' to stage changes for commit"))
				}
			}

			return nil
		},
	}

	return cmd
}
