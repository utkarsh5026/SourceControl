package main

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"
	"github.com/utkarsh5026/SourceControl/pkg/refs/branch"
)

func newBranchCmd() *cobra.Command {
	var deleteFlag bool
	var listFlag bool

	cmd := &cobra.Command{
		Use:   "branch [branch-name]",
		Short: "List, create, or delete branches",
		Long: `List, create, or delete branches.
With no arguments, lists all branches. The current branch is highlighted.
With a name argument, creates a new branch.`,
		Args: cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			// Find repository
			repo, err := findRepository()
			if err != nil {
				return err
			}

			// Create branch manager
			manager := branch.NewManager(repo)

			ctx := context.Background()

			if deleteFlag {
				if len(args) == 0 {
					return fmt.Errorf("branch name required for deletion")
				}
				branchName := args[0]

				if err := manager.DeleteBranch(ctx, branchName, branch.WithForceDelete()); err != nil {
					return fmt.Errorf("failed to delete branch: %w", err)
				}

				fmt.Printf("Deleted branch %s\n", branchName)
				return nil
			}

			// Handle list (default) or create
			if len(args) == 0 || listFlag {
				// List branches
				branches, err := manager.ListBranches(ctx)
				if err != nil {
					return fmt.Errorf("failed to list branches: %w", err)
				}

				// Get current branch
				currentBranch, _ := manager.CurrentBranch()

				// Display branches
				if len(branches) == 0 {
					fmt.Println("No branches found")
					return nil
				}

				for _, br := range branches {
					if br.Name == currentBranch {
						fmt.Printf("* %s %s\n", br.Name, br.SHA.Short())
					} else {
						fmt.Printf("  %s %s\n", br.Name, br.SHA.Short())
					}
				}

				return nil
			}

			// Create new branch
			branchName := args[0]

			if _, err := manager.CreateBranch(ctx, branchName); err != nil {
				return fmt.Errorf("failed to create branch: %w", err)
			}

			fmt.Printf("Created branch %s\n", branchName)

			return nil
		},
	}

	cmd.Flags().BoolVarP(&deleteFlag, "delete", "d", false, "Delete a branch")
	cmd.Flags().BoolVarP(&listFlag, "list", "l", false, "List all branches")

	return cmd
}
