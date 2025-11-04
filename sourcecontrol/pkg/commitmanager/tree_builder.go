package commitmanager

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/utkarsh5026/SourceControl/pkg/index"
	"github.com/utkarsh5026/SourceControl/pkg/objects"
	"github.com/utkarsh5026/SourceControl/pkg/objects/tree"
	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
	"github.com/utkarsh5026/SourceControl/pkg/repository/sourcerepo"
)

// TreeBuilder builds tree objects from the index (staging area)
type TreeBuilder struct {
	repo *sourcerepo.SourceRepository
}

// NewTreeBuilder creates a new TreeBuilder
func NewTreeBuilder(repo *sourcerepo.SourceRepository) *TreeBuilder {
	return &TreeBuilder{
		repo: repo,
	}
}

// BuildFromIndex builds a tree object from the given index
// It creates a hierarchical tree structure from the flat list of index entries
func (tb *TreeBuilder) BuildFromIndex(ctx context.Context, idx *index.Index) (objects.ObjectHash, error) {
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	default:
	}

	if idx.Count() == 0 {
		emptyTree := tree.NewTree([]*tree.TreeEntry{})
		return tb.repo.WriteObject(emptyTree)
	}

	root := newDirectoryNode("")
	for _, entry := range idx.Entries {
		root.addEntry(entry.Path.String(), entry.BlobHash, objects.FileModeRegular)
	}

	treeSHA, err := tb.buildTree(ctx, root)
	if err != nil {
		return "", fmt.Errorf("build tree: %w", err)
	}

	return treeSHA, nil
}

// buildTree recursively builds tree objects for a directory node
func (tb *TreeBuilder) buildTree(ctx context.Context, node *directoryNode) (objects.ObjectHash, error) {
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	default:
	}

	entries := make([]*tree.TreeEntry, 0, len(node.files)+len(node.subdirs))

	for name, sha := range node.files {
		mode := node.modes[name]
		entry, err := tree.NewTreeEntry(mode, scpath.RelativePath(name), sha)
		if err != nil {
			return "", fmt.Errorf("create tree entry for %s: %w", name, err)
		}
		entries = append(entries, entry)
	}

	for name, subdir := range node.subdirs {
		subTreeSHA, err := tb.buildTree(ctx, subdir)
		if err != nil {
			return "", fmt.Errorf("build subdirectory %s: %w", name, err)
		}
		entry, err := tree.NewTreeEntry(objects.FileModeDirectory, scpath.RelativePath(name), subTreeSHA)
		if err != nil {
			return "", fmt.Errorf("create tree entry for directory %s: %w", name, err)
		}
		entries = append(entries, entry)
	}

	treeObj := tree.NewTree(entries)
	treeSHA, err := tb.repo.WriteObject(treeObj)
	if err != nil {
		return "", fmt.Errorf("write tree: %w", err)
	}

	return treeSHA, nil
}

// directoryNode represents a directory in the tree structure
type directoryNode struct {
	name    string
	files   map[string]objects.ObjectHash // filename -> blob SHA
	modes   map[string]objects.FileMode   // filename -> file mode
	subdirs map[string]*directoryNode     // dirname -> subdirectory
}

// newDirectoryNode creates a new directory node
func newDirectoryNode(name string) *directoryNode {
	return &directoryNode{
		name:    name,
		files:   make(map[string]objects.ObjectHash),
		modes:   make(map[string]objects.FileMode),
		subdirs: make(map[string]*directoryNode),
	}
}

// addEntry adds a file entry to the directory tree
func (dn *directoryNode) addEntry(path string, sha objects.ObjectHash, mode objects.FileMode) {
	parts := strings.Split(filepath.ToSlash(path), "/")

	if len(parts) == 1 {
		// This is a file in the current directory
		dn.files[parts[0]] = sha
		dn.modes[parts[0]] = mode
		return
	}

	// This is a file in a subdirectory
	dirName := parts[0]
	if _, exists := dn.subdirs[dirName]; !exists {
		dn.subdirs[dirName] = newDirectoryNode(dirName)
	}

	remainingPath := strings.Join(parts[1:], "/")
	dn.subdirs[dirName].addEntry(remainingPath, sha, mode)
}
