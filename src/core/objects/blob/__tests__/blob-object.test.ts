import { BlobObject } from '../blob-object';
import { ObjectType } from '@/core/objects/base';
import { ObjectException } from '@/core/exceptions';

describe('BlobObject', () => {
  describe('Constructor', () => {
    it('should create an empty blob when no parameters provided', () => {
      const blob = new BlobObject();

      expect(blob.content()).toEqual(new Uint8Array());
      expect(blob.size()).toBe(0);
      expect(blob.type()).toBe(ObjectType.BLOB);
    });

    it('should create blob with provided content', () => {
      const content = new TextEncoder().encode('Hello World');
      const blob = new BlobObject(content);

      expect(blob.content()).toEqual(content);
      expect(blob.size()).toBe(11);
      expect(blob.type()).toBe(ObjectType.BLOB);
    });

    it('should create blob with content and SHA', async () => {
      const content = new TextEncoder().encode('Hello World');
      const expectedSha = '0a4d55a8d778e5022fab701977c5d840bbc486d0'; // Known SHA-1 for "Hello World"
      const blob = new BlobObject(content, expectedSha);

      expect(blob.content()).toEqual(content);
      expect(await blob.sha()).toBe(expectedSha);
    });

    it('should create a copy of the provided content array', () => {
      const content = new TextEncoder().encode('Hello World');
      const blob = new BlobObject(content);

      // Modify original array
      content[0] = 0;

      // Blob content should be unchanged
      expect(blob.content()[0]).toBe(72); // 'H' ASCII code
    });

    it('should return a copy of content, not reference', () => {
      const content = new TextEncoder().encode('Hello World');
      const blob = new BlobObject(content);

      const retrievedContent = blob.content();
      retrievedContent[0] = 0;

      // Original blob content should be unchanged
      expect(blob.content()[0]).toBe(72); // 'H' ASCII code
    });
  });

  describe('Basic Methods', () => {
    it('should return correct object type', () => {
      const blob = new BlobObject();
      expect(blob.type()).toBe(ObjectType.BLOB);
    });

    it('should return correct size for empty blob', () => {
      const blob = new BlobObject();
      expect(blob.size()).toBe(0);
    });

    it('should return correct size for non-empty blob', () => {
      const content = new TextEncoder().encode('Hello World');
      const blob = new BlobObject(content);
      expect(blob.size()).toBe(11);
    });

    it('should calculate SHA-1 hash correctly', async () => {
      const content = new TextEncoder().encode('Hello World');
      const blob = new BlobObject(content);

      const sha = await blob.sha();
      expect(sha).toBe('0a4d55a8d778e5022fab701977c5d840bbc486d0');
    });

    it('should cache SHA-1 hash after first calculation', async () => {
      const content = new TextEncoder().encode('Hello World');
      const blob = new BlobObject(content);

      const sha1 = await blob.sha();
      const sha2 = await blob.sha();

      expect(sha1).toBe(sha2);
      expect(sha1).toBe('0a4d55a8d778e5022fab701977c5d840bbc486d0');
    });

    it('should return provided SHA when given in constructor', async () => {
      const content = new TextEncoder().encode('Hello World');
      const providedSha = 'custom-sha-hash';
      const blob = new BlobObject(content, providedSha);

      const sha = await blob.sha();
      expect(sha).toBe(providedSha);
    });
  });

  describe('Serialization', () => {
    it('should serialize empty blob correctly', () => {
      const blob = new BlobObject();
      const serialized = blob.serialize();

      const expected = new TextEncoder().encode('blob 0\0');
      expect(serialized).toEqual(expected);
    });

    it('should serialize blob with content correctly', () => {
      const content = new TextEncoder().encode('Hello World');
      const blob = new BlobObject(content);
      const serialized = blob.serialize();

      const headerBytes = new TextEncoder().encode('blob 11\0');
      const expected = new Uint8Array(headerBytes.length + content.length);
      expected.set(headerBytes, 0);
      expected.set(content, headerBytes.length);

      expect(serialized).toEqual(expected);
    });

    it('should serialize binary content correctly', () => {
      const content = new Uint8Array([0, 1, 255, 128, 127]);
      const blob = new BlobObject(content);
      const serialized = blob.serialize();

      const headerBytes = new TextEncoder().encode('blob 5\0');
      const expected = new Uint8Array(headerBytes.length + content.length);
      expected.set(headerBytes, 0);
      expected.set(content, headerBytes.length);

      expect(serialized).toEqual(expected);
    });
  });

  describe('Deserialization', () => {
    it('should deserialize valid blob data correctly', async () => {
      const content = new TextEncoder().encode('Hello World');
      const serializedData = new TextEncoder().encode('blob 11\0Hello World');

      const blob = new BlobObject();
      await blob.deserialize(serializedData);

      expect(blob.content()).toEqual(content);
      expect(blob.size()).toBe(11);
      expect(blob.type()).toBe(ObjectType.BLOB);
    });

    it('should deserialize empty blob correctly', async () => {
      const serializedData = new TextEncoder().encode('blob 0\0');

      const blob = new BlobObject();
      await blob.deserialize(serializedData);

      expect(blob.content()).toEqual(new Uint8Array());
      expect(blob.size()).toBe(0);
    });

    it('should deserialize binary content correctly', async () => {
      const content = new Uint8Array([0, 1, 255, 128, 127]);
      const header = new TextEncoder().encode('blob 5\0');
      const serializedData = new Uint8Array(header.length + content.length);
      serializedData.set(header, 0);
      serializedData.set(content, header.length);

      const blob = new BlobObject();
      await blob.deserialize(serializedData);

      expect(blob.content()).toEqual(content);
      expect(blob.size()).toBe(5);
    });

    it('should calculate and cache SHA after deserialization', async () => {
      const serializedData = new TextEncoder().encode('blob 11\0Hello World');

      const blob = new BlobObject();
      await blob.deserialize(serializedData);

      const sha = await blob.sha();
      expect(sha).toBe('0a4d55a8d778e5022fab701977c5d840bbc486d0');
    });

    it('should throw ObjectException when no null terminator found', async () => {
      const invalidData = new TextEncoder().encode('blob 11 Hello World');
      const blob = new BlobObject();

      await expect(blob.deserialize(invalidData)).rejects.toThrow(ObjectException);
      await expect(blob.deserialize(invalidData)).rejects.toThrow(
        'Invalid blob object: no null terminator found'
      );
    });

    it('should throw ObjectException when size is missing', async () => {
      const invalidData = new TextEncoder().encode('blob\0Hello World');
      const blob = new BlobObject();

      await expect(blob.deserialize(invalidData)).rejects.toThrow(ObjectException);
      await expect(blob.deserialize(invalidData)).rejects.toThrow(
        'Invalid blob object: invalid size'
      );
    });

    it('should throw ObjectException when type is incorrect', async () => {
      const invalidData = new TextEncoder().encode('tree 11\0Hello World');
      const blob = new BlobObject();

      await expect(blob.deserialize(invalidData)).rejects.toThrow(ObjectException);
      await expect(blob.deserialize(invalidData)).rejects.toThrow(
        'Invalid blob object: invalid type'
      );
    });

    it('should throw ObjectException when content size mismatch', async () => {
      const invalidData = new TextEncoder().encode('blob 5\0Hello World'); // Says 5 but content is 11 bytes
      const blob = new BlobObject();

      await expect(blob.deserialize(invalidData)).rejects.toThrow(ObjectException);
      await expect(blob.deserialize(invalidData)).rejects.toThrow(
        'Content size mismatch expected: 5, got 11'
      );
    });

    it('should throw ObjectException when size is not a valid number', async () => {
      const invalidData = new TextEncoder().encode('blob abc\0Hello World');
      const blob = new BlobObject();

      await expect(blob.deserialize(invalidData)).rejects.toThrow(ObjectException);
    });

    it('should handle edge case with content larger than declared size', async () => {
      const invalidData = new TextEncoder().encode('blob 5\0Hello World Extra'); // Content longer than declared
      const blob = new BlobObject();

      await expect(blob.deserialize(invalidData)).rejects.toThrow(ObjectException);
      await expect(blob.deserialize(invalidData)).rejects.toThrow(
        'Content size mismatch expected: 5, got 17'
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle large content', async () => {
      const largeContent = new Uint8Array(10000).fill(65); // 10KB of 'A's
      const blob = new BlobObject(largeContent);

      expect(blob.size()).toBe(10000);
      expect(blob.content()).toEqual(largeContent);

      const serialized = blob.serialize();
      const expectedHeader = new TextEncoder().encode('blob 10000\0');
      expect(serialized.slice(0, expectedHeader.length)).toEqual(expectedHeader);
      expect(serialized.slice(expectedHeader.length)).toEqual(largeContent);
    });

    it('should handle UTF-8 content correctly', async () => {
      const utf8Content = new TextEncoder().encode('Hello 世界 🌍');
      const blob = new BlobObject(utf8Content);

      expect(blob.size()).toBe(utf8Content.length);
      expect(blob.content()).toEqual(utf8Content);

      // Test round-trip serialization/deserialization
      const serialized = blob.serialize();
      const newBlob = new BlobObject();
      await newBlob.deserialize(serialized);

      expect(newBlob.content()).toEqual(utf8Content);
      expect(new TextDecoder().decode(newBlob.content())).toBe('Hello 世界 🌍');
    });

    it('should handle content with null bytes', async () => {
      const contentWithNulls = new Uint8Array([72, 101, 108, 108, 111, 0, 87, 111, 114, 108, 100]); // "Hello\0World"
      const blob = new BlobObject(contentWithNulls);

      expect(blob.size()).toBe(11);
      expect(blob.content()).toEqual(contentWithNulls);

      // Test serialization handles null bytes in content correctly
      const serialized = blob.serialize();
      const newBlob = new BlobObject();
      await newBlob.deserialize(serialized);

      expect(newBlob.content()).toEqual(contentWithNulls);
    });

    it('should handle empty header edge case in deserialization', async () => {
      const invalidData = new Uint8Array([0]); // Just null terminator
      const blob = new BlobObject();

      await expect(blob.deserialize(invalidData)).rejects.toThrow(ObjectException);
    });

    it('should handle malformed header in deserialization', async () => {
      const invalidData = new TextEncoder().encode('blob\0'); // Missing size
      const blob = new BlobObject();

      await expect(blob.deserialize(invalidData)).rejects.toThrow(ObjectException);
      await expect(blob.deserialize(invalidData)).rejects.toThrow(
        'Invalid blob object: invalid size'
      );
    });
  });

  describe('Integration Tests', () => {
    it('should create blob, serialize, deserialize and maintain content integrity', async () => {
      const originalContent = new TextEncoder().encode('Test content for round-trip');
      const originalBlob = new BlobObject(originalContent);

      // Serialize
      const serialized = originalBlob.serialize();

      // Deserialize into new blob
      const newBlob = new BlobObject();
      await newBlob.deserialize(serialized);

      // Verify everything matches
      expect(newBlob.content()).toEqual(originalContent);
      expect(newBlob.size()).toBe(originalBlob.size());
      expect(newBlob.type()).toBe(originalBlob.type());
      expect(await newBlob.sha()).toBe(await originalBlob.sha());
    });

    it('should handle multiple serialization/deserialization cycles', async () => {
      const originalContent = new TextEncoder().encode('Cycle test content');
      let blob = new BlobObject(originalContent);

      // Perform multiple cycles
      for (let i = 0; i < 3; i++) {
        const serialized = blob.serialize();
        const newBlob = new BlobObject();
        await newBlob.deserialize(serialized);
        blob = newBlob;
      }

      // Content should remain intact
      expect(blob.content()).toEqual(originalContent);
      expect(blob.size()).toBe(originalContent.length);
    });
  });
});
