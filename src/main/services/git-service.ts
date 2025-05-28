import { simpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs';

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

  async resetFile(repoPath, filePath) {
    if (!this.git || this.currentRepoPath !== repoPath) {
      await this.openRepository(repoPath);
    }

    if (!this.git) {
      throw new Error('Git not initialized');
    }

    // Check if file is untracked first
    const status = await this.git.status();
    const isUntracked = status.not_added.includes(filePath);
    
    if (isUntracked) {
      // For untracked files, we delete them instead of resetting
      const fullPath = path.join(repoPath, filePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        return;
      } else {
        throw new Error(`File not found: ${filePath}`);
      }
    }
    
    // For tracked files, reset to HEAD state
    await this.git.checkout(['HEAD', '--', filePath]);
  }

  async getFileDiff(repoPath, filePath, staged = false) {
    if (!this.git || this.currentRepoPath !== repoPath) {
      await this.openRepository(repoPath);
    }

    if (!this.git) {
      throw new Error('Git not initialized');
    }

    try {
      let diffResult = '';
      
      if (staged) {
        // Show staged changes vs HEAD
        diffResult = await this.git.diff(['--cached', '--', filePath]);
      } else {
        // Show unstaged changes vs staged (index)
        diffResult = await this.git.diff(['--', filePath]);
        
        // If no diff (file might be untracked), show the entire file as added
        if (!diffResult) {
          const fullPath = path.join(repoPath, filePath);
          
          if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            
            diffResult = `diff --git a/${filePath} b/${filePath}
new file mode 100644
index 0000000..0000000
--- /dev/null
+++ b/${filePath}
@@ -0,0 +1,${lines.length} @@
${lines.map(line => `+${line}`).join('\n')}`;
          }
        }
      }
      
      return diffResult;
    } catch (error) {
      console.error('Error getting file diff:', error);
      throw error;
    }
  }
}

const gitService = new GitService();

export { gitService };