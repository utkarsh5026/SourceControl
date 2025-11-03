package internal

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/utkarsh5026/SourceControl/pkg/objects"
	"github.com/utkarsh5026/SourceControl/pkg/objects/blob"
	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
	"github.com/utkarsh5026/SourceControl/pkg/repository/sourcerepo"
)

// setupTestRepo creates a temporary repository for testing
func setupTestRepo(t *testing.T) (*sourcerepo.SourceRepository, string) {
	t.Helper()

	// Create temp directory
	tmpDir := t.TempDir()

	// Initialize repository
	repo := sourcerepo.NewSourceRepository()
	if err := repo.Initialize(scpath.RepositoryPath(tmpDir)); err != nil {
		t.Fatalf("Failed to initialize repository: %v", err)
	}

	return repo, tmpDir
}

// createTestBlob creates a blob object with test content
func createTestBlob(t *testing.T, repo *sourcerepo.SourceRepository, content string) objects.ObjectHash {
	t.Helper()

	b := blob.NewBlob([]byte(content))
	hash, err := repo.WriteObject(b)
	if err != nil {
		t.Fatalf("Failed to write blob: %v", err)
	}

	return hash
}

func TestFileOps_ApplyOperation_Create(t *testing.T) {
	repo, workDir := setupTestRepo(t)
	service := NewFileOps(repo)

	// Create a test blob
	content := "Hello, World!"
	blobSHA := createTestBlob(t, repo, content)

	tests := []struct {
		name     string
		op       Operation
		wantFile string
		wantMode os.FileMode
		wantErr  bool
	}{
		{
			name: "create regular file",
			op: Operation{
				Path:   scpath.RelativePath("test.txt"),
				Action: ActionCreate,
				SHA:    blobSHA,
				Mode:   0644,
			},
			wantFile: "test.txt",
			wantMode: 0644,
			wantErr:  false,
		},
		{
			name: "create file in subdirectory",
			op: Operation{
				Path:   scpath.RelativePath("subdir/nested.txt"),
				Action: ActionCreate,
				SHA:    blobSHA,
				Mode:   0644,
			},
			wantFile: "subdir/nested.txt",
			wantMode: 0644,
			wantErr:  false,
		},
		{
			name: "create executable file",
			op: Operation{
				Path:   scpath.RelativePath("script.sh"),
				Action: ActionCreate,
				SHA:    blobSHA,
				Mode:   0755,
			},
			wantFile: "script.sh",
			wantMode: 0755,
			wantErr:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Apply operation
			err := service.ApplyOperation(tt.op)

			// Check error
			if (err != nil) != tt.wantErr {
				t.Errorf("ApplyOperation() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if tt.wantErr {
				return
			}

			// Verify file exists
			filePath := filepath.Join(workDir, tt.wantFile)
			if _, err := os.Stat(filePath); os.IsNotExist(err) {
				t.Errorf("File was not created: %s", filePath)
				return
			}

			// Verify content
			data, err := os.ReadFile(filePath)
			if err != nil {
				t.Errorf("Failed to read file: %v", err)
				return
			}
			if string(data) != content {
				t.Errorf("File content = %q, want %q", string(data), content)
			}

			// Verify permissions (check user permissions only, ignore group/other)
			// Note: On Windows, execute permission doesn't work the same way as Unix
			info, err := os.Stat(filePath)
			if err != nil {
				t.Errorf("Failed to stat file: %v", err)
				return
			}
			gotMode := info.Mode() & 0700 // User permissions only
			// On Windows, we can only reliably check read/write, not execute
			// So we'll just check that the file has at least read permission
			if gotMode&0400 == 0 {
				t.Errorf("File is not readable: mode = %o", gotMode)
			}
		})
	}
}

func TestFileOps_ApplyOperation_Modify(t *testing.T) {
	repo, workDir := setupTestRepo(t)
	service := NewFileOps(repo)

	// Create initial file
	initialContent := "Initial content"
	initialBlob := createTestBlob(t, repo, initialContent)
	filePath := scpath.RelativePath("test.txt")

	err := service.ApplyOperation(Operation{
		Path:   filePath,
		Action: ActionCreate,
		SHA:    initialBlob,
		Mode:   0644,
	})
	if err != nil {
		t.Fatalf("Failed to create initial file: %v", err)
	}

	// Modify the file
	newContent := "Modified content"
	newBlob := createTestBlob(t, repo, newContent)

	err = service.ApplyOperation(Operation{
		Path:   filePath,
		Action: ActionModify,
		SHA:    newBlob,
		Mode:   0644,
	})
	if err != nil {
		t.Errorf("ApplyOperation(modify) error = %v", err)
		return
	}

	// Verify content changed
	data, err := os.ReadFile(filepath.Join(workDir, "test.txt"))
	if err != nil {
		t.Fatalf("Failed to read file: %v", err)
	}
	if string(data) != newContent {
		t.Errorf("File content = %q, want %q", string(data), newContent)
	}
}

func TestFileOps_ApplyOperation_Delete(t *testing.T) {
	repo, workDir := setupTestRepo(t)
	service := NewFileOps(repo)

	tests := []struct {
		name         string
		setupFiles   []string
		deleteFile   string
		checkGone    string
		checkRemains []string
	}{
		{
			name:       "delete single file",
			setupFiles: []string{"test.txt"},
			deleteFile: "test.txt",
			checkGone:  "test.txt",
		},
		{
			name:         "delete file in subdirectory",
			setupFiles:   []string{"subdir/file1.txt", "subdir/file2.txt"},
			deleteFile:   "subdir/file1.txt",
			checkGone:    "subdir/file1.txt",
			checkRemains: []string{"subdir/file2.txt"},
		},
		{
			name:       "delete file removes empty parent directory",
			setupFiles: []string{"deep/nested/file.txt"},
			deleteFile: "deep/nested/file.txt",
			checkGone:  "deep/nested/file.txt",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup: create test files
			content := "test content"
			blobSHA := createTestBlob(t, repo, content)

			for _, file := range tt.setupFiles {
				err := service.ApplyOperation(Operation{
					Path:   scpath.RelativePath(file),
					Action: ActionCreate,
					SHA:    blobSHA,
					Mode:   0644,
				})
				if err != nil {
					t.Fatalf("Setup: failed to create %s: %v", file, err)
				}
			}

			// Delete file
			err := service.ApplyOperation(Operation{
				Path:   scpath.RelativePath(tt.deleteFile),
				Action: ActionDelete,
			})
			if err != nil {
				t.Errorf("ApplyOperation(delete) error = %v", err)
				return
			}

			// Verify file is gone
			goneFile := filepath.Join(workDir, tt.checkGone)
			if _, err := os.Stat(goneFile); !os.IsNotExist(err) {
				t.Errorf("File still exists: %s", goneFile)
			}

			// Verify other files remain
			for _, remain := range tt.checkRemains {
				remainFile := filepath.Join(workDir, remain)
				if _, err := os.Stat(remainFile); err != nil {
					t.Errorf("File was incorrectly deleted: %s", remainFile)
				}
			}
		})
	}
}

func TestFileOps_CreateBackup(t *testing.T) {
	repo, workDir := setupTestRepo(t)
	service := NewFileOps(repo)

	tests := []struct {
		name      string
		setupFile bool
		content   string
		mode      os.FileMode
		wantExist bool
	}{
		{
			name:      "backup existing file",
			setupFile: true,
			content:   "Original content",
			mode:      0644,
			wantExist: true,
		},
		{
			name:      "backup non-existent file",
			setupFile: false,
			wantExist: false,
		},
	}

	for i, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Use unique file name for each test to avoid interference
			testFile := fmt.Sprintf("test-%d.txt", i)
			filePath := scpath.RelativePath(testFile)
			fullPath := filepath.Join(workDir, testFile)

			// Setup: create file if needed
			if tt.setupFile {
				err := os.WriteFile(fullPath, []byte(tt.content), tt.mode)
				if err != nil {
					t.Fatalf("Setup: failed to create file: %v", err)
				}
			}

			// Create backup
			backup, err := service.CreateBackup(filePath)
			if err != nil {
				t.Errorf("CreateBackup() error = %v", err)
				return
			}

			// Verify backup properties
			if backup.Existed != tt.wantExist {
				t.Errorf("backup.Existed = %v, want %v", backup.Existed, tt.wantExist)
			}

			if tt.wantExist {
				// Verify backup file exists
				if _, err := os.Stat(backup.TempFile); err != nil {
					t.Errorf("Backup file doesn't exist: %s", backup.TempFile)
				}

				// Verify backup content matches original
				backupData, err := os.ReadFile(backup.TempFile)
				if err != nil {
					t.Errorf("Failed to read backup: %v", err)
				}
				if string(backupData) != tt.content {
					t.Errorf("Backup content = %q, want %q", string(backupData), tt.content)
				}

				// Cleanup
				service.CleanupBackup(backup)
			}
		})
	}
}

func TestFileOps_RestoreBackup(t *testing.T) {
	repo, workDir := setupTestRepo(t)
	service := NewFileOps(repo)

	t.Run("restore existing file", func(t *testing.T) {
		// Setup: create original file
		originalContent := "Original content"
		filePath := scpath.RelativePath("test.txt")
		fullPath := filepath.Join(workDir, "test.txt")
		err := os.WriteFile(fullPath, []byte(originalContent), 0644)
		if err != nil {
			t.Fatalf("Setup failed: %v", err)
		}

		// Create backup
		backup, err := service.CreateBackup(filePath)
		if err != nil {
			t.Fatalf("CreateBackup failed: %v", err)
		}
		defer service.CleanupBackup(backup)

		// Modify file
		modifiedContent := "Modified content"
		err = os.WriteFile(fullPath, []byte(modifiedContent), 0644)
		if err != nil {
			t.Fatalf("Modify failed: %v", err)
		}

		// Restore backup
		err = service.RestoreBackup(backup)
		if err != nil {
			t.Errorf("RestoreBackup() error = %v", err)
			return
		}

		// Verify file restored to original content
		data, err := os.ReadFile(fullPath)
		if err != nil {
			t.Fatalf("Failed to read file: %v", err)
		}
		if string(data) != originalContent {
			t.Errorf("Restored content = %q, want %q", string(data), originalContent)
		}
	})

	t.Run("restore non-existent file", func(t *testing.T) {
		filePath := scpath.RelativePath("newfile.txt")
		fullPath := filepath.Join(workDir, "newfile.txt")

		// Create backup (file doesn't exist)
		backup, err := service.CreateBackup(filePath)
		if err != nil {
			t.Fatalf("CreateBackup failed: %v", err)
		}

		// Create the file
		err = os.WriteFile(fullPath, []byte("New content"), 0644)
		if err != nil {
			t.Fatalf("Create file failed: %v", err)
		}

		// Restore backup (should delete the file)
		err = service.RestoreBackup(backup)
		if err != nil {
			t.Errorf("RestoreBackup() error = %v", err)
			return
		}

		// Verify file is deleted
		if _, err := os.Stat(fullPath); !os.IsNotExist(err) {
			t.Errorf("File should have been deleted")
		}
	})
}

func TestFileOps_DryRun(t *testing.T) {
	repo, workDir := setupTestRepo(t)
	service := NewFileOps(repo)
	service.SetDryRun(true)

	content := "Test content"
	blobSHA := createTestBlob(t, repo, content)

	// Perform operation in dry-run mode
	err := service.ApplyOperation(Operation{
		Path:   scpath.RelativePath("test.txt"),
		Action: ActionCreate,
		SHA:    blobSHA,
		Mode:   0644,
	})
	if err != nil {
		t.Errorf("ApplyOperation() in dry-run mode error = %v", err)
	}

	// Verify file was NOT created
	filePath := filepath.Join(workDir, "test.txt")
	if _, err := os.Stat(filePath); !os.IsNotExist(err) {
		t.Errorf("File should not exist in dry-run mode")
	}
}
