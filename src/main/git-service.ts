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
    console.error('=== GitService.getStatus called ===');
    console.error('repoPath:', repoPath);
    
    if (!this.git || this.currentRepoPath !== repoPath) {
      await this.openRepository(repoPath);
    }

    if (!this.git) {
      throw new Error('Git not initialized');
    }

    const status = await this.git.status();

    // Debug logging for simple-git status - force to main process stdout
    console.error('=== Simple-git Status Debug ===');
    console.error('current branch:', status.current);
    console.error('status.modified:', status.modified);
    console.error('status.staged:', status.staged);
    console.error('status.not_added:', status.not_added);
    console.error('status.deleted:', status.deleted);
    console.error('status.created:', status.created);
    console.error('status.renamed:', status.renamed);
    console.error('status.conflicted:', status.conflicted);
    
    // Show individual file statuses for debugging
    if (status.files && status.files.length > 0) {
      console.error('Individual file statuses:');
      status.files.forEach((file, index) => {
        console.error(`  [${index}] ${file.path}:`);
        console.error(`    - index: "${file.index}"`);
        console.error(`    - working_dir: "${file.working_dir}"`);
      });
    }
    
    console.error('===============================');

    // Use status.files for more accurate staging information
    const staged = [];
    const modified = [];
    const deleted = [];

    status.files.forEach(file => {
      // Check if file has staged changes (index status)
      if (file.index && file.index !== ' ' && file.index !== '?') {
        staged.push(file.path);
      }
      
      // Check if file has unstaged changes (working_dir status)
      if (file.working_dir && file.working_dir !== ' ') {
        if (file.working_dir === 'D') {
          deleted.push(file.path);
        } else {
          modified.push(file.path);
        }
      }
    });

    console.error('=== Processed Results ===');
    console.error('staged:', staged);
    console.error('modified:', modified);
    console.error('deleted:', deleted);
    console.error('untracked:', status.not_added);

    return {
      modified,
      staged,
      untracked: status.not_added,
      deleted,
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