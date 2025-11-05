package main

import (
	"context"
	"fmt"
	"time"

	"github.com/spf13/cobra"
	"github.com/utkarsh5026/SourceControl/pkg/commitmanager"
	"github.com/utkarsh5026/SourceControl/pkg/objects"
)

func newLogCmd() *cobra.Command {
	var limit int

	cmd := &cobra.Command{
		Use:   "log",
		Short: "Show commit logs",
		Long: `Show the commit logs.
Displays the commit history starting from the current HEAD.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			// Find repository
			repo, err := findRepository()
			if err != nil {
				return err
			}

			// Create commit manager
			ctx := context.Background()
			commitMgr := commitmanager.NewManager(repo)
			if err := commitMgr.Initialize(ctx); err != nil {
				return fmt.Errorf("failed to initialize commit manager: %w", err)
			}

			// Get history (empty SHA means start from HEAD)
			history, err := commitMgr.GetHistory(ctx, objects.ObjectHash(""), limit)
			if err != nil {
				return fmt.Errorf("failed to get history: %w", err)
			}

			// Display commits
			if len(history) == 0 {
				fmt.Println("No commits yet")
				return nil
			}

			for _, commit := range history {
				fmt.Printf("%s commit %s\n", colorYellow("commit"), commit.SHA.String())
				fmt.Printf("Author: %s <%s>\n", commit.Author.Name, commit.Author.Email)
				fmt.Printf("Date:   %s\n\n", commit.Author.When.Time().Format(time.RFC1123))
				fmt.Printf("    %s\n\n", commit.Message)
			}

			return nil
		},
	}

	cmd.Flags().IntVarP(&limit, "limit", "n", 20, "Limit the number of commits to show")

	return cmd
}
