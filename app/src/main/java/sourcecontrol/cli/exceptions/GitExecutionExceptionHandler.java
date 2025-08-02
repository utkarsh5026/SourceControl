package sourcecontrol.cli.exceptions;

import sourcecontrol.exceptions.GitException;
import picocli.CommandLine;
import picocli.CommandLine.IExecutionExceptionHandler;

/**
 * Custom exception handler for execution exceptions
 */
public class GitExecutionExceptionHandler implements IExecutionExceptionHandler {

    @Override
    public int handleExecutionException(
            Exception ex,
            CommandLine commandLine,
            CommandLine.ParseResult parseResult) {

        if (ex instanceof GitException) {
            commandLine.getErr().println("fatal: " + ex.getMessage());
            return 1;
        }

        commandLine.getErr().println("error: " + ex.getMessage());
        if (parseResult.hasMatchedOption("--debug")) {
            ex.printStackTrace(commandLine.getErr());
        }

        return 1;
    }
}