package sourcecontrol.cli.commands;

import java.util.Optional;
import java.util.concurrent.Callable;

import picocli.CommandLine.Mixin;
import picocli.CommandLine.Command;
import picocli.CommandLine.Option;
import picocli.CommandLine.Parameters;

import sourcecontrol.cli.mixins.GlobalOptionsMixin;
import sourcecontrol.cli.mixins.RepositoryMixin;
import sourcecontrol.core.objects.impl.GitBlob;
import sourcecontrol.core.repository.GitRepository;
import sourcecontrol.core.objects.GitObject;

@Command(name = "cat-file", description = "Provide content or type and size information for repository objects", mixinStandardHelpOptions = true, header = "Display information about Git objects", footer = {
        "",
        "Examples:",
        "  git-clone cat-file -p <object>  Pretty-print object content",
        "  git-clone cat-file -t <object>  Show object type",
        "  git-clone cat-file -s <object>  Show object size"
})
public class CatFileCommand implements Callable<Integer> {

    @Mixin
    private GlobalOptionsMixin globalOptions;

    @Mixin
    private RepositoryMixin repositoryMixin;

    @Parameters(index = "0", paramLabel = "<object>", description = "The object to display")
    private String objectId;

    @Option(names = { "-p", "--pretty-print" }, description = "Pretty-print the contents of the object")
    private boolean prettyPrint;

    @Option(names = { "-t", "--type" }, description = "Show the object type")
    private boolean showType;

    @Option(names = { "-s", "--size" }, description = "Show the object size")
    private boolean showSize;

    @Option(names = { "-e", "--exists" }, description = "Suppress output; exit with zero status if object exists")
    private boolean checkExists;

    @Override
    public Integer call() throws Exception {
        globalOptions.configureLogging();

        int actionCount = 0;
        if (prettyPrint)
            actionCount++;
        if (showType)
            actionCount++;
        if (showSize)
            actionCount++;
        if (checkExists)
            actionCount++;

        if (actionCount != 1) {
            System.err.println("fatal: exactly one of -p, -t, -s, or -e must be specified");
            return 1;
        }

        try {
            GitRepository repo = repositoryMixin.getRepository();
            Optional<GitObject> objOpt = repo.readObject(objectId);

            if (objOpt.isEmpty()) {
                if (!checkExists) {
                    System.err.println("fatal: Not a valid object name " + objectId);
                }
                return 1;
            }

            GitObject obj = objOpt.get();

            if (checkExists) {
                return 0;
            } else if (showType) {
                System.out.println(obj.getType().getTypeName());
            } else if (showSize) {
                System.out.println(obj.getSize());
            } else if (prettyPrint) {
                return prettyPrintObject(obj);
            }

            return 0;

        } catch (Exception e) {
            System.err.println("fatal: " + e.getMessage());
            if (globalOptions.isDebug()) {
                e.printStackTrace();
            }
            return 1;
        }
    }

    private Integer prettyPrintObject(GitObject obj) {
        switch (obj.getType()) {
            case BLOB:
                GitBlob blob = (GitBlob) obj;
                System.out.print(blob.toString());
                break;
            case TREE:
                System.err.println("fatal: tree objects not yet supported");
                return 1;
            case COMMIT:
                System.err.println("fatal: commit objects not yet supported");
                return 1;
            case TAG:
                System.err.println("fatal: tag objects not yet supported");
                return 1;
            default:
                System.err.println("fatal: unknown object type: " + obj.getType());
                return 1;
        }
        return 0;
    }
}
