package sourcecontrol.cli.mixins;

import sourcecontrol.core.repository.GitRepository;
import sourcecontrol.exceptions.RepositoryException;
import picocli.CommandLine.Option;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Optional;

/**
 * Mixin for commands that need to interact with Git repositories.
 * 
 * This mixin provides options for specifying the repository path and working
 * tree, and automatically finds the repository in the current working directory
 * or specified path.
 */
public class RepositoryMixin {

    @Option(names = {
            "--git-dir" }, paramLabel = "<path>", description = "Set the path to the repository (\".git\" directory)")
    private String gitDir;

    @Option(names = { "--work-tree" }, paramLabel = "<path>", description = "Set the path to the working tree")
    private String workTree;

    /**
     * Find or validate the repository
     */
    public GitRepository getRepository() throws RepositoryException {
        Path searchPath = workTree != null ? Paths.get(workTree) : Paths.get(".");

        Optional<GitRepository> repo = GitRepository.findRepository(searchPath);
        if (repo.isEmpty()) {
            throw new RepositoryException(
                    "fatal: not a git repository (or any of the parent directories): .git");
        }

        return repo.get();
    }

    /**
     * Check if we're in a repository (for commands that optionally need one)
     */
    public Optional<GitRepository> findRepository() {
        try {
            return Optional.of(getRepository());
        } catch (RepositoryException e) {
            return Optional.empty();
        }
    }
}
