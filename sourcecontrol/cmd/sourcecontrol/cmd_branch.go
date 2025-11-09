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
	var renameFlag bool
	var verboseFlag bool
	var forceFlag bool
	var startPoint string

	cmd := &cobra.Command{
		Use:   "branch [branch-name] [start-point]",
		Short: "List, create, delete, or rename branches",
		Long: `List, create, delete, or rename branches.

With no arguments, lists all branches. The current branch is highlighted.
With a name argument, creates a new branch.

Examples:
  # List all branches
  srcc branch

  # List branches with verbose output
  srcc branch -v

  # Create a new branch
  srcc branch feature-name

  # Create a new branch from a specific commit
  srcc branch feature-name abc123

  # Create a branch with --start-point flag
  srcc branch feature-name --start-point=main

  # Delete a branch
  srcc branch -d feature-name

  # Force delete a branch
  srcc branch -D feature-name

  # Rename the current branch
  srcc branch -m new-name

  # Rename a specific branch
  srcc branch -m old-name new-name

  # Force rename (overwrite existing)
  srcc branch -M old-name new-name`,
		Args: cobra.MaximumNArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			repo, err := findRepository()
			if err != nil {
				return err
			}

			manager := branch.NewManager(repo)
			ctx := context.Background()

			switch {
			case renameFlag:
				return renameBranch(ctx, args, manager, forceFlag)
			case deleteFlag:
				return deleteBranch(ctx, args, manager, forceFlag)
			case len(args) == 0 || listFlag:
				return listBranches(ctx, manager, verboseFlag)
			default:
				return createBranch(ctx, args, manager, startPoint, forceFlag)
			}
		},
	}

	cmd.Flags().BoolVarP(&deleteFlag, "delete", "d", false, "Delete a branch")
	cmd.Flags().BoolVarP(&listFlag, "list", "l", false, "List all branches")
	cmd.Flags().BoolVarP(&renameFlag, "move", "m", false, "Rename a branch")
	cmd.Flags().BoolVarP(&verboseFlag, "verbose", "v", false, "Show verbose output with commit info")
	cmd.Flags().BoolVarP(&forceFlag, "force", "f", false, "Force operation (use with -d or -m)")
	cmd.Flags().StringVar(&startPoint, "start-point", "", "Create branch from this commit/branch")
	cmd.Flags().BoolP("force-delete", "D", false, "Force delete a branch (shorthand for -d -f)")
	cmd.Flags().BoolP("force-move", "M", false, "Force rename a branch (shorthand for -m -f)")

	cmd.PreRunE = func(cmd *cobra.Command, args []string) error {
		if forceDelete, _ := cmd.Flags().GetBool("force-delete"); forceDelete {
			deleteFlag = true
			forceFlag = true
		}
		if forceMove, _ := cmd.Flags().GetBool("force-move"); forceMove {
			renameFlag = true
			forceFlag = true
		}
		return nil
	}

	return cmd
}

func renameBranch(ctx context.Context, args []string, manager *branch.Manager, force bool) error {
	var oldName, newName string

	if len(args) == 0 {
		return fmt.Errorf("new branch name required for rename")
	} else if len(args) == 1 {
		currentBranch, err := manager.CurrentBranch()
		if err != nil {
			return fmt.Errorf("failed to get current branch: %w", err)
		}
		if currentBranch == "" {
			return fmt.Errorf("not on any branch (detached HEAD)")
		}
		oldName = currentBranch
		newName = args[0]
	} else {
		oldName = args[0]
		newName = args[1]
	}

	opts := []branch.RenameOption{}
	if force {
		opts = append(opts, branch.WithForceRename())
	}

	if err := manager.RenameBranch(ctx, oldName, newName, opts...); err != nil {
		return fmt.Errorf("failed to rename branch: %w", err)
	}

	fmt.Printf("Branch %s renamed to %s\n", oldName, newName)
	return nil
}

func deleteBranch(ctx context.Context, args []string, manager *branch.Manager, force bool) error {
	if len(args) == 0 {
		return fmt.Errorf("branch name required for deletion")
	}
	branchName := args[0]

	opts := []branch.DeleteOption{}
	if force {
		opts = append(opts, branch.WithForceDelete())
	}

	if err := manager.DeleteBranch(ctx, branchName, opts...); err != nil {
		return fmt.Errorf("failed to delete branch: %w", err)
	}

	fmt.Printf("Deleted branch %s\n", branchName)
	return nil
}

func listBranches(ctx context.Context, manager *branch.Manager, verbose bool) error {
	branches, err := manager.ListBranches(ctx)
	if err != nil {
		return fmt.Errorf("failed to list branches: %w", err)
	}
	currentBranch, _ := manager.CurrentBranch()

	if len(branches) == 0 {
		fmt.Println("No branches found")
		return nil
	}

	for _, br := range branches {
		prefix := "  "
		if br.Name == currentBranch {
			prefix = "* "
		}

		if verbose {
			fmt.Printf("%s%-20s %s %s\n",
				prefix,
				br.Name,
				br.SHA.Short(),
				br.LastCommitMessage)
		} else {
			fmt.Printf("%s%s\n", prefix, br.Name)
		}
	}

	return nil
}

func createBranch(ctx context.Context, args []string, manager *branch.Manager, startPoint string, force bool) error {
	branchName := args[0]
	opts := []branch.CreateOption{}

	if len(args) > 1 {
		opts = append(opts, branch.WithStartPoint(args[1]))
	} else if startPoint != "" {
		opts = append(opts, branch.WithStartPoint(startPoint))
	}

	if force {
		opts = append(opts, branch.WithForceCreate())
	}

	if _, err := manager.CreateBranch(ctx, branchName, opts...); err != nil {
		return fmt.Errorf("failed to create branch: %w", err)
	}

	fmt.Printf("Created branch %s\n", branchName)
	return nil
}
