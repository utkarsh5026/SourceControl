package main

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"
	"github.com/utkarsh5026/SourceControl/pkg/refs/branch"
)

func newCheckoutCmd() *cobra.Command {
	var createBranch bool
	var force bool
	var orphan bool
	var detach bool

	cmd := &cobra.Command{
		Use:   "checkout [branch-name|commit-sha]",
		Short: "Switch branches or restore working tree files",
		Long: `Switch to a different branch or checkout a specific commit.

Examples:
  # Switch to an existing branch
  srcc checkout main

  # Create and switch to a new branch
  srcc checkout -b feature-name

  # Create and switch to a new branch from a specific commit
  srcc checkout -b new-branch abc123

  # Checkout a specific commit (detached HEAD)
  srcc checkout abc123

  # Force checkout, discarding local changes
  srcc checkout -f branch-name

  # Create an orphan branch (no parent commits)
  srcc checkout --orphan new-root

  # Explicitly detach HEAD at current commit
  srcc checkout --detach HEAD`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			target := args[0]

			// Find repository
			repo, err := findRepository()
			if err != nil {
				return err
			}

			// Create branch manager
			manager := branch.NewManager(repo)
			ctx := context.Background()

			// Build checkout options
			var opts []branch.CheckoutOption

			if force {
				opts = append(opts, branch.WithForceCheckout())
			}

			if createBranch {
				opts = append(opts, branch.WithCreateBranch())
			}

			if orphan {
				opts = append(opts, branch.WithOrphan())
			}

			if detach {
				opts = append(opts, branch.WithDetach())
			}

			if err := manager.Checkout(ctx, target, opts...); err != nil {
				return fmt.Errorf("checkout failed: %w", err)
			}

			switch {
			case orphan:
				fmt.Printf("Switched to a new orphan branch '%s'\n", target)
			case createBranch:
				fmt.Printf("Switched to a new branch '%s'\n", target)
			case detach:
				fmt.Printf("HEAD is now at %s\n", target)
			default:
				detached, _ := manager.IsDetached()
				if detached {
					commitSHA, _ := manager.CurrentCommit()
					fmt.Printf("HEAD is now at %s\n", commitSHA.Short())
				} else {
					fmt.Printf("Switched to branch '%s'\n", target)
				}
			}

			return nil
		},
	}

	cmd.Flags().BoolVarP(&createBranch, "create", "b", false, "Create a new branch and switch to it")
	cmd.Flags().BoolVarP(&force, "force", "f", false, "Force checkout (discard local changes)")
	cmd.Flags().BoolVar(&orphan, "orphan", false, "Create a new orphan branch")
	cmd.Flags().BoolVarP(&detach, "detach", "d", false, "Detach HEAD at named commit")

	return cmd
}
