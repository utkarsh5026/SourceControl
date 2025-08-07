import { Repository } from '@/core/repo';
import { printPrettyResult } from './hash-object.display';
import { logger } from '@/utils';
import { BlobObject } from '@/core/objects';
import { FileUtils } from '@/utils';

export const hashStdin = async (repository: Repository | null): Promise<void> => {
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    process.stdin.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    process.stdin.on('end', async () => {
      try {
        const content = Buffer.concat(chunks);
        await hashContent(new Uint8Array(content), repository, '<stdin>', false);
        resolve();
      } catch (error) {
        reject(error);
      }
    });

    process.stdin.on('error', reject);
  });
};

export const hashFiles = async (
  fileList: string[],
  repository: Repository | null,
  write: boolean
): Promise<void> => {
  for (const fileName of fileList) {
    try {
      const content = await FileUtils.readFile(fileName);
      await hashContent(new Uint8Array(content), repository, fileName, write);
    } catch (error) {
      logger.error(`cannot read '${fileName}': ${(error as Error).message}`);
      process.exit(1);
    }
  }
};

const hashContent = async (
  content: Uint8Array,
  repository: Repository | null,
  source: string,
  write: boolean
): Promise<void> => {
  const blob = new BlobObject(content);
  const hash = await blob.sha();

  if (write && repository) {
    await repository.writeObject(blob);
    logger.debug(`Stored object ${hash}`);
    return;
  }

  printPrettyResult(hash, source, content.length, write);
};
