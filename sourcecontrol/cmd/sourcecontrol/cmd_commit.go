package main

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"
	"github.com/utkarsh5026/SourceControl/pkg/commitmanager"
)

func newCommitCmd() *cobra.Command {
	var message string

	cmd := &cobra.Command{
		Use:   "commit",
		Short: "Record changes to the repository",
		Long: `Create a new commit with the staged changes.
Commits are snapshots of your project at a specific point in time.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			// Find repository
			repo, err := findRepository()
			if err != nil {
				return err
			}

			// Validate message
			if message == "" {
				return fmt.Errorf("commit message required (use -m flag)")
			}

			// Create commit manager
			ctx := context.Background()
			commitMgr := commitmanager.NewManager(repo)
			if err := commitMgr.Initialize(ctx); err != nil {
				return fmt.Errorf("failed to initialize commit manager: %w", err)
			}

			// Create commit
			result, err := commitMgr.CreateCommit(ctx, commitmanager.CommitOptions{
				Message: message,
			})
			if err != nil {
				return fmt.Errorf("failed to create commit: %w", err)
			}

			// Display result
			fmt.Printf("[%s] %s\n", result.SHA.Short(), result.Message)
			fmt.Printf("Author: %s <%s>\n", result.Author.Name, result.Author.Email)

			return nil
		},
	}

	cmd.Flags().StringVarP(&message, "message", "m", "", "Commit message")

	return cmd
}
