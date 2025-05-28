const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('fs');
const started = require('electron-squirrel-startup');
const { simpleGit } = require('simple-git');
const { initTRPC } = require('@trpc/server');
const { z } = require('zod');
// Claude Code implementation inline
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

/**
 * Execute a command and return the result
 */
async function executeCommand(command, options = {}, emitter = null) {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], {
      cwd: options.cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...options.env },
    });

    // Add timeout to prevent hanging
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Command timed out after 60 seconds'));
    }, 60000);

    let stdout = '';
    let stderr = '';
    let buffer = '';

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      
      // Emit JSON lines if emitter is provided
      if (emitter) {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            try {
              const json = JSON.parse(trimmed);
              emitter.emit('json', json);
            } catch (e) {
              emitter.emit('raw', trimmed);
            }
          }
        }
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      
      // Process any remaining buffer content
      if (emitter && buffer.trim()) {
        try {
          const json = JSON.parse(buffer.trim());
          emitter.emit('json', json);
        } catch (e) {
          emitter.emit('raw', buffer.trim());
        }
      }
      
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code || 0,
      });
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

/**
 * Main ClaudeCode class for interacting with Claude CLI
 */
class ClaudeCode extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      claudeCodePath: 'npx @anthropic-ai/claude-code',
      workingDirectory: process.cwd(),
      verbose: false,
      ...options,
    };
  }

  defaultArgs() {
    const args = [];
    
    if (this.options.verbose) {
      args.push('--verbose');
    }
    
    if (this.options.model) {
      args.push('--model', this.options.model);
    }
    
    // Always add dangerous skip permissions for automated usage
    args.push('--dangerously-skip-permissions');
    
    return args;
  }

  async chat(promptInput, sessionId = null) {
    try {
      const prompt = typeof promptInput === 'string' ? promptInput : promptInput.prompt;
      const systemPrompt = typeof promptInput === 'object' ? promptInput.systemPrompt : null;
      
      const args = [...this.defaultArgs()];
      args.push('--print');
      args.push('--output-format', 'stream-json');
      
      if (sessionId) {
        args.push('--resume', sessionId);
      }
      
      // Use piped input instead of command argument to avoid hanging
      const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
      const command = `echo "${escapedPrompt}" | ${this.options.claudeCodePath} ${args.join(' ')}`;
      
      if (this.options.verbose) {
        console.log('Executing command:', command);
      }
      
      const result = await executeCommand(command, {
        cwd: this.options.workingDirectory,
      }, this);
      
      if (result.exitCode === 0) {
        // Parse streaming JSON lines and collect all messages
        let allMessages = [];
        let finalResult = null;
        let sessionId = null;
        
        const lines = result.stdout.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            try {
              const json = JSON.parse(line.trim());
              
              // Store session ID from system init
              if (json.type === 'system' && json.subtype === 'init' && json.session_id) {
                sessionId = json.session_id;
                allMessages.push({
                  type: 'system',
                  content: `🔧 Claude Code initialized with ${json.tools?.length || 0} tools available`,
                  timestamp: new Date().toISOString()
                });
              }
              
              // Handle assistant messages
              else if (json.type === 'assistant' && json.message && json.message.content) {
                if (Array.isArray(json.message.content)) {
                  for (const contentItem of json.message.content) {
                    if (contentItem.type === 'text' && contentItem.text) {
                      allMessages.push({
                        type: 'assistant',
                        content: contentItem.text,
                        timestamp: new Date().toISOString()
                      });
                    } else if (contentItem.type === 'tool_use') {
                      allMessages.push({
                        type: 'system',
                        content: `🔧 Using tool: ${contentItem.name}${contentItem.input ? ` with ${Object.keys(contentItem.input).join(', ')}` : ''}`,
                        timestamp: new Date().toISOString()
                      });
                    }
                  }
                }
              }
              
              // Handle tool results
              else if (json.type === 'user' && json.message && json.message.content) {
                if (Array.isArray(json.message.content)) {
                  for (const contentItem of json.message.content) {
                    if (contentItem.type === 'tool_result' && contentItem.content) {
                      const preview = typeof contentItem.content === 'string' 
                        ? contentItem.content.substring(0, 100) + (contentItem.content.length > 100 ? '...' : '')
                        : '[Tool result]';
                      allMessages.push({
                        type: 'system',
                        content: `📄 Tool result: ${preview}`,
                        timestamp: new Date().toISOString()
                      });
                    }
                  }
                }
              }
              
              // Store final result for session info
              else if (json.type === 'result') {
                finalResult = json;
                allMessages.push({
                  type: 'system',
                  content: `✅ Completed in ${json.duration_ms}ms (${json.num_turns} turns, $${json.cost_usd?.toFixed(4) || '0.0000'})`,
                  timestamp: new Date().toISOString()
                });
              }
            } catch (e) {
              // Skip invalid JSON lines
            }
          }
        }
        
        console.log('=== CLAUDE CODE RESPONSE ===');
        console.log('result.stdout:', result.stdout);
        console.log('allMessages:', allMessages);
        console.log('finalResult:', finalResult);
        
        return {
          success: true,
          message: finalResult || {
            type: 'text',
            result: allMessages.length > 0 ? 'Multiple messages processed' : result.stdout,
            session_id: sessionId || 'unknown',
            num_turns: 1,
            is_error: false,
            cost_usd: 0,
            duration_ms: 0,
            duration_api_ms: 0,
          },
          content: allMessages,
          sessionId: sessionId,
          allMessages: allMessages,
        };
      } else {
        return {
          success: false,
          error: {
            code: 'COMMAND_FAILED',
            message: result.stderr || 'Command execution failed',
            details: result,
          },
          exitCode: result.exitCode,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error.message,
          details: error,
        },
      };
    }
  }

  async version() {
    const response = await this.runCommand(['--version']);
    return response.success ? response.message.result.trim() : 'unknown';
  }

  async runCommand(args) {
    try {
      const command = `${this.options.claudeCodePath} ${args.join(' ')}`;
      
      if (this.options.verbose) {
        console.log('Executing command:', command);
      }
      
      const result = await executeCommand(command, {
        cwd: this.options.workingDirectory,
      });
      
      return {
        success: result.exitCode === 0,
        message: result.exitCode === 0 ? {
          type: 'command',
          result: result.stdout,
          session_id: 'command',
          num_turns: 1,
          is_error: false,
          cost_usd: 0,
          duration_ms: 0,
          duration_api_ms: 0,
        } : undefined,
        error: result.exitCode !== 0 ? {
          code: 'COMMAND_FAILED',
          message: result.stderr || 'Command failed',
          details: result,
        } : undefined,
        exitCode: result.exitCode,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error.message,
          details: error,
        },
      };
    }
  }
}

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
          selectedPath = '/Users/philipp/dev/headlessui-elements';
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

  claudeCode: router({
    sendMessage: procedure
      .input(z.object({
        message: z.string(),
        sessionId: z.string().nullable().optional(),
        verbose: z.boolean().optional().default(false),
        repoPath: z.string().optional()
      }))
      .mutation(async ({ input }) => {
        const workingDir = input.repoPath || '/Users/philipp/dev/headlessui-elements';
        const claudeCode = new ClaudeCode({
          verbose: input.verbose,
          workingDirectory: workingDir
        });

        // For now, fall back to synchronous response to fix the crash
        const response = await claudeCode.chat(input.message, input.sessionId);
        
        if (response.success) {
          return {
            content: response.content || response.message?.result || 'No response',
            sessionId: response.message?.session_id,
            success: true
          };
        } else {
          throw new Error(response.error?.message || 'Unknown error');
        }
      }),

    version: procedure
      .query(async () => {
        const claudeCode = new ClaudeCode();
        return await claudeCode.version();
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