package sourcecontrol;

import picocli.CommandLine;
import picocli.CommandLine.Command;
import picocli.CommandLine.Mixin;
import picocli.CommandLine.Option;

import sourcecontrol.cli.commands.*;
import sourcecontrol.cli.mixins.GlobalOptionsMixin;
import sourcecontrol.cli.mixins.VersionProvider;
import sourcecontrol.cli.exceptions.GitExecutionExceptionHandler;
import sourcecontrol.cli.exceptions.GitParameterExceptionHandler;

@Command(name = "source-control", description = "A production-grade Git implementation from scratch in Java", version = "Source Control 1.0.0-SNAPSHOT", versionProvider = VersionProvider.class, mixinStandardHelpOptions = true, subcommands = {
                HashObjectCommand.class,
                CommandLine.HelpCommand.class,
                CatFileCommand.class
}, header = {
                " ╔═══════════════════════════════════════════════════════════╗",
                " ║                                                           ║",
                " ║    ___  ___  _   _ ____   ___ _____                       ║",
                " ║    / __|/ _ \\| | | |  _ \\ / __| ____|                   ║",
                " ║    \\__ \\ | | | | | | |_) | |  |  _|                     ║",
                " ║    |___/\\_| |_|_| |_|  _ <| |__| |___                    ║",
                " ║                     |_| \\_\\\\___/_____|                 ║",
                " ║                                                           ║",
                " ║   ___ ___  _   _ _____ ____   ___  _                      ║",
                " ║  / __/ _ \\| \\ | |_   _|  _ \\ / _ \\| |                 ║",
                " ║ | (_| | | |  \\| | | | | |_) | | | | |                    ║",
                " ║  \\___\\_| |_|_|\\_| |_| |  _ <\\_| |_|_|____|            ║",
                " ║                        @|bold,blue |_| \\_\\___/_____|    ║",
                " ║                                                           ║",
                " ╚═══════════════════════════════════════════════════════════╝",
                "🚀 A production-grade Git implementation in Java 🚀",
                ""
}, footer = {
                "",
                "Examples:",
                "  source-control init my-repo          Initialize a new repository",
                "  source-control hash-object file.txt  Calculate object hash",
                "  source-control --version             Show version information",
                "",
                "For more information, see: https://github.com/utkarsh5026/SourceControl"
})
public class SourceControl implements Runnable {
        @Mixin
        private GlobalOptionsMixin globalOptions;

        @Option(names = {
                        "-C" }, paramLabel = "<path>", description = "Run as if git was started in <path> instead of the current working directory")
        private String changeDirectory;

        public static void main(String[] args) {
                CommandLine commandLine = new CommandLine(new SourceControl())
                                .setColorScheme(CommandLine.Help.defaultColorScheme(CommandLine.Help.Ansi.AUTO))
                                .setExecutionExceptionHandler(new GitExecutionExceptionHandler())
                                .setParameterExceptionHandler(new GitParameterExceptionHandler())
                                .setUsageHelpAutoWidth(true);

                commandLine.setAbbreviatedSubcommandsAllowed(true);
                commandLine.setAbbreviatedOptionsAllowed(true);

                int exitCode = commandLine.execute(args);
                System.exit(exitCode);
        }

        @Override
        public void run() {
                // When no subcommand is specified, show help
                CommandLine.usage(this, System.out);
        }
}
