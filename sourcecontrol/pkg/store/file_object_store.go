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
//
//	┌─ .source/objects/
//	│ ├─ ab/ ← First 2 characters of SHA
//	│ │ └─ cdef123... ← Remaining 38 characters of SHA
//	│ ├─ cd/
//	│ │ └─ ef456789...
//	│ └─ ...
//
// Example for SHA "abcdef1234567890abcdef1234567890abcdef12":
// File path: .source/objects/ab/cdef1234567890abcdef1234567890abcdef12
//
// The store supports three main operations:
//   - WriteObject: Store a new object or return existing object's hash
//   - ReadObject: Retrieve and reconstruct an object from its hash
//   - HasObject: Check if an object exists in the store
//
// Thread Safety:
// This implementation is NOT thread-safe. External synchronization is required
// for concurrent access.
type FileObjectStore struct {
	// objectsPath is the root directory path where all Git objects are stored.
	// Typically points to .source/objects/ in the repository.
	objectsPath scpath.SourcePath
}

// NewFileObjectStore creates a new FileObjectStore instance.
//
// The returned store is not yet initialized and must have Initialize() called
// before it can be used for any object operations.
//
// Returns:
//   - *FileObjectStore: A new uninitialized file object store
//
// Example:
//
//	store := NewFileObjectStore()
//	err := store.Initialize(repoPath)
//	if err != nil {
//	    log.Fatal(err)
//	}
func NewFileObjectStore() *FileObjectStore {
	return &FileObjectStore{}
}

// Initialize sets up the object store by creating the objects directory structure.
// It creates the .source/objects directory if it doesn't exist.
//
// This method must be called before any other operations on the store.
// Calling Initialize multiple times is safe and will update the objectsPath.
//
// Parameters:
//   - repoPath: The repository path that contains the .source directory
//
// Returns:
//   - error: Returns an error if directory creation fails
//
// Example:
//
//	store := NewFileObjectStore()
//	err := store.Initialize(repoPath)
//	if err != nil {
//	    return fmt.Errorf("failed to initialize store: %w", err)
//	}
func (f *FileObjectStore) Initialize(repoPath scpath.RepositoryPath) error {
	f.objectsPath = repoPath.SourcePath().ObjectsPath()

	if err := os.MkdirAll(f.objectsPath.String(), 0755); err != nil {
		return fmt.Errorf("failed to initialize object store: %w", err)
	}

	return nil
}

// WriteObject stores a Git object in the object store.
//
// If the object already exists (based on content hash), it returns the SHA-1 hash
// without rewriting the file. This implements Git's content-addressable storage,
// where identical content always produces the same hash.
//
// The storage process:
// 1. Serialize the object to Git's format: "<type> <size>\0<content>"
// 2. Compute SHA-1 hash of the serialized data
// 3. Check if object already exists at the computed path
// 4. If not, compress using DEFLATE and write to disk
// 5. Return the computed hash
//
// Parameters:
//   - obj: The Git object to store (Blob, Tree, or Commit)
//
// Returns:
//   - ObjectHash: The SHA-1 hash of the stored object
//   - error: Returns an error if:
//   - Store is not initialized
//   - Serialization fails
//   - Compression fails
//   - File writing fails
func (f *FileObjectStore) WriteObject(obj objects.BaseObject) (objects.ObjectHash, error) {
	if f.objectsPath == "" {
		return "", fmt.Errorf("object store not initialized")
	}

	var buf bytes.Buffer
	if err := obj.Serialize(&buf); err != nil {
		return "", fmt.Errorf("failed to serialize object: %w", err)
	}
	serialized := objects.SerializedObject(buf.Bytes())
	hash := objects.NewObjectHash(serialized)

	filePath, err := f.resolveObjectPath(hash)
	if err != nil {
		return "", fmt.Errorf("failed to resolve object path: %w", err)
	}

	if err := writeObjectToDisk(serialized, filePath); err != nil {
		return "", fmt.Errorf("failed to write object to disk: %w", err)
	}

	return hash, nil
}

// writeObjectToDisk writes the serialized and compressed Git object to disk at the specified file path.
//
// This function compresses the provided object data using DEFLATE,
// ensures the parent directory exists, and writes the compressed data to a file
// with read-only permissions. If the file already exists (object is already stored),
// the function returns early without error to avoid redundant writes.
//
// Parameters:
//   - obj: The serialized object data to write (already in "<type> <size>\0<content>" format)
//   - filePath: The destination path for storing the compressed object
//
// Returns:
//   - error: Returns an error if compression fails, directory creation fails, or file writing fails.
//     Returns nil if the file was already present or was written successfully.
func writeObjectToDisk(obj objects.SerializedObject, filePath scpath.SourcePath) error {
	if _, err := os.Stat(filePath.String()); err == nil {
		return nil
	}

	compressed, err := obj.Compress()
	if err != nil {
		return fmt.Errorf("failed to compress object: %w", err)
	}

	dirPath := filePath.Dir()
	if err := os.MkdirAll(dirPath.String(), 0755); err != nil {
		return fmt.Errorf("failed to create object directory: %w", err)
	}

	if err := os.WriteFile(filePath.String(), compressed.Bytes(), 0444); err != nil {
		return fmt.Errorf("failed to write object file: %w", err)
	}

	return nil
}

// ReadObject retrieves and reconstructs a Git object from storage using its SHA-1 hash.
//
// The method performs the reverse of WriteObject:
// 1. Validates the hash format (40 hex characters)
// 2. Reads the compressed data from disk
// 3. Decompresses it using DEFLATE
// 4. Parses the header to determine object type
// 5. Creates the appropriate object instance (Blob, Tree, or Commit)
// 6. Deserializes the data into that object
//
// Parameters:
//   - hash: The SHA-1 hash of the object to retrieve
//
// Returns:
//   - BaseObject: The reconstructed Git object, or nil if not found
//   - error: Returns an error if:
//   - Store is not initialized
//   - Hash format is invalid
//   - File reading fails
//   - Decompression fails
//   - Object type is unknown
//   - Deserialization fails
func (f *FileObjectStore) ReadObject(hash objects.ObjectHash) (objects.BaseObject, error) {
	compressed, err := f.readFromDisk(hash)
	if err != nil {
		return nil, fmt.Errorf("failed to read object file: %w", err)
	}

	decompressed, err := compressed.Decompress()
	if err != nil {
		return nil, fmt.Errorf("failed to decompress object: %w", err)
	}

	obj, err := f.createObjectFromHeader(decompressed)
	if err != nil {
		return nil, fmt.Errorf("failed to create object from header: %w", err)
	}

	return obj, nil
}

// readFromDisk retrieves the raw compressed data for a Git object from disk.
//
// This helper method is used internally to fetch the contents of an object file by its SHA-1 hash,
// without any decompression or deserialization. If the object file does not exist, it returns (nil, nil).
//
// Parameters:
//   - hash: The SHA-1 hash of the object to read
//
// Returns:
//   - objects.CompressedData: The raw compressed bytes read from disk (may be nil if the file doesn't exist)
//   - error: Returns an error if the hash is invalid or reading fails (except for not found)
func (f *FileObjectStore) readFromDisk(hash objects.ObjectHash) (objects.CompressedData, error) {
	filePath, err := f.validateAndResolvePath(hash)
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

	return objects.CompressedData(compressed), nil
}

// HasObject checks if a Git object exists in the object store.
//
// This is more efficient than ReadObject when you only need to verify existence,
// as it doesn't read or decompress the file contents.
//
// Parameters:
//   - hash: The SHA-1 hash of the object to check
//
// Returns:
//   - bool: true if the object exists, false otherwise
//   - error: Returns an error if:
//   - Store is not initialized
//   - Hash format is invalid
//   - Filesystem stat operation fails (excluding NotExist)
func (f *FileObjectStore) HasObject(hash objects.ObjectHash) (bool, error) {
	filePath, err := f.validateAndResolvePath(hash)
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
// directory, which can cause filesystem performance issues. The first two characters of the
// hash become a directory name, and the remaining 38 characters become the filename.
//
// This is known as "fanout" and helps distribute objects across multiple directories.
//
// Parameters:
//   - hash: The SHA-1 hash to convert to a file path
//
// Returns:
//   - SourcePath: The full file path where the object should be stored
//   - error: Returns an error if the hash length is invalid or path creation fails
//
// Example:
//
//	hash: "abcdef1234567890abcdef1234567890abcdef12"
//	returns: ".source/objects/ab/cdef1234567890abcdef1234567890abcdef12"
func (f *FileObjectStore) resolveObjectPath(hash objects.ObjectHash) (scpath.SourcePath, error) {
	hashStr := hash.String()
	if len(hashStr) != 40 {
		return "", fmt.Errorf("invalid hash length: %d", len(hashStr))
	}

	objPath := f.objectsPath.ObjectFilePath(hashStr)
	if objPath == "" {
		return "", fmt.Errorf("failed to create object path for hash: %s", hashStr)
	}

	return objPath, nil
}

// createObjectFromHeader determines the object type from the header and creates an appropriate
// object instance.
//
// Git objects are stored with a header format: "<type> <size>\0<content>"
// This method parses that header to determine if we're dealing with a blob, tree, or commit,
// then delegates to the appropriate parser.
//
// Parameters:
//   - data: The decompressed object data including header and content
//
// Returns:
//   - BaseObject: The parsed object instance
//   - error: Returns an error if:
//   - Header parsing fails
//   - Object type is unknown or not implemented
//   - Object parsing fails
//
// Supported types:
//   - blob: File content objects
//   - tree: Directory structure objects
//   - commit: Commit metadata objects
//
// Not yet supported:
//   - tag: Annotated tag objects
func (f *FileObjectStore) createObjectFromHeader(data objects.ObjectContent) (objects.BaseObject, error) {
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

// IsInitialized checks if the object store has been initialized.
//
// An initialized store has a valid objectsPath set through the Initialize method.
// All object operations will fail if the store is not initialized.
//
// Returns:
//   - bool: true if the store is initialized and ready for use
//
// Example:
//
//	if !store.IsInitialized() {
//	    return fmt.Errorf("store must be initialized before use")
//	}
func (f *FileObjectStore) IsInitialized() bool {
	return f.objectsPath != ""
}

// GetObjectsPath returns the path to the objects directory.
//
// This is useful for debugging, diagnostics, or when other components need to know
// where objects are stored.
//
// Returns:
//   - SourcePath: The path to the .source/objects directory
//
// Example:
//
//	path := store.GetObjectsPath()
//	fmt.Printf("Objects stored in: %s\n", path)
func (f *FileObjectStore) GetObjectsPath() scpath.SourcePath {
	return f.objectsPath
}

// ObjectCount returns the total number of objects in the store.
//
// This method walks the entire objects directory tree and counts all files.
// Note that this can be slow for large repositories with many objects.
//
// Returns:
//   - int: The total number of objects stored
//   - error: Returns an error if:
//   - Store is not initialized
//   - Directory walking fails
func (f *FileObjectStore) ObjectCount() (int, error) {
	if !f.IsInitialized() {
		return 0, fmt.Errorf("object store not initialized")
	}

	count := 0

	err := filepath.Walk(f.objectsPath.String(), func(path string, info os.FileInfo, err error) error {
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

// validateAndResolvePath is a helper method that validates the store state and hash,
// then resolves the hash to a file path.
//
// This consolidates common validation logic used by multiple methods to ensure
// consistent error handling and reduce code duplication.
//
// Parameters:
//   - hash: The SHA-1 hash to validate and resolve
//
// Returns:
//   - SourcePath: The resolved file path for the object
//   - error: Returns an error if validation or resolution fails
func (f *FileObjectStore) validateAndResolvePath(hash objects.ObjectHash) (scpath.SourcePath, error) {
	if !f.objectsPath.IsValid() {
		return "", fmt.Errorf("object store not initialized")
	}

	if err := hash.Validate(); err != nil {
		return "", fmt.Errorf("invalid hash: %w", err)
	}

	filePath, err := f.resolveObjectPath(hash)
	if err != nil {
		return "", fmt.Errorf("failed to resolve object path: %w", err)
	}

	return filePath, nil
}
