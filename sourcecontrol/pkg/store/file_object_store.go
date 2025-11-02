package store

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"

	"github.com/utkarsh5026/SourceControl/pkg/objects"
	"github.com/utkarsh5026/SourceControl/pkg/objects/blob"
	"github.com/utkarsh5026/SourceControl/pkg/objects/commit"
	"github.com/utkarsh5026/SourceControl/pkg/objects/tree"
	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
)

// FileObjectStore is a file-based implementation of Git object storage that mimics Git's internal
// object database.
//
// This implementation stores Git objects in a directory structure where each object is:
// 1. Serialized to Git's standard format (header + content)
// 2. Compressed using DEFLATE algorithm
// 3. Stored in a file named by its SHA-1 hash
//
// Directory Structure:
// ┌─ .source/objects/
// │ ├─ ab/ ← First 2 characters of SHA
// │ │ └─ cdef123... ← Remaining 38 characters of SHA
// │ ├─ cd/
// │ │ └─ ef456789...
// │ └─ ...
//
// Example for SHA "abcdef1234567890abcdef1234567890abcdef12":
// File path: .source/objects/ab/cdef1234567890abcdef1234567890abcdef12
type FileObjectStore struct {
	objectsPath scpath.SourcePath
}

// NewFileObjectStore creates a new FileObjectStore instance
func NewFileObjectStore() *FileObjectStore {
	return &FileObjectStore{}
}

// Initialize sets up the object store by creating the objects directory structure.
// It creates the .source/objects directory if it doesn't exist.
func (fos *FileObjectStore) Initialize(repoPath scpath.RepositoryPath) error {
	fos.objectsPath = repoPath.SourcePath().ObjectsPath()

	if err := os.MkdirAll(fos.objectsPath.String(), 0755); err != nil {
		return fmt.Errorf("failed to initialize object store: %w", err)
	}

	return nil
}

// WriteObject stores a Git object in the object store.
//
// If the object already exists, it returns the SHA-1 hash of the existing object.
// Otherwise, it compresses the object and writes it to the file system.
//
// The process:
// 1. Serialize the object to Git's format
// 2. Compute SHA-1 hash
// 3. Check if object already exists
// 4. If not, compress and write to file
func (fos *FileObjectStore) WriteObject(obj objects.BaseObject) (objects.ObjectHash, error) {
	if fos.objectsPath == "" {
		return "", fmt.Errorf("object store not initialized")
	}

	var buf bytes.Buffer
	if err := obj.Serialize(&buf); err != nil {
		return "", fmt.Errorf("failed to serialize object: %w", err)
	}
	serialized := objects.SerializedObject(buf.Bytes())

	hash := objects.NewObjectHash(serialized.Bytes())

	filePath, err := fos.resolveObjectPath(hash)
	if err != nil {
		return "", fmt.Errorf("failed to resolve object path: %w", err)
	}

	if _, err := os.Stat(filePath.String()); err == nil {
		return hash, nil
	}

	compressed, err := serialized.Compress()
	if err != nil {
		return "", fmt.Errorf("failed to compress object: %w", err)
	}

	dirPath := filePath.Dir()
	if err := os.MkdirAll(dirPath.String(), 0755); err != nil {
		return "", fmt.Errorf("failed to create object directory: %w", err)
	}

	if err := os.WriteFile(filePath.String(), compressed.Bytes(), 0444); err != nil {
		return "", fmt.Errorf("failed to write object file: %w", err)
	}

	return hash, nil
}

// ReadObject retrieves and reconstructs a Git object from storage using its SHA-1 hash.
//
// The method:
// 1. Reads the compressed data from disk
// 2. Decompresses it
// 3. Determines the object type from the header
// 4. Creates an appropriate object instance
// 5. Parses the data into that object
//
// Returns nil if the object doesn't exist.
func (fos *FileObjectStore) ReadObject(hash objects.ObjectHash) (objects.BaseObject, error) {
	filePath, err := fos.validateAndResolvePath(hash)
	if err != nil {
		return nil, err
	}

	if _, err := os.Stat(filePath.String()); os.IsNotExist(err) {
		return nil, nil
	}

	compressed, err := os.ReadFile(filePath.String())
	if err != nil {
		return nil, fmt.Errorf("failed to read object file: %w", err)
	}

	decompressed, err := objects.CompressedData(compressed).Decompress()
	if err != nil {
		return nil, fmt.Errorf("failed to decompress object: %w", err)
	}

	obj, err := fos.createObjectFromHeader(decompressed)
	if err != nil {
		return nil, fmt.Errorf("failed to create object from header: %w", err)
	}

	return obj, nil
}

// HasObject checks if a Git object exists in the object store.
//
// Returns true if the object exists, false otherwise.
func (fos *FileObjectStore) HasObject(hash objects.ObjectHash) (bool, error) {
	filePath, err := fos.validateAndResolvePath(hash)
	if err != nil {
		return false, err
	}

	_, err = os.Stat(filePath.String())
	if os.IsNotExist(err) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("failed to check object existence: %w", err)
	}

	return true, nil
}

// resolveObjectPath converts a SHA-1 hash to the corresponding file path in Git's object storage
// structure.
//
// Git uses a two-level directory structure to avoid having too many files in a single
// directory, which can cause filesystem performance issues.
//
// Example: hash "abcdef1234567890abcdef1234567890abcdef12"
// Returns: .source/objects/ab/cdef1234567890abcdef1234567890abcdef12
func (fos *FileObjectStore) resolveObjectPath(hash objects.ObjectHash) (scpath.SourcePath, error) {
	hashStr := hash.String()
	if len(hashStr) != 40 {
		return "", fmt.Errorf("invalid hash length: %d", len(hashStr))
	}

	objPath := fos.objectsPath.ObjectFilePath(hashStr)
	if objPath == "" {
		return "", fmt.Errorf("failed to create object path for hash: %s", hashStr)
	}

	return objPath, nil
}

// createObjectFromHeader determines the object type from the header and creates an appropriate
// object instance.
//
// The method parses the Git object header format: "<type> <size>\0<content>"
// and creates the corresponding object (Blob, Tree, or Commit).
func (fos *FileObjectStore) createObjectFromHeader(data objects.ObjectContent) (objects.BaseObject, error) {
	serialized := objects.SerializedObject(data)
	objType, _, _, err := serialized.ParseHeader()
	if err != nil {
		return nil, fmt.Errorf("failed to parse object header: %w", err)
	}

	fullData := serialized.Bytes()

	switch objType {
	case objects.BlobType:
		return blob.ParseBlob(fullData)
	case objects.TreeType:
		return tree.ParseTree(fullData)
	case objects.CommitType:
		return commit.ParseCommit(fullData)
	case objects.TagType:
		return nil, fmt.Errorf("tag objects not yet implemented")
	default:
		return nil, fmt.Errorf("unknown object type: %s", objType)
	}
}

// IsInitialized checks if the object store has been initialized
func (fos *FileObjectStore) IsInitialized() bool {
	return fos.objectsPath != ""
}

// GetObjectsPath returns the path to the objects directory
func (fos *FileObjectStore) GetObjectsPath() scpath.SourcePath {
	return fos.objectsPath
}

// ObjectCount returns the total number of objects in the store
// This is useful for statistics and diagnostics
func (fos *FileObjectStore) ObjectCount() (int, error) {
	if !fos.IsInitialized() {
		return 0, fmt.Errorf("object store not initialized")
	}

	count := 0

	err := filepath.Walk(fos.objectsPath.String(), func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if !info.IsDir() {
			count++
		}
		return nil
	})

	if err != nil {
		return 0, fmt.Errorf("failed to count objects: %w", err)
	}

	return count, nil
}

func (fos *FileObjectStore) validateAndResolvePath(hash objects.ObjectHash) (scpath.SourcePath, error) {
	if err := fos.ensureInitialized(); err != nil {
		return "", err
	}

	if err := hash.Validate(); err != nil {
		return "", fmt.Errorf("invalid hash: %w", err)
	}

	filePath, err := fos.resolveObjectPath(hash)
	if err != nil {
		return "", fmt.Errorf("failed to resolve object path: %w", err)
	}

	return filePath, nil
}

// ensureInitialized checks if the object store is initialized and returns an error if not
func (fos *FileObjectStore) ensureInitialized() error {
	if !fos.objectsPath.IsValid() {
		return fmt.Errorf("object store not initialized")
	}
	return nil
}
