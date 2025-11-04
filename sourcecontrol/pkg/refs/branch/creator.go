package branch

import (
	"context"
	"fmt"

	"github.com/utkarsh5026/SourceControl/pkg/objects"
	"github.com/utkarsh5026/SourceControl/pkg/repository/sourcerepo"
)

// Creator handles branch creation operations
type Creator struct {
	repo        *sourcerepo.SourceRepository
	refService  *RefService
	infoService *InfoService
}

// NewCreator creates a new branch creator service
func NewCreator(repo *sourcerepo.SourceRepository, refSvc *RefService, infoSvc *InfoService) *Creator {
	return &Creator{
		repo:        repo,
		refService:  refSvc,
		infoService: infoSvc,
	}
}

// Create creates a new branch with the given configuration
func (c *Creator) Create(ctx context.Context, name string, config *CreateConfig) (*BranchInfo, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	if err := ValidateBranchName(name); err != nil {
		return nil, err
	}

	if !config.Force {
		if err := c.validateNotExists(name); err != nil {
			return nil, err
		}
	}

	startSHA, err := c.resolveStartPoint(config.StartPoint)
	if err != nil {
		return nil, fmt.Errorf("resolve start point: %w", err)
	}

	if err := c.verifyCommitExists(startSHA); err != nil {
		return nil, fmt.Errorf("verify commit: %w", err)
	}

	if config.Force {
		if err := c.refService.Update(name, startSHA, true); err != nil {
			return nil, fmt.Errorf("update branch: %w", err)
		}
	} else {
		if err := c.refService.Create(name, startSHA); err != nil {
			return nil, fmt.Errorf("create branch: %w", err)
		}
	}

	info, err := c.infoService.GetInfo(ctx, name)
	if err != nil {
		return &BranchInfo{
			Name: name,
			SHA:  startSHA,
		}, nil
	}

	return info, nil
}

// resolveStartPoint resolves the start point to a commit SHA
func (c *Creator) resolveStartPoint(startPoint string) (objects.ObjectHash, error) {
	if startPoint == "" {
		headSHA, err := c.refService.GetHeadSHA()
		if err != nil {
			return "", fmt.Errorf("get HEAD SHA: %w", err)
		}
		return headSHA, nil
	}

	// Try to resolve as a branch name first
	if err := ValidateBranchName(startPoint); err == nil {
		exists, err := c.refService.Exists(startPoint)
		if err != nil {
			return "", fmt.Errorf("check branch exists: %w", err)
		}
		if exists {
			sha, err := c.refService.Resolve(startPoint)
			if err != nil {
				return "", fmt.Errorf("resolve branch: %w", err)
			}
			return sha, nil
		}
	}

	// Try to parse as a commit SHA
	sha, err := objects.NewObjectHashFromString(startPoint)
	if err != nil {
		return "", fmt.Errorf("invalid start point '%s': not a valid branch name or commit SHA", startPoint)
	}

	return sha, nil
}

// verifyCommitExists checks if a commit object exists in the repository
func (c *Creator) verifyCommitExists(sha objects.ObjectHash) error {
	_, err := c.repo.ReadCommitObject(sha)
	if err != nil {
		return fmt.Errorf("commit %s does not exist: %w", sha.Short(), err)
	}
	return nil
}

// CreateOrphan creates an orphan branch (a branch with no parent commits)
func (c *Creator) CreateOrphan(ctx context.Context, name string) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	if err := ValidateBranchName(name); err != nil {
		return err
	}

	if err := c.validateNotExists(name); err != nil {
		return err
	}

	// For orphan branches, we just update HEAD to point to the new branch
	// The branch ref won't be created until the first commit is made
	if err := c.refService.SetHead(name); err != nil {
		// If setting HEAD fails, it's because the branch doesn't exist yet
		// For orphan branches, we need to create an empty ref first
		// We'll use a special empty commit marker
		return fmt.Errorf("create orphan branch: %w", err)
	}

	return nil
}

func (c *Creator) validateNotExists(name string) error {
	exists, err := c.refService.Exists(name)
	if err != nil {
		return fmt.Errorf("check branch exists: %w", err)
	}
	if exists {
		return NewAlreadyExistsError(name)
	}

	return nil
}
