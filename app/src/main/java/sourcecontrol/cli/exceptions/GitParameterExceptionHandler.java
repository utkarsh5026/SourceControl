package sourcecontrol.cli.exceptions;

import picocli.CommandLine;
import picocli.CommandLine.IParameterExceptionHandler;
import picocli.CommandLine.ParameterException;

/**
 * Custom exception handler for parameter exceptions
 */
public class GitParameterExceptionHandler implements IParameterExceptionHandler {

    @Override
    public int handleParseException(ParameterException ex, String[] args) {
        CommandLine cmd = ex.getCommandLine();

        cmd.getErr().println("error: " + ex.getMessage());

        cmd.getErr().println();
        cmd.usage(cmd.getErr());

        return 2; // Return code 2 for parameter errors (following Git convention)
    }
}
