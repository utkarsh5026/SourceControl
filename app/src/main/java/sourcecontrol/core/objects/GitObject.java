package sourcecontrol.core.objects;

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
     * Serialize object to byte array for storage (with header)
     */
    byte[] serialize() throws ObjectException;

    /**
     * Get the size of the object content in bytes
     */
    long getSize();

    /**
     * Deserialize object from raw data
     */
    void deserialize(byte[] data) throws ObjectException;
}