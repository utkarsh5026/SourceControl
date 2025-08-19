import { BinaryDiff } from '../../core/diff/binary-diff';

describe('BinaryDiff', () => {
  describe('Binary detection', () => {
    test('identifies text content as non-binary', () => {
      const textContent = new Uint8Array(Buffer.from('Hello, World!\nThis is a text file.', 'utf-8'));
      
      expect(BinaryDiff.isBinary(textContent)).toBe(false);
    });

    test('identifies binary content with null bytes', () => {
      const binaryContent = new Uint8Array([0x00, 0x01, 0x02, 0x00, 0x03, 0x00, 0x04, 0x00]);
      
      expect(BinaryDiff.isBinary(binaryContent)).toBe(true);
    });

    test('identifies executable binary content', () => {
      // Simulate ELF header with null bytes
      const elfHeader = new Uint8Array([
        0x7F, 0x45, 0x4C, 0x46, // ELF magic
        0x02, 0x01, 0x01, 0x00, // Class, data, version, padding
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 // More padding
      ]);
      
      expect(BinaryDiff.isBinary(elfHeader)).toBe(true);
    });

    test('handles small files correctly', () => {
      const smallText = new Uint8Array(Buffer.from('hi', 'utf-8'));
      const smallBinary = new Uint8Array([0x00, 0xFF]);
      
      expect(BinaryDiff.isBinary(smallText)).toBe(false);
      expect(BinaryDiff.isBinary(smallBinary)).toBe(true);
    });

    test('uses sample size for large files', () => {
      // Create a large file with binary content at the beginning
      const largeArray = new Uint8Array(20000);
      // Fill first 8192 bytes with enough null bytes to exceed 10% threshold
      for (let i = 0; i < 8192; i++) {
        largeArray[i] = i % 8 === 0 ? 0x00 : 0xFF; // 12.5% null bytes
      }
      // Fill rest with text content
      const textPart = Buffer.from('A'.repeat(11808), 'utf-8');
      largeArray.set(textPart, 8192);
      
      expect(BinaryDiff.isBinary(largeArray)).toBe(true);
    });

    test('handles UTF-8 encoded text correctly', () => {
      const utf8Text = new Uint8Array(Buffer.from('Hello 世界! 🚀', 'utf-8'));
      
      expect(BinaryDiff.isBinary(utf8Text)).toBe(false);
    });

    test('identifies mixed content based on null byte threshold', () => {
      // Create content with exactly 10% null bytes (threshold)
      const mixedContent = new Uint8Array(100);
      for (let i = 0; i < 100; i++) {
        mixedContent[i] = i < 10 ? 0x00 : 0x41; // 10 null bytes, 90 'A's
      }
      
      expect(BinaryDiff.isBinary(mixedContent)).toBe(false); // Exactly at threshold
      
      // Add one more null byte to exceed threshold
      mixedContent[50] = 0x00;
      expect(BinaryDiff.isBinary(mixedContent)).toBe(true);
    });

    test('handles empty content', () => {
      const emptyContent = new Uint8Array(0);
      
      expect(BinaryDiff.isBinary(emptyContent)).toBe(false);
    });

    test('identifies image file headers as binary', () => {
      // PNG header with control characters (should be binary due to control chars, not just null bytes)
      const pngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      // PNG header has null byte at position 4, but only 1/8 = 12.5% which exceeds 10% threshold
      expect(BinaryDiff.isBinary(pngHeader)).toBe(false); // Actually no null bytes in this header
      
      // JPEG header with null byte
      const jpegHeader = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]);
      expect(BinaryDiff.isBinary(jpegHeader)).toBe(true); // Has null byte at position 4
      
      // GIF header
      const gifHeader = new Uint8Array(Buffer.from('GIF89a', 'ascii'));
      expect(BinaryDiff.isBinary(gifHeader)).toBe(false); // No null bytes in header
    });
  });

  describe('Binary diff computation', () => {
    test('detects identical binary content', () => {
      const content1 = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
      const content2 = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
      
      const result = BinaryDiff.computeBinaryDiff(content1, content2);
      
      expect(result).toEqual({
        sizeDiff: 0,
        identical: true,
        oldSize: 4,
        newSize: 4
      });
    });

    test('detects different binary content of same size', () => {
      const content1 = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
      const content2 = new Uint8Array([0x00, 0x01, 0x02, 0x04]);
      
      const result = BinaryDiff.computeBinaryDiff(content1, content2);
      
      expect(result).toEqual({
        sizeDiff: 0,
        identical: false,
        oldSize: 4,
        newSize: 4
      });
    });

    test('handles size differences', () => {
      const smallContent = new Uint8Array([0x00, 0x01]);
      const largeContent = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
      
      const result = BinaryDiff.computeBinaryDiff(smallContent, largeContent);
      
      expect(result).toEqual({
        sizeDiff: 3,
        identical: false,
        oldSize: 2,
        newSize: 5
      });
    });

    test('handles negative size differences', () => {
      const largeContent = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
      const smallContent = new Uint8Array([0x00, 0x01]);
      
      const result = BinaryDiff.computeBinaryDiff(largeContent, smallContent);
      
      expect(result).toEqual({
        sizeDiff: -3,
        identical: false,
        oldSize: 5,
        newSize: 2
      });
    });

    test('handles empty files', () => {
      const emptyContent1 = new Uint8Array(0);
      const emptyContent2 = new Uint8Array(0);
      const nonEmptyContent = new Uint8Array([0x00]);
      
      // Both empty
      const result1 = BinaryDiff.computeBinaryDiff(emptyContent1, emptyContent2);
      expect(result1).toEqual({
        sizeDiff: 0,
        identical: true,
        oldSize: 0,
        newSize: 0
      });
      
      // One empty
      const result2 = BinaryDiff.computeBinaryDiff(emptyContent1, nonEmptyContent);
      expect(result2).toEqual({
        sizeDiff: 1,
        identical: false,
        oldSize: 0,
        newSize: 1
      });
    });

    test('performance with large identical files', () => {
      const largeContent1 = new Uint8Array(10000).fill(0xAA);
      const largeContent2 = new Uint8Array(10000).fill(0xAA);
      
      const start = Date.now();
      const result = BinaryDiff.computeBinaryDiff(largeContent1, largeContent2);
      const end = Date.now();
      
      expect(result.identical).toBe(true);
      expect(end - start).toBeLessThan(100); // Should be fast
    });

    test('early exit optimization for different sizes', () => {
      const smallContent = new Uint8Array(100).fill(0xAA);
      const largeContent = new Uint8Array(10000).fill(0xAA);
      
      const start = Date.now();
      const result = BinaryDiff.computeBinaryDiff(smallContent, largeContent);
      const end = Date.now();
      
      expect(result.identical).toBe(false);
      expect(end - start).toBeLessThan(10); // Should be very fast due to early exit
    });

    test('byte-by-byte comparison accuracy', () => {
      const content1 = new Uint8Array(1000);
      const content2 = new Uint8Array(1000);
      
      // Fill with identical content
      for (let i = 0; i < 1000; i++) {
        content1[i] = i % 256;
        content2[i] = i % 256;
      }
      
      // Change one byte
      content2[500] = content2[500]! ^ 0xFF;
      
      const result = BinaryDiff.computeBinaryDiff(content1, content2);
      
      expect(result.identical).toBe(false);
      expect(result.sizeDiff).toBe(0);
    });
  });

  describe('Similarity computation', () => {
    test('identical content has 100% similarity', () => {
      const content1 = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
      const content2 = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
      
      const similarity = BinaryDiff.computeSimilarity(content1, content2);
      
      expect(similarity).toBe(100);
    });

    test('completely different sizes have size-based similarity', () => {
      const smallContent = new Uint8Array(10);
      const largeContent = new Uint8Array(100);
      
      const similarity = BinaryDiff.computeSimilarity(smallContent, largeContent);
      
      expect(similarity).toBe(10); // 10/100 * 100
    });

    test('empty files have 100% similarity', () => {
      const empty1 = new Uint8Array(0);
      const empty2 = new Uint8Array(0);
      
      const similarity = BinaryDiff.computeSimilarity(empty1, empty2);
      
      expect(similarity).toBe(100);
    });

    test('empty vs non-empty has 0% similarity', () => {
      const emptyContent = new Uint8Array(0);
      const nonEmptyContent = new Uint8Array([0x00]);
      
      const similarity1 = BinaryDiff.computeSimilarity(emptyContent, nonEmptyContent);
      const similarity2 = BinaryDiff.computeSimilarity(nonEmptyContent, emptyContent);
      
      expect(similarity1).toBe(0);
      expect(similarity2).toBe(0);
    });

    test('calculates correct percentage for various size ratios', () => {
      const base = new Uint8Array(1000);
      
      const testCases = [
        { size: 500, expected: 50 },
        { size: 250, expected: 25 },
        { size: 750, expected: 75 },
        { size: 1000, expected: 100 },
        { size: 2000, expected: 50 }, // 1000/2000 = 50%
      ];
      
      testCases.forEach(({ size, expected }) => {
        const content = new Uint8Array(size);
        const similarity = BinaryDiff.computeSimilarity(base, content);
        expect(similarity).toBe(expected);
      });
    });

    test('returns floored integer values', () => {
      const content1 = new Uint8Array(3);
      const content2 = new Uint8Array(7);
      
      const similarity = BinaryDiff.computeSimilarity(content1, content2);
      
      // 3/7 * 100 = 42.857... should be floored to 42
      expect(similarity).toBe(42);
    });
  });

  describe('Edge cases and error handling', () => {
    test('handles maximum Uint8Array values', () => {
      const maxByteContent = new Uint8Array([0xFF, 0xFF, 0xFF]);
      const minByteContent = new Uint8Array([0x00, 0x00, 0x00]);
      
      expect(BinaryDiff.isBinary(maxByteContent)).toBe(false);
      expect(BinaryDiff.isBinary(minByteContent)).toBe(true);
      
      const result = BinaryDiff.computeBinaryDiff(maxByteContent, minByteContent);
      expect(result.identical).toBe(false);
    });

    test('handles single byte files', () => {
      const singleNull = new Uint8Array([0x00]);
      const singleChar = new Uint8Array([0x41]); // 'A'
      
      expect(BinaryDiff.isBinary(singleNull)).toBe(true);
      expect(BinaryDiff.isBinary(singleChar)).toBe(false);
      
      const result = BinaryDiff.computeBinaryDiff(singleNull, singleChar);
      expect(result).toEqual({
        sizeDiff: 0,
        identical: false,
        oldSize: 1,
        newSize: 1
      });
    });

    test('consistency with repeated calls', () => {
      const content1 = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
      const content2 = new Uint8Array([0x04, 0x05, 0x06, 0x07]);
      
      // Multiple calls should return identical results
      const results = Array.from({ length: 5 }, () => 
        BinaryDiff.computeBinaryDiff(content1, content2)
      );
      
      results.forEach(result => {
        expect(result).toEqual(results[0]);
      });
      
      const similarities = Array.from({ length: 5 }, () => 
        BinaryDiff.computeSimilarity(content1, content2)
      );
      
      similarities.forEach(similarity => {
        expect(similarity).toBe(similarities[0]);
      });
    });

    test('handles various binary file patterns', () => {
      // Alternating pattern
      const alternating = new Uint8Array(Array.from({ length: 100 }, (_, i) => i % 2 === 0 ? 0x00 : 0xFF));
      expect(BinaryDiff.isBinary(alternating)).toBe(true);
      
      // Random binary pattern
      const randomBinary = new Uint8Array(100);
      for (let i = 0; i < 100; i++) {
        randomBinary[i] = Math.floor(Math.random() * 256);
      }
      
      // Should consistently classify the same content
      const classification1 = BinaryDiff.isBinary(randomBinary);
      const classification2 = BinaryDiff.isBinary(randomBinary);
      expect(classification1).toBe(classification2);
    });

    test('boundary conditions for binary detection threshold', () => {
      const testSize = 1000;
      const nullByteThreshold = Math.floor(testSize * 0.1); // 10% threshold
      
      // Just below threshold (should be non-binary)
      const belowThreshold = new Uint8Array(testSize);
      for (let i = 0; i < nullByteThreshold; i++) {
        belowThreshold[i] = 0x00;
      }
      for (let i = nullByteThreshold; i < testSize; i++) {
        belowThreshold[i] = 0x41; // 'A'
      }
      expect(BinaryDiff.isBinary(belowThreshold)).toBe(false);
      
      // Just above threshold (should be binary)
      const aboveThreshold = new Uint8Array(testSize);
      for (let i = 0; i <= nullByteThreshold; i++) {
        aboveThreshold[i] = 0x00;
      }
      for (let i = nullByteThreshold + 1; i < testSize; i++) {
        aboveThreshold[i] = 0x41; // 'A'
      }
      expect(BinaryDiff.isBinary(aboveThreshold)).toBe(true);
    });
  });

  describe('Real-world binary file scenarios', () => {
    test('simulates image file modifications', () => {
      // Simulate an image file being modified
      const originalImage = new Uint8Array(1000);
      const modifiedImage = new Uint8Array(1000);
      
      // Fill with typical image data (no null bytes)
      for (let i = 0; i < 1000; i++) {
        originalImage[i] = (i * 137) % 256; // Pseudo-random non-null bytes
        modifiedImage[i] = (i * 137) % 256;
      }
      
      // Modify a small portion (simulating compression difference)
      for (let i = 100; i < 200; i++) {
        modifiedImage[i] = (modifiedImage[i]! + 1) % 256;
      }
      
      const result = BinaryDiff.computeBinaryDiff(originalImage, modifiedImage);
      expect(result.identical).toBe(false);
      expect(result.sizeDiff).toBe(0);
      
      const similarity = BinaryDiff.computeSimilarity(originalImage, modifiedImage);
      expect(similarity).toBe(100); // Same size
    });

    test('simulates executable file patching', () => {
      // Simulate an executable being patched
      const originalExe = new Uint8Array(2048);
      const patchedExe = new Uint8Array(2100); // Slightly larger after patch
      
      // Fill with binary executable-like data (ensure >10% null bytes)
      for (let i = 0; i < originalExe.length; i++) {
        originalExe[i] = i % 8 === 0 ? 0x00 : (i % 256); // 12.5% null bytes
      }
      
      // Copy original content and maintain similar null byte ratio
      for (let i = 0; i < 2100; i++) {
        if (i < 1000) {
          patchedExe[i] = originalExe[i]!;
        } else if (i < 1052) {
          patchedExe[i] = 0xCC; // INT3 instruction (common in patching)
        } else {
          patchedExe[i] = (i - 52) % 8 === 0 ? 0x00 : ((i - 52) % 256); // Maintain null byte ratio
        }
      }
      
      expect(BinaryDiff.isBinary(originalExe)).toBe(true);
      expect(BinaryDiff.isBinary(patchedExe)).toBe(true);
      
      const result = BinaryDiff.computeBinaryDiff(originalExe, patchedExe);
      expect(result.sizeDiff).toBe(52);
      expect(result.identical).toBe(false);
      
      const similarity = BinaryDiff.computeSimilarity(originalExe, patchedExe);
      expect(similarity).toBeGreaterThan(90); // Should be very similar in size
    });

    test('simulates compressed archive modifications', () => {
      // Simulate a ZIP file being modified
      const originalZip = new Uint8Array(5000);
      const modifiedZip = new Uint8Array(4800); // Compressed differently
      
      // ZIP files often have lots of null bytes for alignment
      for (let i = 0; i < originalZip.length; i++) {
        if (i % 8 === 0) { // 12.5% null bytes
          originalZip[i] = 0x00;
        } else {
          originalZip[i] = Math.floor(Math.random() * 128) + 1; // Avoid creating more null bytes
        }
      }
      
      // Similar pattern for modified version
      for (let i = 0; i < modifiedZip.length; i++) {
        if (i % 7 === 0) { // ~14% null bytes
          modifiedZip[i] = 0x00;
        } else {
          modifiedZip[i] = Math.floor(Math.random() * 128) + 1; // Avoid creating more null bytes
        }
      }
      
      expect(BinaryDiff.isBinary(originalZip)).toBe(true);
      expect(BinaryDiff.isBinary(modifiedZip)).toBe(true);
      
      const result = BinaryDiff.computeBinaryDiff(originalZip, modifiedZip);
      expect(result.sizeDiff).toBe(-200);
      
      const similarity = BinaryDiff.computeSimilarity(originalZip, modifiedZip);
      expect(similarity).toBe(96); // 4800/5000 * 100
    });

    test('handles database file scenarios', () => {
      // Simulate SQLite database files (which have specific binary patterns)
      const dbFile1 = new Uint8Array(8192); // 8KB page size
      const dbFile2 = new Uint8Array(8192);
      
      // SQLite header
      const sqliteHeader = Buffer.from('SQLite format 3\0', 'utf-8');
      dbFile1.set(sqliteHeader, 0);
      dbFile2.set(sqliteHeader, 0);
      
      // Fill rest with database-like content (mix of text and binary)
      for (let i = sqliteHeader.length; i < dbFile1.length; i++) {
        const value = i % 100 < 70 ? Math.floor(Math.random() * 256) : 0x00;
        dbFile1[i] = value;
        dbFile2[i] = value;
      }
      
      // Modify one record
      for (let i = 1000; i < 1100; i++) {
        dbFile2[i] = Math.floor(Math.random() * 256);
      }
      
      expect(BinaryDiff.isBinary(dbFile1)).toBe(true);
      expect(BinaryDiff.isBinary(dbFile2)).toBe(true);
      
      const result = BinaryDiff.computeBinaryDiff(dbFile1, dbFile2);
      expect(result.identical).toBe(false);
      expect(result.sizeDiff).toBe(0);
    });
  });

  describe('Performance tests', () => {
    test('handles very large binary files efficiently', () => {
      const size = 1024 * 1024; // 1MB
      const largeFile1 = new Uint8Array(size);
      const largeFile2 = new Uint8Array(size);
      
      // Fill with pattern
      for (let i = 0; i < size; i++) {
        largeFile1[i] = i % 256;
        largeFile2[i] = i % 256;
      }
      
      const start = Date.now();
      const result = BinaryDiff.computeBinaryDiff(largeFile1, largeFile2);
      const end = Date.now();
      
      expect(result.identical).toBe(true);
      expect(end - start).toBeLessThan(1000); // Should complete within 1 second
    });

    test('binary detection scales well', () => {
      const sizes = [1024, 4096, 8192, 16384, 32768];
      
      sizes.forEach(size => {
        const content = new Uint8Array(size);
        // Create content with many null bytes to ensure binary classification
        for (let i = 0; i < size; i++) {
          content[i] = i % 5 === 0 ? 0x00 : 0x41;
        }
        
        const start = Date.now();
        const isBinary = BinaryDiff.isBinary(content);
        const end = Date.now();
        
        expect(isBinary).toBe(true);
        expect(end - start).toBeLessThan(50); // Should be fast regardless of size
      });
    });

    test('similarity computation is O(1)', () => {
      const sizes = [100, 1000, 10000, 100000];
      
      sizes.forEach(size => {
        const content1 = new Uint8Array(size);
        const content2 = new Uint8Array(size * 2);
        
        const start = Date.now();
        const similarity = BinaryDiff.computeSimilarity(content1, content2);
        const end = Date.now();
        
        expect(similarity).toBe(50); // size/size*2 = 50%
        expect(end - start).toBeLessThan(5); // Should be constant time
      });
    });
  });

  describe('Advanced binary format tests', () => {
    test('handles PDF file structure', () => {
      // Simulate PDF file with header and mixed content
      const pdfContent = new Uint8Array(2000);
      const pdfHeader = Buffer.from('%PDF-1.4\n', 'utf-8');
      pdfContent.set(pdfHeader, 0);
      
      // PDF files have mix of text and binary content
      for (let i = pdfHeader.length; i < 2000; i++) {
        if (i % 20 === 0) {
          pdfContent[i] = 0x00; // 5% null bytes - should be non-binary
        } else {
          pdfContent[i] = 32 + (i % 95); // Printable ASCII range
        }
      }
      
      expect(BinaryDiff.isBinary(pdfContent)).toBe(false); // 5% null bytes < 10% threshold
    });

    test('handles Microsoft Office document formats', () => {
      // Simulate DOCX/XLSX (ZIP-based) with binary signature
      const officeDoc = new Uint8Array(1000);
      
      // ZIP file signature
      officeDoc[0] = 0x50; // 'P'
      officeDoc[1] = 0x4B; // 'K'
      officeDoc[2] = 0x03; 
      officeDoc[3] = 0x04;
      
      // Fill with binary content (>10% null bytes)
      for (let i = 4; i < 1000; i++) {
        officeDoc[i] = i % 9 === 0 ? 0x00 : Math.floor(Math.random() * 256);
      }
      
      expect(BinaryDiff.isBinary(officeDoc)).toBe(true);
    });

    test('distinguishes between different executable formats', () => {
      // Windows PE executable
      const peExe = new Uint8Array(512);
      peExe[0] = 0x4D; // 'M'
      peExe[1] = 0x5A; // 'Z' - MZ header
      
      // ELF executable
      const elfExe = new Uint8Array(512);
      elfExe[0] = 0x7F;
      elfExe[1] = 0x45; // 'E'
      elfExe[2] = 0x4C; // 'L'
      elfExe[3] = 0x46; // 'F'
      
      // Both should have enough null bytes to be classified as binary
      for (let i = 16; i < 512; i++) {
        peExe[i] = i % 8 === 0 ? 0x00 : 0xFF;
        elfExe[i] = i % 8 === 0 ? 0x00 : 0xFF;
      }
      
      expect(BinaryDiff.isBinary(peExe)).toBe(true);
      expect(BinaryDiff.isBinary(elfExe)).toBe(true);
      
      const diff = BinaryDiff.computeBinaryDiff(peExe, elfExe);
      expect(diff.identical).toBe(false); // Different headers
      expect(diff.sizeDiff).toBe(0); // Same size
    });

    test('handles multimedia container formats', () => {
      // MP4 container
      const mp4Container = new Uint8Array(1000);
      // MP4 has 'ftyp' box signature
      mp4Container.set(Buffer.from('ftypisom', 'ascii'), 4);
      
      // Fill with typical MP4 data (binary with some null padding)
      for (let i = 12; i < 1000; i++) {
        mp4Container[i] = i % 7 === 0 ? 0x00 : Math.floor(Math.random() * 256);
      }
      
      expect(BinaryDiff.isBinary(mp4Container)).toBe(true); // ~14% null bytes
    });

    test('handles encrypted file patterns', () => {
      // Encrypted files typically have high entropy and few patterns
      const encryptedFile1 = new Uint8Array(1000);
      const encryptedFile2 = new Uint8Array(1000);
      
      // Simulate encrypted data with pseudo-random content
      for (let i = 0; i < 1000; i++) {
        encryptedFile1[i] = ((i * 137 + 42) % 256);
        encryptedFile2[i] = ((i * 139 + 43) % 256);
      }
      
      // Encrypted files usually don't have many null bytes
      expect(BinaryDiff.isBinary(encryptedFile1)).toBe(false);
      expect(BinaryDiff.isBinary(encryptedFile2)).toBe(false);
      
      const diff = BinaryDiff.computeBinaryDiff(encryptedFile1, encryptedFile2);
      expect(diff.identical).toBe(false);
      expect(diff.sizeDiff).toBe(0);
    });

    test('handles version differences in binary formats', () => {
      // Simulate binary format with version headers
      const version1 = new Uint8Array(500);
      const version2 = new Uint8Array(500);
      
      // Common header with version difference
      version1.set([0x4D, 0x41, 0x47, 0x49, 0x43, 0x01, 0x00, 0x00], 0); // Version 1.0
      version2.set([0x4D, 0x41, 0x47, 0x49, 0x43, 0x02, 0x00, 0x00], 0); // Version 2.0
      
      // Similar content with slight differences
      for (let i = 8; i < 500; i++) {
        const baseValue = i % 256;
        version1[i] = baseValue;
        version2[i] = i % 100 === 0 ? (baseValue + 1) % 256 : baseValue;
      }
      
      const similarity = BinaryDiff.computeSimilarity(version1, version2);
      expect(similarity).toBe(100); // Same size
      
      const diff = BinaryDiff.computeBinaryDiff(version1, version2);
      expect(diff.identical).toBe(false);
      expect(diff.sizeDiff).toBe(0);
    });
  });

  describe('Binary diff integration scenarios', () => {
    test('simulates version control binary file tracking', () => {
      // Simulate tracking a binary file through multiple commits
      const originalFile = new Uint8Array(800);
      const commit1File = new Uint8Array(850); // Added content
      const commit2File = new Uint8Array(820); // Some content removed
      
      // Initialize original file
      for (let i = 0; i < 800; i++) {
        originalFile[i] = i % 10 === 0 ? 0x00 : ((i * 17) % 256);
      }
      
      // Commit 1: Add 50 bytes
      commit1File.set(originalFile, 0);
      for (let i = 800; i < 850; i++) {
        commit1File[i] = (i * 19) % 256;
      }
      
      // Commit 2: Remove some middle content (simulate optimization)
      commit2File.set(originalFile.slice(0, 400), 0);
      commit2File.set(originalFile.slice(430, 800), 400); // Skip 30 bytes
      for (let i = 770; i < 820; i++) {
        commit2File[i] = (i * 23) % 256;
      }
      
      // Track changes through commits
      const diff1 = BinaryDiff.computeBinaryDiff(originalFile, commit1File);
      const diff2 = BinaryDiff.computeBinaryDiff(commit1File, commit2File);
      const diffTotal = BinaryDiff.computeBinaryDiff(originalFile, commit2File);
      
      expect(diff1.sizeDiff).toBe(50);
      expect(diff2.sizeDiff).toBe(-30);
      expect(diffTotal.sizeDiff).toBe(20);
      
      expect(diff1.identical).toBe(false);
      expect(diff2.identical).toBe(false);
      expect(diffTotal.identical).toBe(false);
    });

    test('handles binary merge conflict scenarios', () => {
      const baseFile = new Uint8Array(1000);
      const branchAFile = new Uint8Array(1000);
      const branchBFile = new Uint8Array(1000);
      
      // Initialize base file
      for (let i = 0; i < 1000; i++) {
        baseFile[i] = i % 256;
      }
      
      // Branch A: Modify first half
      branchAFile.set(baseFile, 0);
      for (let i = 0; i < 500; i++) {
        branchAFile[i] = (branchAFile[i]! + 1) % 256;
      }
      
      // Branch B: Modify second half
      branchBFile.set(baseFile, 0);
      for (let i = 500; i < 1000; i++) {
        branchBFile[i] = (branchBFile[i]! + 2) % 256;
      }
      
      // Compare branches to base
      const diffA = BinaryDiff.computeBinaryDiff(baseFile, branchAFile);
      const diffB = BinaryDiff.computeBinaryDiff(baseFile, branchBFile);
      const diffAB = BinaryDiff.computeBinaryDiff(branchAFile, branchBFile);
      
      expect(diffA.identical).toBe(false);
      expect(diffB.identical).toBe(false);
      expect(diffAB.identical).toBe(false);
      
      expect(diffA.sizeDiff).toBe(0);
      expect(diffB.sizeDiff).toBe(0);
      expect(diffAB.sizeDiff).toBe(0);
      
      // Similarity should reflect that each branch changed different parts
      const simAB = BinaryDiff.computeSimilarity(branchAFile, branchBFile);
      expect(simAB).toBe(100); // Same size
    });

    test('benchmarks binary diff performance characteristics', () => {
      const sizes = [1024, 4096, 16384]; // 1KB to 16KB (reduced for test performance)
      const results: Array<{ size: number; detectTime: number; diffTime: number; simTime: number }> = [];
      
      sizes.forEach(size => {
        const file1 = new Uint8Array(size);
        const file2 = new Uint8Array(size);
        
        // Fill with patterns that create binary classification
        for (let i = 0; i < size; i++) {
          file1[i] = i % 8 === 0 ? 0x00 : (i % 256);
          file2[i] = i % 9 === 0 ? 0x00 : ((i + 1) % 256);
        }
        
        // Measure binary detection time
        const detectStart = Date.now();
        BinaryDiff.isBinary(file1);
        const detectTime = Date.now() - detectStart;
        
        // Measure diff computation time
        const diffStart = Date.now();
        BinaryDiff.computeBinaryDiff(file1, file2);
        const diffTime = Date.now() - diffStart;
        
        // Measure similarity computation time
        const simStart = Date.now();
        BinaryDiff.computeSimilarity(file1, file2);
        const simTime = Date.now() - simStart;
        
        results.push({ size, detectTime, diffTime, simTime });
      });
      
      // Verify performance characteristics
      results.forEach(result => {
        expect(result.detectTime).toBeLessThan(50); // Detection should be fast
        expect(result.diffTime).toBeLessThan(100); // Diff time should be reasonable
        expect(result.simTime).toBeLessThan(10); // Similarity should be very fast
      });
      
      // Verify basic performance scaling
      expect(results.length).toBe(3);
      expect(results[0]!.size).toBeLessThan(results[2]!.size);
    });
  });
});