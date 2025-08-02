package sourcecontrol.core.objects.impl;

import java.nio.file.Path;
import java.util.Optional;
import java.io.IOException;
import java.util.zip.DataFormatException;

import sourcecontrol.core.objects.ObjectType;
import sourcecontrol.core.objects.blob.GitBlob;
import sourcecontrol.core.objects.ObjectStore;
import sourcecontrol.core.objects.GitObject;
import sourcecontrol.exceptions.ObjectException;
import sourcecontrol.utils.crypto.HashUtils;
import sourcecontrol.utils.io.FileUtils;
import sourcecontrol.utils.crypto.CompressionUtils;

/**
 * File-based implementation of Git object storage that mimics Git's internal
 * object database.
 * 
 * This class stores Git objects in a directory structure where each object is:
 * 1. Serialized to Git's standard format
 * 2. Compressed using DEFLATE algorithm
 * 3. Stored in a file named by its SHA-1 hash
 * 
 * Directory Structure:
 * ┌─ .git/objects/
 * │ ├─ ab/ ← First 2 characters of SHA
 * │ │ └─ cdef123... ← Remaining 38 characters of SHA
 * │ ├─ cd/
 * │ │ └─ ef456789...
 * │ └─ ...
 * 
 * Example for SHA "abcdef1234567890abcdef1234567890abcdef12":
 * File path: .git/objects/ab/cdef1234567890abcdef1234567890abcdef12
 * 
 * This structure provides efficient storage and lookup while distributing files
 * across subdirectories to avoid filesystem performance issues with too many
 * files in a single directory.
 */
public class FileObjectStore implements ObjectStore {
    private Path objectsPath;

    /**
     * Initializes the object store by creating the objects directory structure.
     * 
     * Sets up the base objects directory at <gitDir>/objects where all Git objects
     * will be stored. Creates the directory if it doesn't exist.
     */
    @Override
    public void initialize(Path gitDir) throws ObjectException {
        this.objectsPath = gitDir.resolve("objects");
        try {
            FileUtils.createDirectories(objectsPath);
        } catch (IOException e) {
            throw new ObjectException("Failed to initialize object store", e);
        }
    }

    /**
     * Writes a Git object to the file system using Git's standard storage format.
     * If an object with the same SHA already exists, it's not written again
     * (content-addressable storage ensures identical content has identical hash).
     */
    @Override
    public String writeObject(GitObject object) throws ObjectException {
        try {
            byte[] serialized = object.serialize();
            String sha = HashUtils.sha1Hex(serialized);

            Path filePath = resolveObjectPath(sha);

            if (FileUtils.exists(filePath)) {
                return sha;
            }

            byte[] compressed = CompressionUtils.compress(serialized);
            FileUtils.createFile(filePath, compressed);

            return sha;
        } catch (IOException e) {
            throw new ObjectException("Failed to write object", e);
        }
    }

    /**
     * Reads and reconstructs a Git object from storage using its SHA-1 hash.
     * The method first determines the object type from the header, creates an
     * appropriate object instance, then deserializes the data into that object.
     */
    @Override
    public Optional<GitObject> readObject(String sha) throws ObjectException {
        if (sha == null || sha.length() < 3) {
            return Optional.empty();
        }

        try {
            Path filePath = resolveObjectPath(sha);
            if (!FileUtils.exists(filePath)) {
                return Optional.empty();
            }

            byte[] compressed = FileUtils.readFile(filePath);
            byte[] decompressed = CompressionUtils.decompress(compressed);

            GitObject object = createObjectFromHeader(decompressed);
            object.deserialize(decompressed);

            return Optional.of(object);
        } catch (IOException | DataFormatException e) {
            throw new ObjectException("Failed to read object: " + sha);
        }
    }

    @Override
    public boolean hasObject(String sha) {
        if (sha == null || sha.length() < 3) {
            return false;
        }

        Path filePath = resolveObjectPath(sha);
        return FileUtils.exists(filePath);
    }

    /**
     * Converts a SHA-1 hash to the corresponding file path in Git's object storage
     * structure.
     * 
     * Git uses a two-level directory structure to avoid having too many files in a
     * single
     * directory, which can cause filesystem performance issues.
     */
    private Path resolveObjectPath(String sha) {
        String dirName = sha.substring(0, 2);
        String fileName = sha.substring(2);

        Path dirPath = objectsPath.resolve(dirName);
        return dirPath.resolve(fileName);
    }

    private GitObject createObjectFromHeader(byte[] data) throws ObjectException {

        int nullIndex = -1;
        for (int i = 0; i < data.length; i++) {
            if (data[i] == 0) {
                nullIndex = i;
                break;
            }
        }

        if (nullIndex == -1) {
            throw new ObjectException("Invalid object format: no null terminator");
        }

        String header = new String(data, 0, nullIndex);
        String[] parts = header.split(" ");

        if (parts.length != 2) {
            throw new ObjectException("Invalid object header format");
        }

        String type = parts[0];
        ObjectType objectType = ObjectType.fromString(type);

        switch (objectType) {
            case BLOB:
                return new GitBlob();
            case TREE:
                // TODO: Implement GitTree
                throw new ObjectException("Tree objects not yet implemented");
            case COMMIT:
                // TODO: Implement GitCommit
                throw new ObjectException("Commit objects not yet implemented");
            case TAG:
                // TODO: Implement GitTag
                throw new ObjectException("Tag objects not yet implemented");
            default:
                throw new ObjectException("Unknown object type: " + type);
        }
    }
}
