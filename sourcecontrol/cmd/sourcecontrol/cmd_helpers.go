package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/charmbracelet/lipgloss"
	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
	"github.com/utkarsh5026/SourceControl/pkg/repository/sourcerepo"
)

// findRepository finds the repository starting from current directory
func findRepository() (*sourcerepo.SourceRepository, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return nil, fmt.Errorf("failed to get current directory: %w", err)
	}

	dir := cwd
	for {
		sourceDir := filepath.Join(dir, scpath.SourceDir)
		if info, err := os.Stat(sourceDir); err == nil && info.IsDir() {
			repoPath, err := scpath.NewRepositoryPath(dir)
			if err != nil {
				return nil, fmt.Errorf("invalid repository path: %w", err)
			}
			return sourcerepo.Open(repoPath)
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			return nil, fmt.Errorf("not a sourcecontrol repository (or any parent up to mount point)")
		}
		dir = parent
	}
}

// Lipgloss styles for beautiful CLI output
var (
	// Colors
	colorGreenStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("#00FF00")).Bold(true)
	colorRedStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("#FF0000")).Bold(true)
	colorYellowStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("#FFD700")).Bold(true)
	colorBlueStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("#00BFFF")).Bold(true)
	colorCyanStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("#00FFFF"))
	colorMagentaStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#FF00FF"))

	// Status indicators
	modifiedStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("#FFA500")).Bold(true)
	deletedStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("#FF4444")).Bold(true)
	addedStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("#00FF00")).Bold(true)
	untrackedStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#888888"))

	// Headers
	headerStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#FFFFFF")).
			Background(lipgloss.Color("#5F5FFF")).
			Padding(0, 1).
			MarginBottom(1)

	// Info box
	infoStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("#00BFFF")).
			Padding(0, 1)

	// Section header
	sectionStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FFFFFF")).
			Bold(true).
			Underline(true)
)

// Icons for different file states
const (
	IconModified  = "◉"
	IconDeleted   = "✗"
	IconAdded     = "+"
	IconUntracked = "?"
	IconBranch    = "⎇"
	IconCommit    = "⊚"
	IconAuthor    = "👤"
	IconDate      = "📅"
	IconCheck     = "✓"
)

// Color functions using lipgloss
func colorGreen(s string) string {
	return colorGreenStyle.Render(s)
}

func colorRed(s string) string {
	return colorRedStyle.Render(s)
}

func colorYellow(s string) string {
	return colorYellowStyle.Render(s)
}

func colorBlue(s string) string {
	return colorBlueStyle.Render(s)
}

func colorCyan(s string) string {
	return colorCyanStyle.Render(s)
}

func colorMagenta(s string) string {
	return colorMagentaStyle.Render(s)
}

// Status-specific formatting
func formatModified(path string) string {
	return fmt.Sprintf("  %s  %s", modifiedStyle.Render(IconModified), modifiedStyle.Render(path))
}

func formatDeleted(path string) string {
	return fmt.Sprintf("  %s  %s", deletedStyle.Render(IconDeleted), deletedStyle.Render(path))
}

func formatAdded(path string) string {
	return fmt.Sprintf("  %s  %s", addedStyle.Render(IconAdded), addedStyle.Render(path))
}

func formatUntracked(path string) string {
	return fmt.Sprintf("  %s  %s", untrackedStyle.Render(IconUntracked), untrackedStyle.Render(path))
}

// Section headers
func renderHeader(text string) string {
	return headerStyle.Render(text)
}

func renderSection(text string) string {
	return sectionStyle.Render(text)
}

func renderInfo(text string) string {
	return infoStyle.Render(text)
}
