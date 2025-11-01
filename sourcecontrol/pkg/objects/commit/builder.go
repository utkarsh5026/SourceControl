package commit

import (
	"fmt"
	"strings"
)

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
