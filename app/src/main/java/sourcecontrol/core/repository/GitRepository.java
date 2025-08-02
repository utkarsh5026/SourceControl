package sourcecontrol.core.repository;

import java.nio.file.Path;
import java.io.IOException;
import java.util.Optional;

import sourcecontrol.core.objects.GitObject;
import sourcecontrol.core.objects.ObjectStore;
import sourcecontrol.core.objects.impl.FileObjectStore;
import sourcecontrol.exceptions.ObjectException;
import sourcecontrol.exceptions.RepositoryException;
import sourcecontrol.utils.io.FileUtils;

public final class GitRepository implements Repository {
    private Path workingDirectory;
    private Path gitDirectory;
    private ObjectStore objectStore;

    private static final String DEFAULT_GIT_DIR = ".git";
    private static final String DEFAULT_OBJECTS_DIR = "objects";
    private static final String DEFAULT_REFS_DIR = "refs";
    private static final String DEFAULT_HEAD_FILE = "HEAD";
    private static final String DEFAULT_DESCRIPTION_FILE = "description";
    private static final String DEFAULT_CONFIG_FILE = "config";

    public GitRepository() {
        this.objectStore = new FileObjectStore();
    }

    @Override
    public void init(Path path) throws RepositoryException {
        try {
            this.workingDirectory = path.toAbsolutePath();
            this.gitDirectory = workingDirectory.resolve(DEFAULT_GIT_DIR);

            if (Repository.exists(workingDirectory)) {
                throw new RepositoryException("Already a git repository: " + workingDirectory);
            }

            FileUtils.createDirectories(gitDirectory);
            FileUtils.createDirectories(gitDirectory.resolve(DEFAULT_OBJECTS_DIR));
            FileUtils.createDirectories(gitDirectory.resolve(DEFAULT_REFS_DIR));

            FileUtils.createDirectories(gitDirectory.resolve(DEFAULT_REFS_DIR).resolve("heads"));
            FileUtils.createDirectories(gitDirectory.resolve(DEFAULT_REFS_DIR).resolve("tags"));

            objectStore.initialize(gitDirectory);
            createInitialFiles();

        } catch (IOException | ObjectException e) {
            throw new RepositoryException("Failed to initialize repository", e);
        }
    }

    @Override
    public Path getWorkingDirectory() {
        return workingDirectory;
    }

    @Override
    public Path getGitDirectory() {
        return gitDirectory;
    }

    @Override
    public ObjectStore getObjectStore() {
        return objectStore;
    }

    @Override
    public Optional<GitObject> readObject(String sha) throws RepositoryException {
        try {
            return objectStore.readObject(sha);
        } catch (Exception e) {
            throw new RepositoryException("Failed to read object: " + sha, e);
        }
    }

    @Override
    public String writeObject(GitObject object) throws RepositoryException {
        try {
            return objectStore.writeObject(object);
        } catch (Exception e) {
            throw new RepositoryException("Failed to write object", e);
        }
    }

    /**
     * Find repository by walking up the directory tree from current path
     */
    public static Optional<GitRepository> findRepository(Path startPath) {
        Path current = startPath.toAbsolutePath();

        while (current != null) {
            if (Repository.exists(current)) {
                GitRepository repo = new GitRepository();
                repo.workingDirectory = current;
                repo.gitDirectory = current.resolve(".git");
                try {
                    repo.objectStore.initialize(repo.gitDirectory);
                } catch (Exception e) {
                    return Optional.empty();
                }
                return Optional.of(repo);
            }
            current = current.getParent();
        }

        return Optional.empty();
    }

    private void createInitialFiles() throws IOException {
        String headContent = "ref: refs/heads/master\n";
        FileUtils.createFile(gitDirectory.resolve(DEFAULT_HEAD_FILE), headContent.getBytes());

        String description = "Unnamed repository; edit this file 'description' to name the repository.\n";
        FileUtils.createFile(gitDirectory.resolve(DEFAULT_DESCRIPTION_FILE), description.getBytes());

        String config = "[core]\n" +
                "    repositoryformatversion = 0\n" +
                "    filemode = false\n" +
                "    bare = false\n";
        FileUtils.createFile(gitDirectory.resolve(DEFAULT_CONFIG_FILE), config.getBytes());
    }
}
