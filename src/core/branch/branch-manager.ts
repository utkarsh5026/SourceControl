import { RefManager } from '@/core/refs';
import { Repository } from '@/core/repo';
import path from 'path';
import { FileUtils } from '@/utils';
import { BranchInfo, CreateBranchOptions, CheckoutOptions } from './types';
import {
  BranchCreator,
  BranchRefService,
  BranchInfoService,
  BranchCheckout,
  BranchRename,
  BranchDelete,
} from './services';
import { WorkingDirectoryManager } from './workdir-manager';

/**
 * BranchManager for comprehensive branch operations
 *
 * This manager handles:
 * - Branch creation, deletion, and renaming
 * - Branch switching (checkout)
 * - Branch listing with detailed information
 * - HEAD management (attached/detached states)
 * - Branch tracking and comparison
 */
export class BranchManager {
  private refManager: RefManager;
  private repository: Repository;
  private branchRefService: BranchRefService;
  private branchInfoService: BranchInfoService;

  constructor(repository: Repository) {
    this.repository = repository;
    this.refManager = new RefManager(repository);
    this.branchRefService = new BranchRefService(this.refManager);
    this.branchInfoService = new BranchInfoService(
      this.repository,
      this.refManager,
      this.branchRefService
    );
  }

  public async init(): Promise<void> {
    await this.refManager.init();
    await FileUtils.createDirectories(
      path.join(this.refManager.getRefsPath(), BranchRefService.BRANCH_DIR_NAME)
    );
  }

  public async createBranch(
    branchName: string,
    options: CreateBranchOptions = {}
  ): Promise<BranchInfo> {
    const creator = new BranchCreator(
      this.repository,
      this.branchRefService,
      this.branchInfoService
    );
    const branchInfo = await creator.createBranch(branchName, options);
    if (options.checkout) await this.checkout(branchName, { detach: false });
    return branchInfo;
  }

  public async checkout(target: string, options: CheckoutOptions = {}): Promise<void> {
    const branchCreator = new BranchCreator(
      this.repository,
      this.branchRefService,
      this.branchInfoService
    );
    const workdirManager = new WorkingDirectoryManager(this.repository);
    const checkoutService = new BranchCheckout(
      this.repository,
      this.branchRefService,
      branchCreator,
      workdirManager
    );
    await checkoutService.checkout(target, options);
  }

  public async deleteBranch(branchName: string, force: boolean = false): Promise<void> {
    const deleteService = new BranchDelete(this.branchRefService);
    await deleteService.deleteBranch(branchName, force);
  }

  public async renameBranch(
    oldName: string,
    newName: string,
    force: boolean = false
  ): Promise<void> {
    const renameService = new BranchRename(this.branchRefService);
    await renameService.renameBranch(oldName, newName, force);
  }

  public async getBranch(branchName: string): Promise<BranchInfo> {
    return await this.branchInfoService.getBranchInfo(branchName);
  }

  public async listBranches(): Promise<BranchInfo[]> {
    return await this.branchInfoService.listBranches();
  }

  public async getCurrentBranch(): Promise<string | null> {
    const branchRefService = new BranchRefService(this.refManager);
    return await branchRefService.getCurrentBranch();
  }

  public async isDetached(): Promise<boolean> {
    const branchRefService = new BranchRefService(this.refManager);
    return await branchRefService.isDetached();
  }

  public async getCurrentCommit(): Promise<string> {
    return await this.refManager.resolveReferenceToSha(BranchRefService.HEAD_FILE);
  }
}
