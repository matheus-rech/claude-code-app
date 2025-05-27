const { initTRPC } = require('@trpc/server');
const { z } = require('zod');
const { gitService } = require('../git-service');
const { dialog } = require('electron');

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
  }),

  system: router({
    getAppVersion: procedure
      .query(() => {
        return process.env.npm_package_version || '1.0.0';
      }),
  }),
});

module.exports = { router, procedure, appRouter };