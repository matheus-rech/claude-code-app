const { simpleGit } = require('simple-git');
const path = require('path');
const fs = require('fs');

class GitService {
  private git = null;
  private currentRepoPath = null;

  async openRepository(repoPath) {
    if (!fs.existsSync(repoPath)) {
      throw new Error(`Repository path does not exist: ${repoPath}`);
    }

    const gitDir = path.join(repoPath, '.git');
    if (!fs.existsSync(gitDir)) {
      throw new Error(`Not a Git repository: ${repoPath}`);
    }

    this.git = simpleGit(repoPath);
    this.currentRepoPath = repoPath;

    const name = path.basename(repoPath);
    return { path: repoPath, name };
  }

  async getStatus(repoPath) {
    if (!this.git || this.currentRepoPath !== repoPath) {
      await this.openRepository(repoPath);
    }

    if (!this.git) {
      throw new Error('Git not initialized');
    }

    const status = await this.git.status();

    return {
      modified: status.modified,
      staged: status.staged,
      untracked: status.not_added,
      deleted: status.deleted,
    };
  }

  async stageFile(repoPath, filePath) {
    if (!this.git || this.currentRepoPath !== repoPath) {
      await this.openRepository(repoPath);
    }

    if (!this.git) {
      throw new Error('Git not initialized');
    }

    await this.git.add(filePath);
  }

  async unstageFile(repoPath, filePath) {
    if (!this.git || this.currentRepoPath !== repoPath) {
      await this.openRepository(repoPath);
    }

    if (!this.git) {
      throw new Error('Git not initialized');
    }

    await this.git.reset(['HEAD', filePath]);
  }

  async commit(repoPath, message) {
    if (!this.git || this.currentRepoPath !== repoPath) {
      await this.openRepository(repoPath);
    }

    if (!this.git) {
      throw new Error('Git not initialized');
    }

    await this.git.commit(message);
  }

  async getBranches(repoPath) {
    if (!this.git || this.currentRepoPath !== repoPath) {
      await this.openRepository(repoPath);
    }

    if (!this.git) {
      throw new Error('Git not initialized');
    }

    const branches = await this.git.branchLocal();
    return {
      all: branches.all,
      current: branches.current,
    };
  }
}

const gitService = new GitService();

module.exports = { gitService };