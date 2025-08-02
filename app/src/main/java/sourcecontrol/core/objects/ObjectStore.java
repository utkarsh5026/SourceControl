package sourcecontrol.core.objects;

import java.util.Optional;
import sourcecontrol.exceptions.ObjectException;

public interface ObjectStore {
    /**
     * Write an object to storage
     * 
     * @param object The object to store
     * @return The SHA-1 hash of the stored object
     */
    String writeObject(GitObject object) throws ObjectException;

    /**
     * Read an object from storage
     * 
     * @param sha The SHA-1 hash of the object
     * @return The object if found, empty otherwise
     */
    Optional<GitObject> readObject(String sha) throws ObjectException;

    /**
     * Check if an object exists in storage
     * 
     * @param sha The SHA-1 hash of the object
     * @return true if object exists, false otherwise
     */
    boolean hasObject(String sha);

    /**
     * Initialize the object store
     * 
     * @param gitDir The .git directory path
     */
    void initialize(java.nio.file.Path gitDir) throws ObjectException;
}