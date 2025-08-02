package sourcecontrol.core.objects.impl;

import java.nio.charset.StandardCharsets;
import sourcecontrol.core.objects.GitObject;
import sourcecontrol.core.objects.ObjectType;
import sourcecontrol.exceptions.ObjectException;
import sourcecontrol.utils.crypto.HashUtils;

// @formatter:off
/**
 * BLOB (Binary Large Object) - Represents the content of a file.
 * Stores the actual file data without any metadata like filename or
 * permissions.
 * Each unique file content gets its own blob object, identified by a SHA-1
 * hash.
 * 
 * Visual representation of serialized format:
 * ┌─────────────────────────────────────────────────────┐
 * │ "blob" │ SPACE │ size │ NULL │ content bytes...     │
 * └─────────────────────────────────────────────────────┘
 * 
 * Example for "Hello World" content:
 * ┌──────────────────────────────────────────────────────┐
 * │ "blob 11\0Hello World"                               │
 * │ ^     ^  ^                                           │
 * │ │     │  └─ null terminator (0x00)                   │
 * │ │     └─ size as string                              │
 * │ └─ object type                                       │
 * └──────────────────────────────────────────────────────┘
 * 
 */
// @formatter:on
public final class GitBlob implements GitObject {
    private byte[] content;
    private String cachedSha;

    public GitBlob() {
        this.content = new byte[0];
    }

    public GitBlob(byte[] content) {
        this.content = content != null ? content.clone() : new byte[0];
    }

    public GitBlob(String content) {
        this.content = content.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    public ObjectType getType() {
        return ObjectType.BLOB;
    }

    @Override
    public byte[] getContent() {
        return content.clone();
    }

    @Override
    public long getSize() {
        return content.length;
    }

    @Override
    public String getSha() {
        if (cachedSha == null) {
            try {
                byte[] serialized = serialize();
                cachedSha = HashUtils.sha1Hex(serialized);
            } catch (ObjectException e) {
                throw new RuntimeException("Failed to calculate SHA", e);
            }
        }
        return cachedSha;
    }

    @Override
    public byte[] serialize() throws ObjectException {
        try {
            String typeName = getType().getTypeName();
            String header = typeName + " " + content.length + "\0";
            byte[] headerBytes = header.getBytes(StandardCharsets.UTF_8);

            byte[] result = new byte[headerBytes.length + content.length];
            System.arraycopy(headerBytes, 0, result, 0, headerBytes.length); // Copy header to result
            System.arraycopy(content, 0, result, headerBytes.length, content.length); // Copy content to result

            return result;
        } catch (Exception e) {
            throw new ObjectException("Failed to serialize blob", e);
        }
    }

    @Override
    public void deserialize(byte[] data) throws ObjectException {
        try {
            int nullIndex = -1;
            for (int i = 0; i < data.length; i++) {
                if (data[i] == 0) {
                    nullIndex = i;
                    break;
                }
            }

            if (nullIndex == -1) {
                throw new ObjectException("Invalid blob format: no null terminator found");
            }

            String header = new String(data, 0, nullIndex, StandardCharsets.UTF_8);
            String[] parts = header.split(" ");

            if (parts.length != 2) {
                throw new ObjectException("Invalid blob header format");
            }

            String type = parts[0];
            int size = Integer.parseInt(parts[1]);

            if (!type.equals("blob")) {
                throw new ObjectException("Expected blob type, got: " + type);
            }

            int contentLength = data.length - nullIndex - 1;
            if (contentLength != size) {
                throw new ObjectException("Content size mismatch: expected " + size + ", got " + contentLength);
            }

            this.content = new byte[contentLength];
            System.arraycopy(data, nullIndex + 1, this.content, 0, contentLength);
            invalidateCache();
        } catch (NumberFormatException e) {
            throw new ObjectException("Invalid size in blob header", e);
        } catch (Exception e) {
            throw new ObjectException("Failed to deserialize blob", e);
        }
    }

    @Override
    public String toString() {
        return "GitBlob{sha=" + getSha() + ", size=" + getSize() + "}";
    }

    public void setContent(byte[] content) {
        this.content = content != null ? content.clone() : new byte[0];
        invalidateCache();
    }

    private void invalidateCache() {
        this.cachedSha = null;
    }

}
