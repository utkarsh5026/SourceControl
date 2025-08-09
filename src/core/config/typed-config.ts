import { GitConfigManager } from './config-manager';

export class TypedConfig {
  private config: GitConfigManager;

  constructor(config: GitConfigManager) {
    this.config = config;
  }

  get repositoryFormatVersion(): number {
    return this.config.get('core.repositoryformatversion')?.asNumber() || 0;
  }

  get fileMode(): boolean {
    return this.config.get('core.filemode')?.asBoolean() || true;
  }

  get bare(): boolean {
    return this.config.get('core.bare')?.asBoolean() || false;
  }

  get ignoreCase(): boolean {
    return this.config.get('core.ignorecase')?.asBoolean() || false;
  }

  get autocrlf(): string {
    return this.config.get('core.autocrlf')?.asString() || 'input';
  }

  // User settings
  get userName(): string | null {
    return this.config.get('user.name')?.asString() || null;
  }

  get userEmail(): string | null {
    return this.config.get('user.email')?.asString() || null;
  }

  // Init settings
  get defaultBranch(): string {
    return this.config.get('init.defaultbranch')?.asString() || 'main';
  }

  // Color settings
  get colorUI(): string {
    return this.config.get('color.ui')?.asString() || 'auto';
  }

  // Remote settings
  getRemoteUrl(remoteName: string): string | null {
    return this.config.get(`remote.${remoteName}.url`)?.asString() || null;
  }

  getRemoteFetch(remoteName: string): string[] {
    return this.config.getAll(`remote.${remoteName}.fetch`).map((e) => e.asString());
  }

  // Branch settings
  getBranchRemote(branchName: string): string | null {
    return this.config.get(`branch.${branchName}.remote`)?.asString() || null;
  }

  getBranchMerge(branchName: string): string | null {
    return this.config.get(`branch.${branchName}.merge`)?.asString() || null;
  }
}
