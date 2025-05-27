const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('node:path');
const fs = require('fs');
const os = require('os');
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

    return {
      modified: status.modified,
      staged: status.staged,
      untracked: status.not_added,
      deleted: status.deleted,
      current: status.current,
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

// tRPC Router
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
          // TEMPORARY WORKAROUND: macOS dialog bug returns empty filePaths
          // Use the current project directory for testing
          selectedPath = '/Users/philipp/dev/claude-code-app';
          console.log('Using hardcoded path due to macOS dialog bug:', selectedPath);
          
          /* 
          // Original dialog code - has macOS bug
          console.log('Opening file dialog with mainWindow:', !!mainWindow);
          const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: 'Select Git Repository',
            message: 'Choose a folder containing a Git repository (.git folder)',
            defaultPath: require('os').homedir(),
            buttonLabel: 'Select Repository',
          });
          
          console.log('Dialog result:', result);
          
          if (result.canceled) {
            throw new Error('Repository selection was canceled');
          }
          
          if (!result.filePaths || result.filePaths.length === 0) {
            throw new Error('No directory selected');
          }
          
          selectedPath = result.filePaths[0];
          console.log('Selected path:', selectedPath);
          */
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

    getBranches: procedure
      .input(z.string())
      .query(async ({ input: repoPath }) => {
        return await gitService.getBranches(repoPath);
      }),
  }),
});

// Global reference to main window
let mainWindow = null;

// Setup tRPC IPC handlers
function setupTrpcIpcHandler() {
  const caller = appRouter.createCaller({});

  ipcMain.handle('trpc:query', async (event, { procedure, input }) => {
    try {
      const pathArray = procedure.split('.');
      let proc = caller as any;
      
      for (const segment of pathArray) {
        proc = proc[segment];
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

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    tabbingIdentifier: 'claude-code-repo-tabs',
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