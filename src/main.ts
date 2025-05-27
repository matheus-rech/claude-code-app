const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('fs');
const started = require('electron-squirrel-startup');
const { simpleGit } = require('simple-git');
const { initTRPC } = require('@trpc/server');
const { z } = require('zod');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Git Service
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
        diffResult = await this.git.diff(['--cached', '--', filePath]);
      } else {
        try {
          await this.git.show([`HEAD:${filePath}`]);
          diffResult = await this.git.diff(['HEAD', '--', filePath]);
        } catch (error) {
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

// tRPC Setup
const t = initTRPC.create();
const router = t.router;
const procedure = t.procedure;

const appRouter = router({
  git: router({
    openRepository: procedure
      .input(z.string().optional())
      .mutation(async ({ input: repoPath }) => {
        let selectedPath = repoPath;
        
        if (!selectedPath) {
          selectedPath = '/Users/philipp/dev/claude-code-app';
        }
        
        return await gitService.openRepository(selectedPath);
      }),

    getStatus: procedure
      .input(z.string())
      .query(async ({ input: repoPath }) => {
        return await gitService.getStatus(repoPath);
      }),

    stageFile: procedure
      .input(z.object({ 
        repoPath: z.string(), 
        filePath: z.string() 
      }))
      .mutation(async ({ input }) => {
        await gitService.stageFile(input.repoPath, input.filePath);
        return { success: true };
      }),

    unstageFile: procedure
      .input(z.object({ 
        repoPath: z.string(), 
        filePath: z.string() 
      }))
      .mutation(async ({ input }) => {
        await gitService.unstageFile(input.repoPath, input.filePath);
        return { success: true };
      }),

    commit: procedure
      .input(z.object({ 
        repoPath: z.string(), 
        message: z.string().min(1, 'Commit message is required')
      }))
      .mutation(async ({ input }) => {
        await gitService.commit(input.repoPath, input.message);
        return { success: true };
      }),

    getBranches: procedure
      .input(z.string())
      .query(async ({ input: repoPath }) => {
        return await gitService.getBranches(repoPath);
      }),

    getFileDiff: procedure
      .input(z.object({
        repoPath: z.string(),
        filePath: z.string(),
        staged: z.boolean().optional().default(false)
      }))
      .query(async ({ input }) => {
        return await gitService.getFileDiff(input.repoPath, input.filePath, input.staged);
      }),
  }),

  system: router({
    getAppVersion: procedure
      .query(() => {
        return process.env.npm_package_version || '1.0.0';
      }),
  }),
});

// Setup tRPC IPC handlers
function setupTrpcIpcHandler() {
  const caller = appRouter.createCaller({});

  ipcMain.handle('trpc:query', async (event, { procedure, input }) => {
    try {
      const pathArray = procedure.split('.');
      let proc = caller as any;
      
      for (const segment of pathArray) {
        proc = proc[segment];
        if (!proc) {
          throw new Error(`No procedure found on path "${procedure}"`);
        }
      }
      
      const result = await proc(input);
      return result;
    } catch (error) {
      console.error('tRPC query error:', error);
      throw error;
    }
  });

  ipcMain.handle('trpc:mutate', async (event, { procedure, input }) => {
    try {
      const pathArray = procedure.split('.');
      let proc = caller as any;
      
      for (const segment of pathArray) {
        proc = proc[segment];
      }
      
      const result = await proc(input);
      return result;
    } catch (error) {
      console.error('tRPC mutation error:', error);
      throw error;
    }
  });
}

// Global reference to main window
let mainWindow = null;

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    tabbingIdentifier: 'claude-code-repo-tabs',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  setupTrpcIpcHandler();
  createMenu();
  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Create new tab function
function createNewTab() {
  const newWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    tabbingIdentifier: 'claude-code-repo-tabs',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    newWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    newWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Add as a tab to the main window if it exists
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.addTabbedWindow(newWindow);
  }

  return newWindow;
}

// Handle new tab creation
ipcMain.handle('create-new-tab', () => {
  return createNewTab();
});

// Set up application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CommandOrControl+T',
          click: () => {
            createNewTab();
          }
        },
        {
          label: 'Close Tab',
          accelerator: 'CommandOrControl+W',
          role: 'close'
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Minimize',
          accelerator: 'CommandOrControl+M',
          role: 'minimize'
        },
        {
          label: 'Close',
          accelerator: 'CommandOrControl+W',
          role: 'close'
        },
        { type: 'separator' },
        {
          label: 'Merge All Windows',
          click: () => {
            BrowserWindow.getAllWindows().forEach((window, index) => {
              if (index > 0) {
                window.mergeAllWindows && window.mergeAllWindows();
              }
            });
          }
        }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        {
          label: 'About ' + app.getName(),
          role: 'about'
        },
        { type: 'separator' },
        {
          label: 'Services',
          role: 'services',
          submenu: []
        },
        { type: 'separator' },
        {
          label: 'Hide ' + app.getName(),
          accelerator: 'Command+H',
          role: 'hide'
        },
        {
          label: 'Hide Others',
          accelerator: 'Command+Shift+H',
          role: 'hideothers'
        },
        {
          label: 'Show All',
          role: 'unhide'
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'Command+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}