package commit

import (
	"bytes"
	"fmt"
	"io"
	"strings"

	"github.com/utkarsh5026/SourceControl/pkg/objects"
)

// Commit represents a Git commit object implementation.
//
// A commit object represents a snapshot in the repository's history. It contains:
// - A reference to a tree object (the root directory snapshot)
// - Zero or more parent commit references
// - Author information (who wrote the changes)
// - Committer information (who committed the changes)
// - A commit message describing the changes
//
// Commit Object Structure:
// ┌─────────────────────────────────────────────────────────────────┐
// │ Header: "commit" SPACE size NULL                                │
// │ "tree" SPACE tree-sha LF                                        │
// │ "parent" SPACE parent-sha LF (zero or more)                     │
// │ "author" SPACE name SPACE email SPACE timestamp SPACE tz LF     │
// │ "committer" SPACE name SPACE email SPACE timestamp SPACE tz LF  │
// │ LF                                                              │
// │ commit-message                                                  │
// └─────────────────────────────────────────────────────────────────┘
//
// Example commit object content:
// tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904
// author John Doe <john@example.com> 1609459200 +0000
// committer John Doe <john@example.com> 1609459200 +0000
//
// # Initial commit
//
// Commits form a directed acyclic graph (DAG) where:
// - Each commit points to its parent(s)
// - Most commits have exactly one parent
// - Merge commits have multiple parents
// - The initial commit has no parents
// - The graph represents the complete history of the repository
type Commit struct {
	TreeSHA    string
	ParentSHAs []string
	Author     *CommitPerson
	Committer  *CommitPerson
	Message    string
	sha        *[20]byte // cached SHA
}

// CommitBuilder provides a fluent interface for building commits
type CommitBuilder struct {
	commit *Commit
	errs   []error
}

// NewCommitBuilder creates a new CommitBuilder
func NewCommitBuilder() *CommitBuilder {
	return &CommitBuilder{
		commit: &Commit{
			ParentSHAs: make([]string, 0),
		},
		errs: make([]error, 0),
	}
}

// Tree sets the tree SHA for the commit
func (b *CommitBuilder) Tree(treeSHA string) *CommitBuilder {
	if err := validateSHA(treeSHA); err != nil {
		b.errs = append(b.errs, fmt.Errorf("invalid tree SHA: %w", err))
	} else {
		b.commit.TreeSHA = strings.ToLower(treeSHA)
	}
	return b
}

// Parent adds a parent SHA to the commit
func (b *CommitBuilder) Parent(parentSHA string) *CommitBuilder {
	if err := validateSHA(parentSHA); err != nil {
		b.errs = append(b.errs, fmt.Errorf("invalid parent SHA: %w", err))
	} else {
		b.commit.ParentSHAs = append(b.commit.ParentSHAs, strings.ToLower(parentSHA))
	}
	return b
}

// Parents sets multiple parent SHAs for the commit
func (b *CommitBuilder) Parents(parentSHAs ...string) *CommitBuilder {
	for _, sha := range parentSHAs {
		b.Parent(sha)
	}
	return b
}

// Author sets the author of the commit
func (b *CommitBuilder) Author(author *CommitPerson) *CommitBuilder {
	if author == nil {
		b.errs = append(b.errs, fmt.Errorf("author cannot be nil"))
	} else {
		b.commit.Author = author
	}
	return b
}

// Committer sets the committer of the commit
func (b *CommitBuilder) Committer(committer *CommitPerson) *CommitBuilder {
	if committer == nil {
		b.errs = append(b.errs, fmt.Errorf("committer cannot be nil"))
	} else {
		b.commit.Committer = committer
	}
	return b
}

// Message sets the commit message
func (b *CommitBuilder) Message(message string) *CommitBuilder {
	b.commit.Message = message
	return b
}

// Build creates the Commit, returning an error if validation fails
func (b *CommitBuilder) Build() (*Commit, error) {
	if len(b.errs) > 0 {
		return nil, fmt.Errorf("commit builder errors: %v", b.errs)
	}

	if err := b.commit.Validate(); err != nil {
		return nil, err
	}

	return b.commit, nil
}

// Validate checks that all required fields are present
func (c *Commit) Validate() error {
	if c.TreeSHA == "" {
		return fmt.Errorf("tree SHA is required")
	}
	if c.Author == nil {
		return fmt.Errorf("author is required")
	}
	if c.Committer == nil {
		return fmt.Errorf("committer is required")
	}
	return nil
}

// Type returns the object type
func (c *Commit) Type() objects.ObjectType {
	return objects.CommitType
}

// Content returns the raw content of the commit (without header)
func (c *Commit) Content() ([]byte, error) {
	var buf strings.Builder

	// Tree line
	buf.WriteString("tree ")
	buf.WriteString(c.TreeSHA)
	buf.WriteString("\n")

	// Parent lines
	for _, parent := range c.ParentSHAs {
		buf.WriteString("parent ")
		buf.WriteString(parent)
		buf.WriteString("\n")
	}

	// Author line
	buf.WriteString("author ")
	buf.WriteString(c.Author.FormatForGit())
	buf.WriteString("\n")

	// Committer line
	buf.WriteString("committer ")
	buf.WriteString(c.Committer.FormatForGit())
	buf.WriteString("\n")

	// Blank line before message
	buf.WriteString("\n")

	// Message
	buf.WriteString(c.Message)

	return []byte(buf.String()), nil
}

// Hash returns the SHA-1 hash of the commit
func (c *Commit) Hash() ([20]byte, error) {
	if c.sha != nil {
		return *c.sha, nil
	}

	// Calculate SHA if not cached
	content, err := c.Content()
	if err != nil {
		return [20]byte{}, fmt.Errorf("failed to get content: %w", err)
	}

	header := fmt.Sprintf("%s %d%c", objects.CommitType, len(content), objects.NullByte)
	fullData := append([]byte(header), content...)
	sha := objects.CreateSha(fullData)
	c.sha = &sha
	return sha, nil
}

// Size returns the size of the content in bytes
func (c *Commit) Size() (int64, error) {
	content, err := c.Content()
	if err != nil {
		return 0, err
	}
	return int64(len(content)), nil
}

// Serialize writes the commit in Git's storage format
func (c *Commit) Serialize(w io.Writer) error {
	if err := c.Validate(); err != nil {
		return fmt.Errorf("invalid commit: %w", err)
	}

	content, err := c.Content()
	if err != nil {
		return fmt.Errorf("failed to get content: %w", err)
	}

	header := fmt.Sprintf("%s %d%c", objects.CommitType, len(content), objects.NullByte)

	if _, err := w.Write([]byte(header)); err != nil {
		return fmt.Errorf("failed to write commit header: %w", err)
	}

	if _, err := w.Write(content); err != nil {
		return fmt.Errorf("failed to write commit content: %w", err)
	}

	return nil
}

// String returns a human-readable representation
func (c *Commit) String() string {
	hash, err := c.Hash()
	if err != nil {
		return fmt.Sprintf("Commit{tree: %s, parents: %d, error: %v}",
			c.TreeSHA, len(c.ParentSHAs), err)
	}
	return fmt.Sprintf("Commit{hash: %x, tree: %s, parents: %d, message: %.50s...}",
		hash, c.TreeSHA, len(c.ParentSHAs), c.Message)
}

// ParseCommit parses a commit object from serialized data (with header)
func ParseCommit(data []byte) (*Commit, error) {
	content, err := objects.ParseContent(data, objects.CommitType)
	if err != nil {
		return nil, err
	}

	commit, err := parseCommitContent(string(content))
	if err != nil {
		return nil, err
	}

	// Cache the SHA
	sha := objects.CreateSha(data)
	commit.sha = &sha

	return commit, nil
}

// parseCommitContent parses the commit content (without header)
func parseCommitContent(content string) (*Commit, error) {
	lines := strings.Split(content, "\n")
	commit := &Commit{
		ParentSHAs: make([]string, 0),
	}

	messageStartIndex := -1

	for i, line := range lines {
		// Empty line indicates start of message
		if strings.TrimSpace(line) == "" {
			messageStartIndex = i + 1
			break
		}

		if err := parseCommitLine(commit, line); err != nil {
			return nil, err
		}
	}

	if err := commit.Validate(); err != nil {
		return nil, fmt.Errorf("invalid commit: %w", err)
	}

	// Extract message
	if messageStartIndex != -1 && messageStartIndex < len(lines) {
		commit.Message = strings.Join(lines[messageStartIndex:], "\n")
	}

	return commit, nil
}

// parseCommitLine parses a single header line
func parseCommitLine(commit *Commit, line string) error {
	switch {
	case strings.HasPrefix(line, "tree "):
		if commit.TreeSHA != "" {
			return fmt.Errorf("multiple tree entries found")
		}
		treeSHA := strings.TrimPrefix(line, "tree ")
		if err := validateSHA(treeSHA); err != nil {
			return fmt.Errorf("invalid tree SHA: %w", err)
		}
		commit.TreeSHA = strings.ToLower(treeSHA)

	case strings.HasPrefix(line, "parent "):
		parentSHA := strings.TrimPrefix(line, "parent ")
		if err := validateSHA(parentSHA); err != nil {
			return fmt.Errorf("invalid parent SHA: %w", err)
		}
		commit.ParentSHAs = append(commit.ParentSHAs, strings.ToLower(parentSHA))

	case strings.HasPrefix(line, "author "):
		if commit.Author != nil {
			return fmt.Errorf("multiple author entries found")
		}
		authorData := strings.TrimPrefix(line, "author ")
		author, err := ParseCommitPerson(authorData)
		if err != nil {
			return fmt.Errorf("invalid author: %w", err)
		}
		commit.Author = author

	case strings.HasPrefix(line, "committer "):
		if commit.Committer != nil {
			return fmt.Errorf("multiple committer entries found")
		}
		committerData := strings.TrimPrefix(line, "committer ")
		committer, err := ParseCommitPerson(committerData)
		if err != nil {
			return fmt.Errorf("invalid committer: %w", err)
		}
		commit.Committer = committer

	default:
		return fmt.Errorf("unknown header line: %s", line)
	}

	return nil
}

// IsInitialCommit returns true if this commit has no parents
func (c *Commit) IsInitialCommit() bool {
	return len(c.ParentSHAs) == 0
}

// IsMergeCommit returns true if this commit has multiple parents
func (c *Commit) IsMergeCommit() bool {
	return len(c.ParentSHAs) > 1
}

// validateSHA validates a SHA-1 hash string
func validateSHA(sha string) error {
	if len(sha) != 40 {
		return fmt.Errorf("SHA must be 40 characters long, got %d", len(sha))
	}

	for _, c := range sha {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return fmt.Errorf("SHA must contain only hex characters")
		}
	}

	return nil
}

// ShortSHA returns the first 7 characters of the commit SHA
func (c *Commit) ShortSHA() (string, error) {
	hash, err := c.Hash()
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", hash[:4])[:7], nil
}

// Equal compares two commits for equality
func (c *Commit) Equal(other *Commit) bool {
	if other == nil {
		return false
	}

	if c.TreeSHA != other.TreeSHA {
		return false
	}

	if len(c.ParentSHAs) != len(other.ParentSHAs) {
		return false
	}

	for i, parent := range c.ParentSHAs {
		if parent != other.ParentSHAs[i] {
			return false
		}
	}

	if !c.Author.Equal(other.Author) {
		return false
	}

	if !c.Committer.Equal(other.Committer) {
		return false
	}

	return c.Message == other.Message
}

// Clone creates a deep copy of the commit
func (c *Commit) Clone() *Commit {
	clone := &Commit{
		TreeSHA:    c.TreeSHA,
		ParentSHAs: make([]string, len(c.ParentSHAs)),
		Author:     &CommitPerson{Name: c.Author.Name, Email: c.Author.Email, When: c.Author.When},
		Committer:  &CommitPerson{Name: c.Committer.Name, Email: c.Committer.Email, When: c.Committer.When},
		Message:    c.Message,
	}
	copy(clone.ParentSHAs, c.ParentSHAs)
	return clone
}

// HasParent checks if the commit has a specific parent SHA
func (c *Commit) HasParent(parentSHA string) bool {
	normalized := strings.ToLower(parentSHA)
	for _, parent := range c.ParentSHAs {
		if parent == normalized {
			return true
		}
	}
	return false
}

// HeaderSize returns the size of just the header fields (without message)
func (c *Commit) HeaderSize() int {
	var buf bytes.Buffer
	fmt.Fprintf(&buf, "tree %s\n", c.TreeSHA)
	for _, parent := range c.ParentSHAs {
		fmt.Fprintf(&buf, "parent %s\n", parent)
	}
	fmt.Fprintf(&buf, "author %s\n", c.Author.FormatForGit())
	fmt.Fprintf(&buf, "committer %s\n", c.Committer.FormatForGit())
	buf.WriteString("\n")
	return buf.Len()
}
