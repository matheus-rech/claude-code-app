const { initTRPC } = require('@trpc/server');
const { z } = require('zod');
const { gitService } = require('../git-service');
const { dialog } = require('electron');
const { ClaudeCode } = require('../claude-code');


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
          const result = await dialog.showOpenDialog({
            properties: ['openDirectory'],
            title: 'Select Git Repository',
          });
          
          if (result.canceled || result.filePaths.length === 0) {
            throw new Error('No repository selected');
          }
          
          selectedPath = result.filePaths[0];
        }
        
        return await gitService.openRepository(selectedPath);
      }),

    getStatus: procedure
      .input(z.string())
      .query(async ({ input: repoPath }) => {
        const result = await gitService.getStatus(repoPath);
        return result;
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
        console.error('=== TRPC getFileDiff called ===');
        console.error('input:', JSON.stringify(input, null, 2));
        try {
          const result = await gitService.getFileDiff(input.repoPath, input.filePath, input.staged);
          console.error('=== TRPC getFileDiff result ===');
          console.error('result length:', result.length);
          return result;
        } catch (error) {
          console.error('=== TRPC getFileDiff error ===');
          console.error('error:', error);
          throw error;
        }
      }),
  }),

  system: router({
    getAppVersion: procedure
      .query(() => {
        return process.env.npm_package_version || '1.0.0';
      }),
  }),

  claudeCode: router({
    chat: procedure
      .input(z.object({
        message: z.string(),
        sessionId: z.string().optional(),
        verbose: z.boolean().optional().default(false)
      }))
      .mutation(async ({ input }) => {
        const claudeCode = new ClaudeCode({
          verbose: input.verbose,
          workingDirectory: process.cwd()
        });

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


module.exports = { router, procedure, appRouter };