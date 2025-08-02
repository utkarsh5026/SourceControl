package sourcecontrol.core.objects;

import java.nio.charset.StandardCharsets;

import sourcecontrol.exceptions.ObjectException;

public interface GitObject {
    /**
     * Get the object type (blob, tree, commit, tag)
     */
    ObjectType getType();

    /**
     * Get the raw object content (without header)
     */
    byte[] getContent();

    /**
     * Get the SHA-1 hash of this object
     */
    String getSha();

    /**
     * Get the size of the object content in bytes
     */
    long getSize();

    /**
     * Deserialize object from raw data
     */
    void deserialize(byte[] data) throws ObjectException;

    /**
     * Serialize object to byte array for storage (with header)
     * Default implementation that can be used by all Git objects
     */
    default byte[] serialize() throws ObjectException {
        try {
            byte[] content = getContent();
            String header = getType().getTypeName() + " " + content.length + "\0";
            byte[] headerBytes = header.getBytes(StandardCharsets.UTF_8);

            byte[] result = new byte[headerBytes.length + content.length];
            System.arraycopy(headerBytes, 0, result, 0, headerBytes.length);
            System.arraycopy(content, 0, result, headerBytes.length, content.length);

            return result;
        } catch (Exception e) {
            throw new ObjectException("Failed to serialize " + getType().getTypeName().toLowerCase(), e);
        }
    }
}