package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"
	"github.com/olekukonko/tablewriter"
	"github.com/spf13/cobra"
	"github.com/utkarsh5026/SourceControl/pkg/commitmanager"
	"github.com/utkarsh5026/SourceControl/pkg/objects"
	"github.com/utkarsh5026/SourceControl/pkg/objects/commit"
)

func newLogCmd() *cobra.Command {
	var limit int
	var useTable bool

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
				fmt.Println(colorYellow("📝 No commits yet"))
				return nil
			}

			if useTable {
				displayCommitsAsTable(history)
			} else {
				displayCommitsDetailed(history)
			}

			return nil
		},
	}

	cmd.Flags().IntVarP(&limit, "limit", "n", 20, "Limit the number of commits to show")
	cmd.Flags().BoolVarP(&useTable, "table", "t", false, "Display commits in table format")

	return cmd
}

// displayCommitsDetailed shows commits in a detailed, beautiful format
func displayCommitsDetailed(history []*commit.Commit) {
	fmt.Println(renderHeader(" Commit History "))
	fmt.Println()

	commitBoxStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#5F5FFF")).
		Padding(1, 2).
		MarginBottom(1)

	commitHashStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FFD700")).
		Bold(true)

	authorStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#00BFFF"))

	dateStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#888888")).
		Italic(true)

	messageStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FFFFFF")).
		MarginTop(1)

	for i, c := range history {
		var content strings.Builder

		// Get commit hash
		commitHash, _ := c.Hash()

		// Commit hash with icon
		content.WriteString(fmt.Sprintf("%s %s\n",
			colorYellow(IconCommit),
			commitHashStyle.Render(commitHash.String())))

		// Author
		content.WriteString(fmt.Sprintf("%s %s\n",
			colorCyan(IconAuthor),
			authorStyle.Render(fmt.Sprintf("%s <%s>", c.Author.Name, c.Author.Email))))

		// Date
		content.WriteString(fmt.Sprintf("%s %s\n",
			colorMagenta(IconDate),
			dateStyle.Render(c.Author.When.Time().Format(time.RFC1123))))

		// Message
		content.WriteString(messageStyle.Render("\n" + c.Message))

		fmt.Println(commitBoxStyle.Render(content.String()))

		// Add separator between commits (except last one)
		if i < len(history)-1 {
			fmt.Println(lipgloss.NewStyle().Foreground(lipgloss.Color("#444444")).Render("  │"))
		}
	}
}

// displayCommitsAsTable shows commits in a compact table format
func displayCommitsAsTable(history []*commit.Commit) {
	fmt.Println(renderHeader(" Commit History "))
	fmt.Println()

	table := tablewriter.NewWriter(os.Stdout)
	table.Header("Commit", "Author", "Date", "Message")

	for _, c := range history {
		commitHash, _ := c.Hash()
		shortHash := commitHash.String()
		if len(shortHash) > 8 {
			shortHash = shortHash[:8]
		}

		message := c.Message
		if len(message) > 50 {
			message = message[:47] + "..."
		}

		table.Append(
			colorYellow(shortHash),
			colorCyan(c.Author.Name),
			colorMagenta(c.Author.When.Time().Format("2006-01-02 15:04")),
			message,
		)
	}

	table.Render()
}
