package sourcecontrol.cli.commands;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.Callable;
import java.nio.file.Paths;

import picocli.CommandLine.Mixin;
import picocli.CommandLine.Command;
import picocli.CommandLine.Option;
import picocli.CommandLine.Parameters;

import sourcecontrol.cli.mixins.GlobalOptionsMixin;
import sourcecontrol.cli.mixins.RepositoryMixin;
import sourcecontrol.core.objects.impl.GitBlob;
import sourcecontrol.core.repository.GitRepository;
import sourcecontrol.utils.io.FileUtils;

@Command(name = "hash-object", description = "Compute object ID and optionally creates a blob from a file", mixinStandardHelpOptions = true, header = "Hash object files and optionally store them", footer = {
        "",
        "Examples:",
        "  git-clone hash-object file.txt         Calculate hash without storing",
        "  git-clone hash-object -w file.txt      Calculate hash and store in repository",
        "  git-clone hash-object --stdin          Read from standard input",
        "  git-clone hash-object -t blob file.txt Explicitly specify object type"
})
public class HashObjectCommand implements Callable<Integer> {

    @Mixin
    private GlobalOptionsMixin globalOptions;

    @Mixin
    private RepositoryMixin repositoryMixin;

    @Parameters(paramLabel = "<file>", description = "Files to hash", arity = "0..*")
    private List<String> files;

    @Option(names = { "-w", "--write" }, description = "Actually write the object into the database")
    private boolean write;

    @Option(names = { "-t",
            "--type" }, paramLabel = "<type>", description = "Specify the type of object (default: ${DEFAULT-VALUE})", defaultValue = "blob")
    private String type;

    @Option(names = { "--stdin" }, description = "Read object from standard input")
    private boolean stdin;

    @Option(names = { "--literally" }, description = "Allow potentially corrupt objects")
    private boolean literally;

    @Override
    public Integer call() throws Exception {
        globalOptions.configureLogging();

        boolean noInput = !stdin && (files == null || files.isEmpty());
        if (noInput) {
            System.err.println("fatal: You must specify at least one file or use --stdin");
            return 1;
        }

        if (!type.equals("blob")) {
            System.err.println("fatal: Currently only 'blob' type is supported");
            return 1;
        }

        Optional<GitRepository> repoOpt = Optional.empty();
        if (write) {
            try {
                repoOpt = Optional.of(repositoryMixin.getRepository());
            } catch (Exception e) {
                System.err.println("fatal: " + e.getMessage());
                return 1;
            }
        }

        try {
            if (stdin) {
                return hashStdin(repoOpt);
            } else {
                return hashFiles(files, repoOpt);
            }
        } catch (Exception e) {
            System.err.println("error: " + e.getMessage());
            if (globalOptions.isDebug()) {
                e.printStackTrace();
            }
            return 1;
        }
    }

    private Integer hashStdin(Optional<GitRepository> repo) throws Exception {
        // Read from stdin
        byte[] content = System.in.readAllBytes();
        return hashContent(content, repo);
    }

    private Integer hashFiles(List<String> fileList, Optional<GitRepository> repo) throws Exception {
        for (String fileName : fileList) {
            try {
                byte[] content = FileUtils.readFile(Paths.get(fileName));
                int result = hashContent(content, repo);
                if (result != 0) {
                    return result;
                }
            } catch (Exception e) {
                System.err.println("error: cannot read '" + fileName + "': " + e.getMessage());
                return 1;
            }
        }
        return 0;
    }

    private Integer hashContent(byte[] content, Optional<GitRepository> repo) throws Exception {
        GitBlob blob = new GitBlob(content);
        String hash = blob.getSha();

        if (write && repo.isPresent()) {
            repo.get().writeObject(blob);
            if (globalOptions.isVerbose()) {
                System.err.println("Stored object " + hash);
            }
        }

        System.out.println(hash);
        return 0;
    }
}
