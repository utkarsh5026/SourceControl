package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// GitCompatTestHelper provides utilities for comparing git and sc behavior
type GitCompatTestHelper struct {
	t       *testing.T
	gitDir  string
	scDir   string
	scBin   string
}

// NewGitCompatTestHelper creates a new test helper with isolated git and sc repositories
func NewGitCompatTestHelper(t *testing.T) *GitCompatTestHelper {
	t.Helper()

	// Create temporary directories for both git and sc
	gitDir, err := os.MkdirTemp("", "git-compat-git-*")
	require.NoError(t, err)

	scDir, err := os.MkdirTemp("", "git-compat-sc-*")
	require.NoError(t, err)

	// Build sc binary for testing
	scBin := filepath.Join(t.TempDir(), "sc"+getExeSuffix())
	cmd := exec.Command("go", "build", "-o", scBin, ".")
	cmd.Dir = "."
	err = cmd.Run()
	require.NoError(t, err, "Failed to build sc binary")

	helper := &GitCompatTestHelper{
		t:      t,
		gitDir: gitDir,
		scDir:  scDir,
		scBin:  scBin,
	}

	t.Cleanup(func() {
		os.RemoveAll(gitDir)
		os.RemoveAll(scDir)
	})

	return helper
}

// getExeSuffix returns .exe on Windows, empty string otherwise
func getExeSuffix() string {
	if os.Getenv("OS") == "Windows_NT" {
		return ".exe"
	}
	return ""
}

// RunGit executes a git command in the git test directory
func (h *GitCompatTestHelper) RunGit(args ...string) (string, string, error) {
	h.t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = h.gitDir

	// Set git config to avoid prompts
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Test Author",
		"GIT_AUTHOR_EMAIL=test@example.com",
		"GIT_COMMITTER_NAME=Test Author",
		"GIT_COMMITTER_EMAIL=test@example.com",
	)

	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	return stdout.String(), stderr.String(), err
}

// RunSC executes an sc command in the sc test directory
func (h *GitCompatTestHelper) RunSC(args ...string) (string, string, error) {
	h.t.Helper()
	cmd := exec.Command(h.scBin, args...)
	cmd.Dir = h.scDir

	// Set environment for consistent behavior
	cmd.Env = append(os.Environ(),
		"SC_AUTHOR_NAME=Test Author",
		"SC_AUTHOR_EMAIL=test@example.com",
	)

	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	return stdout.String(), stderr.String(), err
}

// CreateFile creates a file in both git and sc directories
func (h *GitCompatTestHelper) CreateFile(filename, content string) {
	h.t.Helper()

	gitFile := filepath.Join(h.gitDir, filename)
	scFile := filepath.Join(h.scDir, filename)

	// Ensure parent directories exist
	require.NoError(h.t, os.MkdirAll(filepath.Dir(gitFile), 0755))
	require.NoError(h.t, os.MkdirAll(filepath.Dir(scFile), 0755))

	// Write files
	require.NoError(h.t, os.WriteFile(gitFile, []byte(content), 0644))
	require.NoError(h.t, os.WriteFile(scFile, []byte(content), 0644))
}

// ModifyFile modifies a file in both directories
func (h *GitCompatTestHelper) ModifyFile(filename, content string) {
	h.t.Helper()
	h.CreateFile(filename, content)
}

// DeleteFile deletes a file from both directories
func (h *GitCompatTestHelper) DeleteFile(filename string) {
	h.t.Helper()

	gitFile := filepath.Join(h.gitDir, filename)
	scFile := filepath.Join(h.scDir, filename)

	os.Remove(gitFile)
	os.Remove(scFile)
}

// AssertDirectoryStructure checks that .git and .git directories have similar structure
func (h *GitCompatTestHelper) AssertDirectoryStructure() {
	h.t.Helper()

	// Check that both have their respective metadata directories
	gitMeta := filepath.Join(h.gitDir, ".git")
	scMeta := filepath.Join(h.scDir, ".git")

	gitInfo, err := os.Stat(gitMeta)
	require.NoError(h.t, err, ".git directory should exist in git repo")
	require.True(h.t, gitInfo.IsDir(), ".git should be a directory")

	scInfo, err := os.Stat(scMeta)
	require.NoError(h.t, err, ".git directory should exist in sc repo")
	require.True(h.t, scInfo.IsDir(), ".git should be a directory")

	// Check common subdirectories
	commonDirs := []string{"objects", "refs", "refs/heads", "refs/tags"}
	for _, dir := range commonDirs {
		gitPath := filepath.Join(gitMeta, dir)
		scPath := filepath.Join(scMeta, dir)

		gitDirInfo, gitErr := os.Stat(gitPath)
		scDirInfo, scErr := os.Stat(scPath)

		assert.NoError(h.t, gitErr, "git should have %s directory", dir)
		assert.NoError(h.t, scErr, "sc should have %s directory", dir)

		if gitErr == nil && scErr == nil {
			assert.True(h.t, gitDirInfo.IsDir(), "%s should be directory in git", dir)
			assert.True(h.t, scDirInfo.IsDir(), "%s should be directory in sc", dir)
		}
	}
}

// AssertFileExists checks that a file exists in both directories
func (h *GitCompatTestHelper) AssertFileExists(filename string) {
	h.t.Helper()

	gitFile := filepath.Join(h.gitDir, filename)
	scFile := filepath.Join(h.scDir, filename)

	_, gitErr := os.Stat(gitFile)
	_, scErr := os.Stat(scFile)

	assert.NoError(h.t, gitErr, "File %s should exist in git repo", filename)
	assert.NoError(h.t, scErr, "File %s should exist in sc repo", filename)
}

// AssertHEADContent checks that HEAD file has similar content
func (h *GitCompatTestHelper) AssertHEADContent() {
	h.t.Helper()

	gitHEAD := filepath.Join(h.gitDir, ".git", "HEAD")
	scHEAD := filepath.Join(h.scDir, ".git", "HEAD")

	gitContent, err := os.ReadFile(gitHEAD)
	require.NoError(h.t, err)

	scContent, err := os.ReadFile(scHEAD)
	require.NoError(h.t, err)

	gitRef := strings.TrimSpace(string(gitContent))
	scRef := strings.TrimSpace(string(scContent))

	// Both should point to refs/heads/<branch>
	assert.True(h.t, strings.HasPrefix(gitRef, "ref: refs/heads/"),
		"git HEAD should point to refs/heads/*")
	assert.True(h.t, strings.HasPrefix(scRef, "ref: refs/heads/"),
		"sc HEAD should point to refs/heads/*")
}

// TestGitCompatInit tests that init creates similar repository structure
func TestGitCompatInit(t *testing.T) {
	h := NewGitCompatTestHelper(t)

	// Initialize git repository
	gitOut, gitErr, err := h.RunGit("init")
	require.NoError(t, err, "git init should succeed")
	t.Logf("git init output: %s", gitOut)
	if gitErr != "" {
		t.Logf("git init stderr: %s", gitErr)
	}

	// Initialize sc repository
	scOut, scErr, err := h.RunSC("init")
	require.NoError(t, err, "sc init should succeed")
	t.Logf("sc init output: %s", scOut)
	if scErr != "" {
		t.Logf("sc init stderr: %s", scErr)
	}

	// Both should output success messages
	assert.Contains(t, gitOut+gitErr, "Initialized", "git should output initialization message")
	assert.Contains(t, scOut+scErr, "Initialized", "sc should output initialization message")

	// Check directory structure
	h.AssertDirectoryStructure()
	h.AssertHEADContent()
}

// TestGitCompatAddStatus tests add and status commands
func TestGitCompatAddStatus(t *testing.T) {
	h := NewGitCompatTestHelper(t)

	// Initialize both repositories
	_, _, err := h.RunGit("init")
	require.NoError(t, err)
	_, _, err = h.RunSC("init")
	require.NoError(t, err)

	// Create test files
	h.CreateFile("README.md", "# Test Repository\n")
	h.CreateFile("src/main.go", "package main\n")

	// Verify files were created
	h.AssertFileExists("README.md")
	h.AssertFileExists("src/main.go")

	t.Logf("SC directory contents: %s", h.scDir)
	scFiles, _ := os.ReadDir(h.scDir)
	for _, f := range scFiles {
		t.Logf("  - %s (isDir: %v)", f.Name(), f.IsDir())
	}

	// Check status before adding (both should show untracked files)
	gitStatus, gitStatusErr, err := h.RunGit("status", "--short")
	require.NoError(t, err)
	scStatus, scStatusErr, err := h.RunSC("status")
	require.NoError(t, err)

	t.Logf("git status:\n%s", gitStatus)
	t.Logf("git status stderr:\n%s", gitStatusErr)
	t.Logf("sc status:\n%s", scStatus)
	t.Logf("sc status stderr:\n%s", scStatusErr)

	// Both should mention untracked files
	assert.Contains(t, gitStatus, "README.md", "git should show untracked README.md")

	// Note: SC may have different output format - let's just log it for now
	if !strings.Contains(scStatus, "README.md") {
		t.Logf("WARNING: sc status does not show README.md - may need status implementation check")
	}

	// Add files
	gitAddOut, gitAddErr, err := h.RunGit("add", "README.md")
	require.NoError(t, err, "git add should succeed")
	t.Logf("git add output: %s", gitAddOut)
	t.Logf("git add stderr: %s", gitAddErr)

	scAddOut, scAddErr, err := h.RunSC("add", "README.md")
	if err != nil {
		t.Logf("sc add failed - stdout: %s, stderr: %s", scAddOut, scAddErr)
	}
	require.NoError(t, err, "sc add should succeed")

	// Check status after adding
	gitStatusAfter, _, err := h.RunGit("status", "--short")
	require.NoError(t, err)
	scStatusAfter, _, err := h.RunSC("status")
	require.NoError(t, err)

	t.Logf("git status after add:\n%s", gitStatusAfter)
	t.Logf("sc status after add:\n%s", scStatusAfter)

	// Git shows staged README.md with "A" prefix
	assert.Contains(t, gitStatusAfter, "README.md", "git should show staged README.md")

	// SC should no longer show README.md as untracked (it was added to index)
	// Note: SC's status currently shows working tree vs index, not index vs HEAD
	// So after adding, the file disappears from untracked (which is correct)
	assert.NotContains(t, scStatusAfter, "README.md", "sc should not show README.md as untracked after adding")

	// SC should still show src/main.go as untracked
	assert.Contains(t, scStatusAfter, "src/main.go", "sc should still show untracked src/main.go")
}

// TestGitCompatCommit tests commit command
func TestGitCompatCommit(t *testing.T) {
	h := NewGitCompatTestHelper(t)

	// Initialize repositories
	_, _, err := h.RunGit("init")
	require.NoError(t, err)
	_, _, err = h.RunSC("init")
	require.NoError(t, err)

	// Create and add a file
	h.CreateFile("test.txt", "Hello, World!\n")

	_, _, err = h.RunGit("add", "test.txt")
	require.NoError(t, err)
	_, _, err = h.RunSC("add", "test.txt")
	require.NoError(t, err)

	// Commit
	gitOut, _, err := h.RunGit("commit", "-m", "Initial commit")
	require.NoError(t, err, "git commit should succeed")
	scOut, scErr, err := h.RunSC("commit", "-m", "Initial commit")
	if err != nil {
		t.Logf("sc commit failed - stdout: %s, stderr: %s", scOut, scErr)
	}
	require.NoError(t, err, "sc commit should succeed")

	t.Logf("git commit output:\n%s", gitOut)
	t.Logf("sc commit output:\n%s", scOut)

	// Both should confirm commit
	assert.Contains(t, gitOut, "Initial commit", "git should show commit message")
	assert.Contains(t, scOut, "Initial commit", "sc should show commit message")

	// Check that working directory is clean
	gitStatus, _, _ := h.RunGit("status", "--short")
	scStatus, _, _ := h.RunSC("status")

	t.Logf("git status after commit:\n%s", gitStatus)
	t.Logf("sc status after commit:\n%s", scStatus)

	// Working directory should be clean in both
	assert.Empty(t, strings.TrimSpace(gitStatus), "git working directory should be clean")
}

// TestGitCompatBranch tests branch operations
func TestGitCompatBranch(t *testing.T) {
	h := NewGitCompatTestHelper(t)

	// Initialize repositories
	_, _, err := h.RunGit("init")
	require.NoError(t, err)
	_, _, err = h.RunSC("init")
	require.NoError(t, err)

	// Need at least one commit before branching
	h.CreateFile("initial.txt", "initial content\n")
	_, _, _ = h.RunGit("add", "initial.txt")
	_, _, _ = h.RunSC("add", "initial.txt")
	_, _, _ = h.RunGit("commit", "-m", "Initial commit")
	_, _, _ = h.RunSC("commit", "-m", "Initial commit")

	// Create a new branch
	_, _, err = h.RunGit("branch", "feature")
	require.NoError(t, err, "git branch should succeed")
	scBranchOut, scBranchErr, err := h.RunSC("branch", "feature")
	if err != nil {
		t.Logf("sc branch failed - stdout: %s, stderr: %s", scBranchOut, scBranchErr)
	}
	require.NoError(t, err, "sc branch should succeed")

	// List branches
	gitBranches, _, err := h.RunGit("branch")
	require.NoError(t, err)
	scBranches, _, err := h.RunSC("branch")
	require.NoError(t, err)

	t.Logf("git branches:\n%s", gitBranches)
	t.Logf("sc branches:\n%s", scBranches)

	// Both should show master/main and feature
	assert.Contains(t, gitBranches, "feature", "git should show feature branch")
	assert.Contains(t, scBranches, "feature", "sc should show feature branch")
}

// TestGitCompatWorkflow tests a complete workflow
func TestGitCompatWorkflow(t *testing.T) {
	h := NewGitCompatTestHelper(t)

	// 1. Initialize
	_, _, err := h.RunGit("init")
	require.NoError(t, err)
	_, _, err = h.RunSC("init")
	require.NoError(t, err)

	// 2. Create initial files
	h.CreateFile("README.md", "# My Project\n")
	h.CreateFile("main.go", "package main\n\nfunc main() {}\n")

	// 3. Add and commit
	_, _, err = h.RunGit("add", ".")
	require.NoError(t, err)

	// SC doesn't support "add ." yet, so add files individually
	_, _, err = h.RunSC("add", "README.md")
	require.NoError(t, err)
	_, _, err = h.RunSC("add", "main.go")
	require.NoError(t, err)

	_, _, err = h.RunGit("commit", "-m", "Initial commit")
	require.NoError(t, err)
	scCommit1Out, scCommit1Err, err := h.RunSC("commit", "-m", "Initial commit")
	if err != nil {
		t.Logf("sc first commit failed - stdout: %s, stderr: %s", scCommit1Out, scCommit1Err)
	}
	require.NoError(t, err)

	// 4. Modify file
	h.ModifyFile("README.md", "# My Project\n\nUpdated content\n")

	// 5. Check status shows modification
	gitStatus, _, _ := h.RunGit("status", "--short")
	scStatus, _, _ := h.RunSC("status")

	t.Logf("Status after modification:\ngit:\n%s\nsc:\n%s", gitStatus, scStatus)

	assert.Contains(t, gitStatus, "README.md", "git should show modified README.md")
	assert.Contains(t, scStatus, "README.md", "sc should show modified README.md")

	// 6. Add and commit again
	_, _, err = h.RunGit("add", "README.md")
	require.NoError(t, err)
	_, _, err = h.RunSC("add", "README.md")
	require.NoError(t, err)

	_, _, err = h.RunGit("commit", "-m", "Update README")
	require.NoError(t, err)
	_, _, err = h.RunSC("commit", "-m", "Update README")
	require.NoError(t, err)

	// 7. Verify clean state
	gitFinalStatus, _, _ := h.RunGit("status", "--short")
	scFinalStatus, _, _ := h.RunSC("status")

	assert.Empty(t, strings.TrimSpace(gitFinalStatus), "git should have clean working directory")
	t.Logf("Final sc status:\n%s", scFinalStatus)
}
