package commitmanager

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/utkarsh5026/SourceControl/pkg/common/logger"
	"github.com/utkarsh5026/SourceControl/pkg/config"
	"github.com/utkarsh5026/SourceControl/pkg/index"
	"github.com/utkarsh5026/SourceControl/pkg/objects"
	"github.com/utkarsh5026/SourceControl/pkg/objects/commit"
	"github.com/utkarsh5026/SourceControl/pkg/refs/branch"
	"github.com/utkarsh5026/SourceControl/pkg/repository/refs"
	"github.com/utkarsh5026/SourceControl/pkg/repository/sourcerepo"
)

// Manager handles the creation and management of Git commits.
//
// The commit creation process follows these steps:
//  1. Read the index to get staged changes
//  2. Build a tree object from the index
//  3. Get the current HEAD commit (parent)
//  4. Create a new commit object
//  5. Update the current branch reference
//
// This ensures that commits are properly linked in the Git DAG (Directed Acyclic Graph)
// and that references are updated atomically.
//
// Thread Safety:
// Manager is not thread-safe. External synchronization is required when
// accessing a Manager instance from multiple goroutines.
type Manager struct {
	repo          *sourcerepo.SourceRepository
	treeBuilder   *TreeBuilder
	refManager    *refs.RefManager
	branchManager *branch.Manager
	configManager *config.Manager
	typedConfig   *config.TypedConfig
	logger        *slog.Logger
}

// NewManager creates a new CommitManager instance
//
// Example:
//
//	repo := sourcerepo.NewSourceRepository()
//	repo.Initialize(scpath.RepositoryPath("/path/to/repo"))
//	mgr := commitmanager.NewManager(repo)
func NewManager(repo *sourcerepo.SourceRepository) *Manager {
	refMgr := refs.NewRefManager(repo)
	branchMgr := branch.NewManager(repo)
	configMgr := config.NewManager(repo.WorkingDirectory())
	typedConfig := config.NewTypedConfig(configMgr)

	return &Manager{
		repo:          repo,
		treeBuilder:   NewTreeBuilder(repo),
		refManager:    refMgr,
		branchManager: branchMgr,
		configManager: configMgr,
		typedConfig:   typedConfig,
		logger:        logger.With("component", "commitmanager"),
	}
}

// Initialize initializes the commit manager by loading configuration and
// initializing dependent managers.
//
// This should be called once after creating a new Manager instance.
func (m *Manager) Initialize(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	m.logger.Info("initializing commit manager")

	// Load configuration
	if err := m.configManager.Load(ctx); err != nil {
		m.logger.Error("failed to load config", "error", err)
		return fmt.Errorf("load config: %w", err)
	}

	// Initialize ref manager
	if err := m.refManager.Init(); err != nil {
		m.logger.Error("failed to initialize ref manager", "error", err)
		return fmt.Errorf("init ref manager: %w", err)
	}

	// Initialize branch manager
	if err := m.branchManager.Init(); err != nil {
		m.logger.Error("failed to initialize branch manager", "error", err)
		return fmt.Errorf("init branch manager: %w", err)
	}

	m.logger.Info("commit manager initialized successfully")
	return nil
}

// CreateCommit creates a new commit from the current index
//
// This method performs the complete commit creation workflow:
//  1. Validates the commit options
//  2. Reads the index to get staged changes
//  3. Builds a tree from the index
//  4. Determines parent commits
//  5. Creates the commit object
//  6. Updates the current branch reference
//
// Example:
//
//	result, err := mgr.CreateCommit(ctx, commitmanager.CommitOptions{
//	    Message: "Add new feature",
//	})
//	if err != nil {
//	    log.Fatal(err)
//	}
//	fmt.Printf("Created commit %s\n", result.SHA.Short())
func (m *Manager) CreateCommit(ctx context.Context, options CommitOptions) (*CommitResult, error) {
	// Check context cancellation
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	m.logger.Info("creating commit", "message", options.Message)

	// Validate options
	if err := options.Validate(); err != nil {
		m.logger.Error("invalid commit options", "error", err)
		return nil, err
	}

	// Read the index
	indexPath := m.repo.SourceDirectory().IndexPath()
	m.logger.Debug("reading index", "path", indexPath)
	idx, err := index.Read(indexPath.ToAbsolutePath())
	if err != nil {
		m.logger.Error("failed to read index", "error", err, "path", indexPath)
		return nil, NewCommitError("read index", err, "")
	}

	// Check if there are changes to commit
	if idx.Count() == 0 && !options.AllowEmpty {
		return nil, NewCommitError("validate", ErrNoChanges, "")
	}

	// Build tree from index
	treeSHA, err := m.treeBuilder.BuildFromIndex(ctx, idx)
	if err != nil {
		return nil, NewCommitError("build tree", err, "")
	}

	// Get parent commits
	parentSHAs, err := m.getParentCommits(ctx, options.Amend)
	if err != nil {
		return nil, NewCommitError("get parents", err, "")
	}

	// Check if tree is different from parent (avoid empty commits)
	if !options.AllowEmpty && len(parentSHAs) > 0 {
		parentCommit, err := m.repo.ReadCommitObject(parentSHAs[0])
		if err == nil && parentCommit.TreeSHA == treeSHA {
			return nil, NewCommitError("validate", ErrNoTreeChanges, "")
		}
	}

	// Get author and committer
	author := options.Author
	if author == nil {
		author, err = m.getCurrentUser()
		if err != nil {
			return nil, NewCommitError("get user", err, "")
		}
	}

	committer := options.Committer
	if committer == nil {
		committer = author
	}

	// Create the commit object
	commitObj, err := commit.NewCommitBuilder().
		TreeHash(treeSHA).
		ParentHashes(parentSHAs...).
		Author(author).
		Committer(committer).
		Message(options.Message).
		Build()
	if err != nil {
		return nil, NewCommitError("build commit", err, "")
	}

	// Write the commit object
	commitSHA, err := m.repo.WriteObject(commitObj)
	if err != nil {
		m.logger.Error("failed to write commit object", "error", err)
		return nil, NewCommitError("write commit", err, "")
	}

	// Update the current reference
	if err := m.updateCurrentRef(ctx, commitSHA); err != nil {
		m.logger.Error("failed to update reference", "error", err, "commit", commitSHA.Short())
		return nil, NewCommitError("update ref", err, "")
	}

	m.logger.Info("commit created successfully",
		"sha", commitSHA.Short().String(),
		"tree", treeSHA.Short().String(),
		"author", author.Name,
	)

	return &CommitResult{
		SHA:        commitSHA,
		TreeSHA:    treeSHA,
		ParentSHAs: parentSHAs,
		Message:    options.Message,
		Author:     author,
		Committer:  committer,
	}, nil
}

// GetCommit retrieves information about a specific commit
//
// Example:
//
//	result, err := mgr.GetCommit(ctx, commitSHA)
//	if err != nil {
//	    log.Fatal(err)
//	}
//	fmt.Printf("Commit: %s\nAuthor: %s\n", result.SHA.Short(), result.Author.Name)
func (m *Manager) GetCommit(ctx context.Context, sha objects.ObjectHash) (*CommitResult, error) {
	// Check context cancellation
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	commitObj, err := m.repo.ReadCommitObject(sha)
	if err != nil {
		return nil, NewCommitError("read commit", err, sha.Short().String())
	}

	commitSHA, err := commitObj.Hash()
	if err != nil {
		return nil, NewCommitError("get hash", err, "")
	}

	return &CommitResult{
		SHA:        commitSHA,
		TreeSHA:    commitObj.TreeSHA,
		ParentSHAs: commitObj.ParentSHAs,
		Message:    commitObj.Message,
		Author:     commitObj.Author,
		Committer:  commitObj.Committer,
	}, nil
}

// GetHistory retrieves the commit history starting from a given commit
//
// The history is returned in reverse chronological order (newest first).
// This uses a breadth-first traversal of the commit graph.
//
// Parameters:
//   - ctx: Context for cancellation
//   - startSHA: Starting commit SHA (empty string for HEAD)
//   - limit: Maximum number of commits to retrieve
func (m *Manager) GetHistory(ctx context.Context, startSHA objects.ObjectHash, limit int) ([]*CommitResult, error) {
	// Check context cancellation
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	history := make([]*CommitResult, 0, limit)
	visited := make(map[string]bool)

	// Determine starting commit
	var currentSHA objects.ObjectHash
	if startSHA == "" {
		// Get HEAD
		sha, err := m.refManager.ResolveToSHA(refs.RefPath("HEAD"))
		if err != nil {
			// No commits yet
			return history, nil
		}
		currentSHA = sha
	} else {
		currentSHA = startSHA
	}

	// BFS queue
	queue := []objects.ObjectHash{currentSHA}

	for len(queue) > 0 && len(history) < limit {
		// Check context cancellation
		select {
		case <-ctx.Done():
			return history, ctx.Err()
		default:
		}

		// Dequeue
		sha := queue[0]
		queue = queue[1:]

		// Skip if already visited
		if visited[sha.String()] {
			continue
		}
		visited[sha.String()] = true

		// Get commit
		result, err := m.GetCommit(ctx, sha)
		if err != nil {
			// Skip commits we can't read
			continue
		}

		history = append(history, result)

		// Enqueue parents
		for _, parentSHA := range result.ParentSHAs {
			if !visited[parentSHA.String()] {
				queue = append(queue, parentSHA)
			}
		}
	}

	return history, nil
}

// getParentCommits determines the parent commits for a new commit
func (m *Manager) getParentCommits(ctx context.Context, amend bool) ([]objects.ObjectHash, error) {
	// Check context cancellation
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	// Try to get HEAD commit
	headSHA, err := m.refManager.ResolveToSHA(refs.RefPath("HEAD"))
	if err != nil {
		// No HEAD - this is the initial commit
		return []objects.ObjectHash{}, nil
	}

	// If amending, use the parent's parents
	if amend {
		headCommit, err := m.repo.ReadCommitObject(headSHA)
		if err == nil {
			return headCommit.ParentSHAs, nil
		}
	}

	// Normal commit - current HEAD is the parent
	return []objects.ObjectHash{headSHA}, nil
}

// getCurrentUser gets the current user information from config or environment
func (m *Manager) getCurrentUser() (*commit.CommitPerson, error) {
	name := m.typedConfig.UserName()
	if name == "" {
		name = os.Getenv("GIT_AUTHOR_NAME")
	}
	if name == "" {
		name = "Unknown User"
	}

	email := m.typedConfig.UserEmail()
	if email == "" {
		email = os.Getenv("GIT_AUTHOR_EMAIL")
	}
	if email == "" {
		email = "unknown@example.com"
	}

	// Get current time
	now := time.Now()

	person, err := commit.NewCommitPerson(name, email, now)
	if err != nil {
		return nil, fmt.Errorf("create commit person: %w", err)
	}

	return person, nil
}

// updateCurrentRef updates the current branch reference or HEAD
func (m *Manager) updateCurrentRef(ctx context.Context, commitSHA objects.ObjectHash) error {
	// Check context cancellation
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	// Try to get current branch
	currentBranch, err := m.branchManager.CurrentBranch()
	if err == nil && currentBranch != "" {
		// Update branch reference
		branchRef := refs.RefPath(fmt.Sprintf("refs/heads/%s", currentBranch))
		if err := m.refManager.UpdateRef(branchRef, commitSHA); err != nil {
			return fmt.Errorf("update branch %s: %w", currentBranch, err)
		}
		return nil
	}

	// No current branch - this might be an initial commit
	// Create the default branch
	defaultBranch := m.typedConfig.DefaultBranch()
	if defaultBranch == "" {
		defaultBranch = branch.DefaultBranch
	}

	// Update branch reference
	branchRef := refs.RefPath(fmt.Sprintf("refs/heads/%s", defaultBranch))
	if err := m.refManager.UpdateRef(branchRef, commitSHA); err != nil {
		return fmt.Errorf("update default branch %s: %w", defaultBranch, err)
	}

	// Update HEAD to point to the branch
	headContent := fmt.Sprintf("ref: refs/heads/%s", defaultBranch)
	headPath := m.repo.SourceDirectory().HeadPath()
	if err := os.WriteFile(headPath.String(), []byte(headContent), 0644); err != nil {
		return fmt.Errorf("update HEAD: %w", err)
	}

	return nil
}
