package sourcecontrol.core.repository;

import java.nio.file.Path;
import java.util.Optional;

import sourcecontrol.core.objects.GitObject;
import sourcecontrol.core.objects.ObjectStore;
import sourcecontrol.exceptions.RepositoryException;

public interface Repository {
    /**
     * Initialize a new repository at the given path
     */
    void init(Path path) throws RepositoryException;

    /**
     * Get the working directory path
     */
    Path getWorkingDirectory();

    /**
     * Get the .git directory path
     */
    Path getGitDirectory();

    /**
     * Get the object store
     */
    ObjectStore getObjectStore();

    /**
     * Read an object from the repository
     */
    Optional<GitObject> readObject(String sha) throws RepositoryException;

    /**
     * Write an object to the repository
     */
    String writeObject(GitObject object) throws RepositoryException;

    /**
     * Check if repository exists at path
     */
    static boolean exists(Path path) {
        return path.resolve(".git").toFile().exists();
    }
}