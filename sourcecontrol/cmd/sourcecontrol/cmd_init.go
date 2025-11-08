package main

import (
	"fmt"
	"path/filepath"

	"github.com/charmbracelet/lipgloss"
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
This creates a .git directory with all necessary subdirectories and files.`,
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

			// Styled success message
			successStyle := lipgloss.NewStyle().
				Bold(true).
				Foreground(lipgloss.Color("10"))

			checkMark := lipgloss.NewStyle().
				Foreground(lipgloss.Color("10")).
				Render("✓")

			pathStyle := lipgloss.NewStyle().
				Foreground(lipgloss.Color("12")).
				Render(fmt.Sprintf("%s/%s", absPath, scpath.SourceDir))

			if bare {
				fmt.Printf("%s %s %s\n", checkMark, successStyle.Render("Initialized empty bare SourceControl repository in"), pathStyle)
			} else {
				fmt.Printf("%s %s %s\n", checkMark, successStyle.Render("Initialized empty SourceControl repository in"), pathStyle)
			}

			return nil
		},
	}

	cmd.Flags().BoolVar(&bare, "bare", false, "Create a bare repository")

	return cmd
}
