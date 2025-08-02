package sourcecontrol.utils.io;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Utility class for file operations.
 */
public class FileUtils {

    /**
     * Creates directories for the given path if they do not exist.
     */
    public static void createDirectories(Path path) throws IOException {
        if (!Files.exists(path)) {
            Files.createDirectories(path);
        }
    }

    /**
     * Creates a file at the given path with the given content.
     */
    public static void createFile(Path path, byte[] content) throws IOException {
        createDirectories(path.getParent());
        Files.write(path, content);
    }

    /**
     * Reads the content of a file as a byte array.
     */
    public static byte[] readFile(Path path) throws IOException {
        return Files.readAllBytes(path);
    }

    /**
     * Checks if a file exists at the given path.
     */
    public static boolean exists(Path path) {
        return Files.exists(path);
    }

    /**
     * Checks if a path is a directory.
     */
    public static boolean isDirectory(Path path) {
        return Files.isDirectory(path);
    }

    /**
     * Checks if a path is a file.
     */
    public static boolean isFile(Path path) {
        return Files.isRegularFile(path);
    }
}