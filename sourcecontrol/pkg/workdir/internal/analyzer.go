package internal

import (
	"fmt"
	"maps"

	"github.com/utkarsh5026/SourceControl/pkg/index"
	"github.com/utkarsh5026/SourceControl/pkg/objects"
	"github.com/utkarsh5026/SourceControl/pkg/objects/tree"
	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
	"github.com/utkarsh5026/SourceControl/pkg/repository/sourcerepo"
)

// FileInfo represents metadata about a file in a tree or index
type FileInfo struct {
	SHA  objects.ObjectHash
	Mode objects.FileMode
}

// ChangeAnalysis contains the result of comparing two file states
type ChangeAnalysis struct {
	Operations  []Operation
	Summary     ChangeSummary
	TargetFiles map[scpath.RelativePath]FileInfo
}

// Analyzer implements the TreeAnalyzer interface for analyzing Git trees and detecting changes.
// It handles tree walking, file collection, and change detection.
type Analyzer struct {
	repo *sourcerepo.SourceRepository
}

// NewAnalyzer creates a new TreeAnalyzer
func NewAnalyzer(repo *sourcerepo.SourceRepository) *Analyzer {
	return &Analyzer{
		repo: repo,
	}
}

// GetCommitFiles retrieves all files from a commit's tree.
// It reads the commit object, gets the root tree SHA, and recursively walks the tree.
func (a *Analyzer) GetCommitFiles(commitSHA objects.ObjectHash) (map[scpath.RelativePath]FileInfo, error) {
	commit, err := a.repo.ReadCommitObject(commitSHA)
	if err != nil {
		return nil, err
	}

	if commit.TreeSHA == "" {
		return nil, fmt.Errorf("commit %s has no tree", commitSHA.Short())
	}

	treeSHA := objects.ObjectHash(commit.TreeSHA)
	return a.getTreeFiles(treeSHA, scpath.RelativePath(""))
}

// getTreeFiles recursively walks a tree object and collects all files.
// It handles nested trees (subdirectories) and builds the complete file map.
func (a *Analyzer) getTreeFiles(treeSHA objects.ObjectHash, basePath scpath.RelativePath) (map[scpath.RelativePath]FileInfo, error) {
	files := make(map[scpath.RelativePath]FileInfo)
	treeObj, err := a.repo.ReadTreeObject(treeSHA)
	if err != nil {
		return nil, fmt.Errorf("read tree %s: %w", treeSHA.Short(), err)
	}

	for _, e := range treeObj.Entries() {
		var fullPath scpath.RelativePath
		if basePath == "" {
			fullPath = e.Name()
		} else {
			fullPath = basePath.Join(e.Name().String())
		}

		if e.IsDirectory() {
			subFiles, err := a.getTreeFiles(e.SHA(), fullPath)
			if err != nil {
				return nil, err
			}
			maps.Copy(files, subFiles)
			continue
		}

		if a.isSupportedFileType(e) {
			files[fullPath] = FileInfo{
				SHA:  e.SHA(),
				Mode: e.Mode(),
			}
		}
	}

	return files, nil
}

// GetIndexFiles extracts file information from the Git index.
// Converts index entries to the FileInfo format used by the analyzer.
func (a *Analyzer) GetIndexFiles(idx *index.Index) map[scpath.RelativePath]FileInfo {
	files := make(map[scpath.RelativePath]FileInfo)

	for _, entry := range idx.Entries {
		files[entry.Path] = FileInfo{
			SHA:  entry.BlobHash,
			Mode: entry.Mode,
		}
	}

	return files
}

// AnalyzeChanges compares current and target file states to generate operations.
// It detects files that need to be created, modified, or deleted.
func (a *Analyzer) AnalyzeChanges(current, target map[scpath.RelativePath]FileInfo) ChangeAnalysis {
	var operations []Operation
	summary := ChangeSummary{}

	operations = append(operations, findDeletedFiles(current, target, &summary)...)

	operations = append(operations, a.findCreatedAndModifiedFiles(current, target, &summary)...)

	return ChangeAnalysis{
		Operations:  operations,
		Summary:     summary,
		TargetFiles: target,
	}
}

func findDeletedFiles(current, target map[scpath.RelativePath]FileInfo, summary *ChangeSummary) []Operation {
	var operations []Operation

	for path := range current {
		if _, exists := target[path]; !exists {
			operations = append(operations, Operation{
				Path:   path,
				Action: ActionDelete,
			})
			summary.Deleted++
		}
	}

	return operations
}

// findCreatedAndModifiedFiles identifies new and changed files in target
func (a *Analyzer) findCreatedAndModifiedFiles(current, target map[scpath.RelativePath]FileInfo, summary *ChangeSummary) []Operation {
	var operations []Operation

	for path, targetInfo := range target {
		currentInfo, exists := current[path]

		if !exists {
			operations = append(operations, Operation{
				Path:   path,
				Action: ActionCreate,
				SHA:    targetInfo.SHA,
				Mode:   targetInfo.Mode,
			})
			summary.Created++
		} else if a.hasChanged(currentInfo, targetInfo) {
			operations = append(operations, Operation{
				Path:   path,
				Action: ActionModify,
				SHA:    targetInfo.SHA,
				Mode:   targetInfo.Mode,
			})
			summary.Modified++
		}
	}

	return operations
}

// AreTreesIdentical checks if two trees contain exactly the same files.
// This is an optimization to avoid unnecessary operations.
func (a *Analyzer) AreTreesIdentical(treeSHA1, treeSHA2 objects.ObjectHash) (bool, error) {
	if treeSHA1 == treeSHA2 {
		return true, nil
	}

	tree1Files, err := a.getTreeFiles(treeSHA1, scpath.RelativePath(""))
	if err != nil {
		return false, fmt.Errorf("read tree1: %w", err)
	}

	tree2Files, err := a.getTreeFiles(treeSHA2, scpath.RelativePath(""))
	if err != nil {
		return false, fmt.Errorf("read tree2: %w", err)
	}

	if len(tree1Files) != len(tree2Files) {
		return false, nil
	}

	for path, info1 := range tree1Files {
		info2, exists := tree2Files[path]
		if !exists || a.hasChanged(info1, info2) {
			return false, nil
		}
	}

	return true, nil
}

// isSupportedFileType checks if a tree entry represents a supported file type.
// We support regular files, executables, and symlinks (but not submodules for now).
func (a *Analyzer) isSupportedFileType(entry *tree.TreeEntry) bool {
	return entry.IsFile() || entry.IsExecutable() || entry.IsSymbolicLink()
}

// hasChanged checks if a file has changed between two states.
// A file is considered changed if either its content (SHA) or mode has changed.
func (a *Analyzer) hasChanged(current, target FileInfo) bool {
	return current.SHA != target.SHA || current.Mode != target.Mode
}
