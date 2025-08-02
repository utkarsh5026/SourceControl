package sourcecontrol.utils.crypto;

import java.util.zip.Deflater;
import java.util.zip.Inflater;
import java.util.zip.DataFormatException;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

/**
 * Utility class for compressing and decompressing data using Deflater and
 * Inflater classes.
 */
public class CompressionUtils {

    /**
     * Compresses the given byte array using the DEFLATE compression algorithm.
     * This method uses Java's built-in Deflater class which implements the same
     * compression algorithm used in ZIP files and Git objects.
     */
    public static byte[] compress(byte[] data) throws IOException {
        Deflater deflater = new Deflater();
        deflater.setInput(data);
        deflater.finish();

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream(data.length);
        byte[] buffer = new byte[1024];

        while (!deflater.finished()) {
            int count = deflater.deflate(buffer);
            outputStream.write(buffer, 0, count);
        }

        deflater.end();
        return outputStream.toByteArray();
    }

    /**
     * Decompresses the given byte array that was previously compressed using
     * the DEFLATE compression algorithm. This method uses Java's built-in
     * Inflater class to restore the original uncompressed data.
     */
    public static byte[] decompress(byte[] compressedData) throws IOException, DataFormatException {
        Inflater inflater = new Inflater();
        inflater.setInput(compressedData);

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream(compressedData.length);
        byte[] buffer = new byte[1024];

        while (!inflater.finished()) {
            int count = inflater.inflate(buffer);
            outputStream.write(buffer, 0, count);
        }

        inflater.end();
        return outputStream.toByteArray();
    }
}