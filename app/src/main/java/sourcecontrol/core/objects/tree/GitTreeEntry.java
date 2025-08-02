package sourcecontrol.core.objects.tree;

import java.nio.charset.StandardCharsets;
import java.util.Objects;

/**
 * Represents a single entry in a Git tree object.
 * 
 * Each entry contains:
 * - mode: File permissions and type (6 bytes, octal)
 * - name: Filename or directory name (variable length string)
 * - sha: SHA-1 hash of the referenced object (40 character hex string)
 * 
 * Entry types by mode:
 * - 040000: Directory (tree object)
 * - 100644: Regular file (blob object)
 * - 100755: Executable file (blob object)
 * - 120000: Symbolic link (blob object)
 * - 160000: Git submodule (commit object)
 * 
 * Serialized format in tree object:
 * [mode] [space] [filename] [null byte] [20-byte SHA-1 binary]
 * 
 * Example serialized entry for "hello.txt" file:
 * "100644 hello.txt\0[20 bytes of SHA-1]"
 */
public final class GitTreeEntry implements Comparable<GitTreeEntry> {

    /**
     * Represents the type of entry in a Git tree object.
     */
    public enum EntryType {
        DIRECTORY("040000", "tree"),
        REGULAR_FILE("100644", "blob"),
        EXECUTABLE_FILE("100755", "blob"),
        SYMBOLIC_LINK("120000", "blob"),
        SUBMODULE("160000", "commit");

        private final String mode;
        private final String objectType;

        EntryType(String mode, String objectType) {
            this.mode = mode;
            this.objectType = objectType;
        }

        public String getMode() {
            return mode;
        }

        public String getObjectType() {
            return objectType;
        }

        public static EntryType fromMode(String mode) {
            for (EntryType type : values()) {
                if (type.mode.equals(mode)) {
                    return type;
                }
            }
            throw new IllegalArgumentException("Unknown mode: " + mode);
        }

        public boolean isDirectory() {
            return this == DIRECTORY;
        }

        public boolean isFile() {
            return this == REGULAR_FILE || this == EXECUTABLE_FILE;
        }
    }

    private final String mode;
    private final String name;
    private final String sha;
    private final EntryType type;

    public GitTreeEntry(String mode, String name, String sha) {
        this.mode = validateAndNormalizeMode(mode);
        this.name = validateName(name);
        this.sha = validateSha(sha);
        this.type = EntryType.fromMode(this.mode);
    }

    public GitTreeEntry(EntryType type, String name, String sha) {
        this.type = Objects.requireNonNull(type, "Entry type cannot be null");
        this.mode = type.getMode();
        this.name = validateName(name);
        this.sha = validateSha(sha);
    }

    public boolean isDirectory() {
        return type.isDirectory();
    }

    @Override
    public int hashCode() {
        return Objects.hash(mode, name, sha);
    }

    @Override
    public String toString() {
        return String.format("%s %s %s\t%s", mode, type.getObjectType(), sha, name);
    }

    @Override
    public boolean equals(Object obj) {
        if (this == obj)
            return true;
        if (obj == null || getClass() != obj.getClass())
            return false;
        GitTreeEntry that = (GitTreeEntry) obj;
        return Objects.equals(mode, that.mode) &&
                Objects.equals(name, that.name) &&
                Objects.equals(sha, that.sha);
    }

    /**
     * Serializes this entry to the binary format used in tree objects.
     * Format: [mode] [space] [name] [null] [20-byte binary SHA]
     */
    public byte[] serialize() {
        byte[] modeBytes = mode.getBytes(StandardCharsets.UTF_8);
        byte[] nameBytes = name.getBytes(StandardCharsets.UTF_8);
        byte[] shaBytes = hexToBytes(sha);
        int spaceSize = 1;

        int totalSize = modeBytes.length + spaceSize + nameBytes.length + 1 + shaBytes.length;

        byte[] result = new byte[totalSize];
        int offset = 0;

        System.arraycopy(modeBytes, 0, result, offset, modeBytes.length);
        offset += modeBytes.length;

        result[offset++] = ' ';

        System.arraycopy(nameBytes, 0, result, offset, nameBytes.length);
        offset += nameBytes.length;

        result[offset++] = 0;
        System.arraycopy(shaBytes, 0, result, offset, shaBytes.length);

        return result;
    }

    /**
     * Git uses a specific sorting order for tree entries to ensure deterministic
     * hashes.
     * Directories are sorted as if they have a trailing slash.
     */
    @Override
    public int compareTo(GitTreeEntry other) {
        String thisKey = isDirectory() ? name + "/" : name;
        String otherKey = other.isDirectory() ? other.name + "/" : other.name;
        return thisKey.compareTo(otherKey);
    }

    /**
     * Validates and normalizes the mode string.
     */
    private String validateAndNormalizeMode(String mode) {
        if (mode == null || mode.isEmpty()) {
            throw new IllegalArgumentException("Mode cannot be null or empty");
        }

        if (mode.length() == 5) {
            mode = "0" + mode;
        }

        if (mode.length() != 6) {
            throw new IllegalArgumentException("Invalid mode length: " + mode);
        }

        return mode;
    }

    private String validateName(String name) {
        if (name == null || name.isEmpty()) {
            throw new IllegalArgumentException("Name cannot be null or empty");
        }

        if (name.contains("/") || name.contains("\0")) {
            throw new IllegalArgumentException("Invalid characters in name: " + name);
        }

        return name;
    }

    private String validateSha(String sha) {
        if (sha == null || sha.length() != 40) {
            throw new IllegalArgumentException("SHA must be 40 characters long");
        }

        if (!sha.matches("[0-9a-fA-F]+")) {
            throw new IllegalArgumentException("SHA must contain only hex characters");
        }

        return sha.toLowerCase();
    }

    private static byte[] hexToBytes(String hex) {
        byte[] result = new byte[hex.length() / 2];
        for (int i = 0; i < result.length; i++) {
            int index = i * 2;
            result[i] = (byte) Integer.parseInt(hex.substring(index, index + 2), 16);
        }
        return result;
    }
}