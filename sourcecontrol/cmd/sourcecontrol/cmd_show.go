package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/utkarsh5026/SourceControl/cmd/ui"
	"github.com/utkarsh5026/SourceControl/pkg/commitmanager"
	"github.com/utkarsh5026/SourceControl/pkg/objects"
	"github.com/utkarsh5026/SourceControl/pkg/objects/blob"
	"github.com/utkarsh5026/SourceControl/pkg/objects/commit"
	"github.com/utkarsh5026/SourceControl/pkg/objects/tree"
	"github.com/utkarsh5026/SourceControl/pkg/repository/sourcerepo"
	"github.com/utkarsh5026/SourceControl/pkg/store"
)

func newShowCmd() *cobra.Command {
	var format string
	var showPatch bool

	cmd := &cobra.Command{
		Use:   "show [object]",
		Short: "Show detailed information about an object",
		Long: `Display detailed information about Git objects (commits, trees, blobs).

For commits:
  - Shows commit metadata (hash, author, committer, date)
  - Displays the commit message
  - Optionally shows the diff/patch (with --patch flag)

For trees:
  - Lists all entries in the tree
  - Shows file modes, types, and hashes

For blobs:
  - Displays the blob content
  - Shows blob size and hash

If no object is specified, shows the current HEAD commit.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			repo, err := findRepository()
			if err != nil {
				return err
			}

			showCmd := ShowCommand{}

			ctx := context.Background()

			var objectRef string
			if len(args) > 0 {
				objectRef = args[0]
			} else {
				objectRef = "HEAD"
			}

			hash, err := showCmd.resolveObjectRef(ctx, repo, objectRef)
			if err != nil {
				return fmt.Errorf("failed to resolve object reference '%s': %w", objectRef, err)
			}

			objStore := store.NewFileObjectStore()
			if err := objStore.Initialize(repo.WorkingDirectory()); err != nil {
				return fmt.Errorf("failed to initialize object store: %w", err)
			}

			o, err := objStore.ReadObject(hash)
			if err != nil {
				return fmt.Errorf("failed to read object: %w", err)
			}

			if o == nil {
				return fmt.Errorf("object not found: %s", hash)
			}

			switch o.Type() {
			case objects.CommitType:
				return showCmd.showCommit(repo, o.(*commit.Commit), showPatch)

			case objects.TreeType:
				return showCmd.showTree(o.(*tree.Tree))

			case objects.BlobType:
				return showCmd.showBlob(o.(*blob.Blob))
			default:
				return fmt.Errorf("unsupported object type: %s", o.Type())
			}
		},
	}

	cmd.Flags().StringVarP(&format, "format", "f", "full", "Output format (full, short)")
	cmd.Flags().BoolVarP(&showPatch, "patch", "p", false, "Show diff/patch for commits")

	return cmd
}

type ShowCommand struct{}

func (sc *ShowCommand) resolveObjectRef(ctx context.Context, repo *sourcerepo.SourceRepository, ref string) (objects.ObjectHash, error) {
	if hash, err := objects.ParseObjectHash(ref); err == nil {
		return hash, nil
	}

	commitMgr := commitmanager.NewManager(repo)
	if err := commitMgr.Initialize(ctx); err != nil {
		return "", fmt.Errorf("failed to initialize commit manager: %w", err)
	}

	if ref == "HEAD" || ref == "" {
		history, err := commitMgr.GetHistory(ctx, objects.ObjectHash(""), 1)
		if err != nil {
			return "", fmt.Errorf("failed to get HEAD commit: %w", err)
		}
		if len(history) == 0 {
			return "", fmt.Errorf("no commits yet")
		}
		return history[0].Hash()
	}

	if len(ref) >= 7 && len(ref) < 40 {
		return "", fmt.Errorf("short hash resolution not yet implemented: %s", ref)
	}

	return "", fmt.Errorf("could not resolve reference: %s", ref)
}

func (sc *ShowCommand) showCommit(repo *sourcerepo.SourceRepository, c *commit.Commit, showPatch bool) error {
	commitHash, _ := c.Hash()

	fmt.Println(ui.Header(" Commit Details "))
	fmt.Println()

	fmt.Printf("%s %s\n", ui.Yellow("commit"), ui.Yellow(commitHash.String()))

	if c.IsMergeCommit() {
		fmt.Printf("%s ", ui.Cyan("Merge:"))
		for i, parent := range c.ParentSHAs {
			if i > 0 {
				fmt.Print(" ")
			}
			fmt.Print(ui.Yellow(string(parent.Short())))
		}
		fmt.Println()
	}

	fmt.Printf("%s %s <%s>\n",
		ui.Cyan("Author:"),
		ui.Blue(c.Author.Name),
		ui.Blue(c.Author.Email))
	fmt.Printf("%s %s\n",
		ui.Cyan("Date:  "),
		ui.Magenta(c.Author.When.Time().Format(time.RFC1123)))

	fmt.Printf("%s %s\n", ui.Cyan("Tree:  "), ui.Yellow(string(c.TreeSHA.Short())))
	if len(c.ParentSHAs) > 0 && !c.IsMergeCommit() {
		for _, parent := range c.ParentSHAs {
			fmt.Printf("%s %s\n", ui.Cyan("Parent:"), ui.Yellow(string(parent.Short())))
		}
	}

	fmt.Println()
	messageLines := strings.Split(strings.TrimSpace(c.Message), "\n")
	for _, line := range messageLines {
		fmt.Printf("    %s\n", line)
	}
	fmt.Println()

	if showPatch {
		fmt.Println(ui.Header(" Changes "))
		fmt.Println()
		if err := sc.showCommitDiff(repo, c); err != nil {
			return fmt.Errorf("failed to show diff: %w", err)
		}
	}

	return nil
}

func (sc *ShowCommand) showCommitDiff(repo *sourcerepo.SourceRepository, c *commit.Commit) error {
	objStore := store.NewFileObjectStore()
	if err := objStore.Initialize(repo.WorkingDirectory()); err != nil {
		return fmt.Errorf("failed to initialize object store: %w", err)
	}

	currentTree, err := repo.ReadTreeObject(c.TreeSHA)
	if err != nil {
		return fmt.Errorf("failed to load tree: %w", err)
	}

	if len(c.ParentSHAs) > 0 {
		parentCommit, err := repo.ReadCommitObject(c.ParentSHAs[0])
		if err != nil {
			return fmt.Errorf("failed to read parent commit: %w", err)
		}

		parentTree, err := repo.ReadTreeObject(parentCommit.TreeSHA)
		if err != nil {
			return fmt.Errorf("failed to load parent tree: %w", err)
		}

		return sc.compareTrees(repo, parentTree, currentTree, "")
	} else {
		fmt.Println(ui.Green("Initial commit - all files are new:"))
		fmt.Println()
		return sc.showTreeContents(repo, currentTree, "", true)
	}
}

func (sc *ShowCommand) compareTrees(repo *sourcerepo.SourceRepository, oldTree, newTree *tree.Tree, prefix string) error {
	oldEntries := oldTree.Entries()
	newEntries := newTree.Entries()

	oldMap := make(map[string]*tree.TreeEntry)
	newMap := make(map[string]*tree.TreeEntry)

	for _, entry := range oldEntries {
		oldMap[entry.Name().String()] = entry
	}

	for _, entry := range newEntries {
		newMap[entry.Name().String()] = entry
	}

	for name, newEntry := range newMap {
		oldEntry, existed := oldMap[name]
		path := prefix + name

		if !existed {
			fmt.Printf("%s %s\n", ui.Green("+ add"), ui.Green(path))
		} else if oldEntry.SHA() != newEntry.SHA() {
			if newEntry.IsDirectory() {
				oldSubTree, _ := repo.ReadTreeObject(oldEntry.SHA())
				newSubTree, _ := repo.ReadTreeObject(newEntry.SHA())
				if oldSubTree != nil && newSubTree != nil {
					sc.compareTrees(repo, oldSubTree, newSubTree, path+"/")
				}
			} else {
				fmt.Printf("%s %s\n", ui.Yellow("~ mod"), ui.Yellow(path))
			}
		}
	}

	for name := range oldMap {
		if _, exists := newMap[name]; !exists {
			path := prefix + name
			fmt.Printf("%s %s\n", ui.Red("- del"), ui.Red(path))
		}
	}

	return nil
}

func (sc *ShowCommand) showBlob(b *blob.Blob) error {
	blobHash, _ := b.Hash()

	fmt.Println(ui.Header(" Blob Details "))
	fmt.Println()

	fmt.Printf("%s %s\n", ui.Yellow("blob"), ui.Yellow(blobHash.String()))
	size, _ := b.Size()
	fmt.Printf("%s %s\n", ui.Cyan("Size:"), ui.Blue(size.String()))
	fmt.Println()

	content, err := b.Content()
	if err != nil {
		return fmt.Errorf("failed to get blob content: %w", err)
	}

	fmt.Println(ui.Cyan("Content:"))
	fmt.Println()

	contentStr := content.String()

	if sc.isBinary([]byte(contentStr)) {
		fmt.Println(ui.Yellow("  (binary content, not displayed)"))
		fmt.Printf("  %s %d bytes\n", ui.Cyan("Size:"), len(contentStr))
		return nil
	}

	lines := strings.Split(contentStr, "\n")
	for i, line := range lines {
		if i >= 100 {
			remaining := len(lines) - i
			fmt.Printf("\n%s (%d more lines...)\n", ui.Yellow("..."), remaining)
			break
		}
		fmt.Println(line)
	}

	return nil
}

func (sc *ShowCommand) isBinary(data []byte) bool {
	checkLen := 512
	if len(data) < checkLen {
		checkLen = len(data)
	}

	for i := 0; i < checkLen; i++ {
		if data[i] == 0 {
			return true
		}
	}

	return false
}

func (sc *ShowCommand) showTree(t *tree.Tree) error {
	treeHash, _ := t.Hash()

	fmt.Println(ui.Header(" Tree Details "))
	fmt.Println()

	fmt.Printf("%s %s\n", ui.Yellow("tree"), ui.Yellow(treeHash.String()))
	size, _ := t.Size()
	fmt.Printf("%s %s\n", ui.Cyan("Size:"), ui.Blue(size.String()))
	fmt.Printf("%s %d\n", ui.Cyan("Entries:"), len(t.Entries()))
	fmt.Println()

	entries := t.Entries()
	if len(entries) == 0 {
		fmt.Println(ui.Yellow("  (empty tree)"))
		return nil
	}

	fmt.Println(ui.Cyan("Contents:"))
	for _, entry := range entries {
		modeStr := entry.Mode().ToOctalString()
		typeStr := getEntryTypeString(entry)

		fmt.Printf("  %s %s %s  %s\n",
			ui.Magenta(modeStr),
			ui.Yellow(typeStr),
			ui.Yellow(string(entry.SHA().Short())),
			ui.Blue(entry.Name().String()))
	}
	fmt.Println()

	return nil
}

func (sc *ShowCommand) showTreeContents(repo *sourcerepo.SourceRepository, t *tree.Tree, prefix string, showFiles bool) error {
	entries := t.Entries()

	for _, entry := range entries {
		path := prefix + entry.Name().String()

		if entry.IsDirectory() {
			subTree, err := repo.ReadTreeObject(entry.SHA())
			if err == nil {
				sc.showTreeContents(repo, subTree, path+"/", showFiles)
			}
		} else if showFiles {
			fmt.Printf("%s %s\n", ui.Green("+ add"), ui.Green(path))
		}
	}

	return nil
}

func getEntryTypeString(entry *tree.TreeEntry) string {
	if entry.IsDirectory() {
		return "tree"
	} else if entry.IsFile() {
		return "blob"
	} else if entry.IsSymbolicLink() {
		return "link"
	} else if entry.IsSubmodule() {
		return "commit"
	}
	return "unknown"
}
