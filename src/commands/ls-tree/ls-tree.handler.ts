import { Repository } from '@/core/repo';
import { TreeObject, ObjectType, CommitObject } from '@/core/objects';
import { display } from '@/utils';
import { displayTreeEntry, displayTreeHeader } from './ls-tree.display';

export type LsTreeOptions = {
  recursive?: boolean;
  nameOnly?: boolean;
  longFormat?: boolean;
  treeOnly?: boolean;
};

export const listTree = async (
  repository: Repository,
  treeish: string,
  options: LsTreeOptions,
  prefix: string = ''
): Promise<void> => {
  try {
    const obj = await repository.readObject(treeish);
    if (!obj) {
      throw new Error(`object ${treeish} not found`);
    }

    let treeObj: TreeObject;

    switch (obj.type()) {
      case ObjectType.COMMIT: {
        const { treeSha } = obj as CommitObject;
        if (!treeSha) throw new Error('commit has no tree');

        const treeFromCommit = await repository.readObject(treeSha);
        if (!treeFromCommit || treeFromCommit.type() !== ObjectType.TREE)
          throw new Error('invalid tree object in commit');

        treeObj = treeFromCommit as TreeObject;
        break;
      }

      case ObjectType.TREE: {
        treeObj = obj as TreeObject;
        break;
      }

      default: {
        throw new Error(`object ${treeish} is not a tree or commit`);
      }
    }

    displayTreeHeader(treeish, prefix || '<root>');
    const entries = treeObj.entries;

    if (entries.length === 0) {
      display.info('  (empty tree)', '🌳 Tree Contents');
      return;
    }

    for (const entry of entries) {
      const isTree = entry.isDirectory();

      if (options.treeOnly && !isTree) {
        continue;
      }

      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (options.nameOnly) console.log(fullPath);
      else await displayTreeEntry(repository, entry, options.longFormat || false);

      if (options.recursive && isTree) {
        await listTree(repository, entry.sha, options, fullPath);
      }
    }
  } catch (error) {
    throw new Error(`cannot list tree ${treeish}: ${(error as Error).message}`);
  }
};
