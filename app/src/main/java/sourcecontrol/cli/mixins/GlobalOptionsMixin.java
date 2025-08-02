package sourcecontrol.cli.mixins;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import org.slf4j.LoggerFactory;
import picocli.CommandLine.Option;

/**
 * Mixin class for handling global options in the command line interface.
 * This class provides options for verbose, quiet, debug, and no-color logging.
 */
public class GlobalOptionsMixin {

    @Option(names = { "-v", "--verbose" }, description = "Enable verbose output")
    private boolean verbose;

    @Option(names = { "-q", "--quiet" }, description = "Suppress all output except errors")
    private boolean quiet;

    @Option(names = { "--debug" }, description = "Enable debug output (implies --verbose)")
    private boolean debug;

    @Option(names = { "--no-color" }, description = "Disable colored output")
    private boolean noColor;

    /**
     * Configures the logging level based on the provided options.
     */
    public void configureLogging() {
        Logger rootLogger = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);

        if (debug) {
            rootLogger.setLevel(Level.DEBUG);
        } else if (verbose) {
            rootLogger.setLevel(Level.INFO);
        } else if (quiet) {
            rootLogger.setLevel(Level.ERROR);
        } else {
            rootLogger.setLevel(Level.WARN);
        }
    }

    public boolean isVerbose() {
        return verbose || debug;
    }

    public boolean isQuiet() {
        return quiet;
    }

    public boolean isDebug() {
        return debug;
    }

    public boolean isColorEnabled() {
        return !noColor;
    }
}