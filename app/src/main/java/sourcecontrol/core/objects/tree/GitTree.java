package sourcecontrol.core.objects.tree;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

import sourcecontrol.core.objects.GitObject;
import sourcecontrol.core.objects.ObjectType;
import sourcecontrol.exceptions.ObjectException;
import sourcecontrol.utils.crypto.HashUtils;

// @formatter:off
/**
 * Git Tree Object Implementation
 * 
 * A tree object represents a directory snapshot in Git. It contains entries for
 * files and subdirectories, each with their mode, name, and SHA-1 hash.
 * 
 * Tree Object Structure:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Header: "tree" SPACE size NULL                                  │
 * │ Entry 1: mode SPACE name NULL [20-byte SHA-1]                   │
 * │ Entry 2: mode SPACE name NULL [20-byte SHA-1]                   │
 * │ ...                                                             │
 * │ Entry N: mode SPACE name NULL [20-byte SHA-1]                   │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * Example tree object content (without header):
 * "100644 README.md\0[20 bytes]040000 src\0[20 bytes]100755 build.sh\0[20
 * bytes]"
 * 
 * Tree objects are essential for Git's content tracking because they:
 * 1. Preserve directory structure and file organization
 * 2. Track file permissions and types
 * 3. Enable efficient diff calculations between directory states
 * 4. Form the backbone of commit objects (each commit points to a root tree)
 * 
 * Sorting Rules:
 * Git sorts tree entries in a specific way to ensure deterministic hashes:
 * - Entries are sorted lexicographically by name
 * - Directories are treated as if they have a trailing "/"
 * - This ensures that "file" comes before "file.txt" and "dir/" comes before
 * "dir2"
 */
// @formatter:on
public class GitTree implements GitObject {

    private final List<GitTreeEntry> entries;
    private String cachedSha;

    public GitTree() {
        this.entries = new ArrayList<>();
    }

    public GitTree(List<GitTreeEntry> entries) {
        this.entries = new ArrayList<>(entries != null ? entries : Collections.emptyList());
        sortEntries();
    }

    @Override
    public ObjectType getType() {
        return ObjectType.TREE;
    }

    @Override
    public long getSize() {
        return getContent().length;
    }

    @Override
    public byte[] getContent() {
        try {
            return serializeContent();
        } catch (ObjectException e) {
            throw new RuntimeException("Failed to get content", e);
        }
    }

    @Override
    public String getSha() {
        if (cachedSha == null) {
            try {
                byte[] serialized = serialize();
                cachedSha = HashUtils.sha1Hex(serialized);
            } catch (ObjectException e) {
                throw new RuntimeException("Failed to calculate SHA", e);
            }
        }
        return cachedSha;
    }

    public List<GitTreeEntry> getEntries() {
        return Collections.unmodifiableList(entries);
    }

    public boolean isEmpty() {
        return entries.isEmpty();
    }

    @Override
    public void deserialize(byte[] data) throws ObjectException {
        try {
            int nullIndex = -1;
            for (int i = 0; i < data.length; i++) {
                if (data[i] == 0) {
                    nullIndex = i;
                    break;
                }
            }

            if (nullIndex == -1) {
                throw new ObjectException("Invalid tree format: no null terminator found");
            }

            // Parse and validate header
            String header = new String(data, 0, nullIndex, StandardCharsets.UTF_8);
            String[] parts = header.split(" ");

            if (parts.length != 2) {
                throw new ObjectException("Invalid tree header format");
            }

            String type = parts[0];
            int size = Integer.parseInt(parts[1]);

            if (!type.equals("tree")) {
                throw new ObjectException("Expected tree type, got: " + type);
            }

            // Validate content size
            int contentLength = data.length - nullIndex - 1;
            if (contentLength != size) {
                throw new ObjectException("Content size mismatch: expected " + size + ", got " + contentLength);
            }

            parseEntries(data, nullIndex + 1, contentLength);
            sortEntries();
            invalidateCache();

        } catch (NumberFormatException e) {
            throw new ObjectException("Invalid size in tree header", e);
        } catch (Exception e) {
            throw new ObjectException("Failed to deserialize tree", e);
        }
    }

    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder();
        sb.append("GitTree{sha=").append(getSha())
                .append(", entries=").append(entries.size())
                .append("}\n");

        for (GitTreeEntry entry : entries) {
            sb.append("  ").append(entry.toString()).append("\n");
        }

        return sb.toString();
    }

    @Override
    public boolean equals(Object obj) {
        if (this == obj)
            return true;
        if (obj == null || getClass() != obj.getClass())
            return false;
        GitTree gitTree = (GitTree) obj;
        return Objects.equals(entries, gitTree.entries);
    }

    @Override
    public int hashCode() {
        return Objects.hash(entries);
    }

    private byte[] serializeContent() throws ObjectException {
        if (entries.isEmpty()) {
            return new byte[0];
        }

        int totalSize = entries.stream()
                .mapToInt(entry -> entry.serialize().length)
                .sum();

        byte[] result = new byte[totalSize];
        int offset = 0;

        for (GitTreeEntry entry : entries) {
            byte[] entryBytes = entry.serialize();
            System.arraycopy(entryBytes, 0, result, offset, entryBytes.length);
            offset += entryBytes.length;
        }

        return result;
    }

    private void sortEntries() {
        entries.sort(GitTreeEntry::compareTo);
    }

    private void invalidateCache() {
        this.cachedSha = null;
    }

    private void parseEntries(byte[] data, int startOffset, int length) throws ObjectException {
        entries.clear();

        int offset = startOffset;
        int endOffset = startOffset + length;

        while (offset < endOffset) {
            GitTreeEntry.ParseResult result = GitTreeEntry.parseFrom(data, offset);
            entries.add(result.entry);
            offset = result.nextOffset;
        }

        if (offset != endOffset) {
            throw new ObjectException("Tree parsing error: unexpected data remaining");
        }
    }
}
