import { initTRPC } from "@trpc/server"
import { z } from "zod"
import { BrowserWindow } from "electron"
import { ClaudeCode } from "../../main/services/claude-code"
import { gitService } from "../../main/services/git-service"

const t = initTRPC.create()
const router = t.router
const procedure = t.procedure

// Session management
let currentSessionId: string | null = null

const appRouter = router({
  git: router({
    openRepository: procedure
      .input(z.string().optional())
      .mutation(async ({ input: repoPath }) => {
        let selectedPath = repoPath

        if (!selectedPath) {
          selectedPath = "/Users/philipp/dev/headlessui-elements"
        }

        return await gitService.openRepository(selectedPath)
      }),

    getStatus: procedure
      .input(z.string())
      .query(async ({ input: repoPath }) => {
        return await gitService.getStatus(repoPath)
      }),

    stageFile: procedure
      .input(
        z.object({
          repoPath: z.string(),
          filePath: z.string(),
        }),
      )
      .mutation(async ({ input }) => {
        await gitService.stageFile(input.repoPath, input.filePath)
        return { success: true }
      }),

    unstageFile: procedure
      .input(
        z.object({
          repoPath: z.string(),
          filePath: z.string(),
        }),
      )
      .mutation(async ({ input }) => {
        await gitService.unstageFile(input.repoPath, input.filePath)
        return { success: true }
      }),

    resetFile: procedure
      .input(
        z.object({
          repoPath: z.string(),
          filePath: z.string(),
        }),
      )
      .mutation(async ({ input }) => {
        await gitService.resetFile(input.repoPath, input.filePath)
        return { success: true }
      }),

    commit: procedure
      .input(
        z.object({
          repoPath: z.string(),
          message: z.string().min(1, "Commit message is required"),
        }),
      )
      .mutation(async ({ input }) => {
        await gitService.commit(input.repoPath, input.message)
        return { success: true }
      }),

    getBranches: procedure
      .input(z.string())
      .query(async ({ input: repoPath }) => {
        return await gitService.getBranches(repoPath)
      }),

    getFileDiff: procedure
      .input(
        z.object({
          repoPath: z.string(),
          filePath: z.string(),
          staged: z.boolean().optional().default(false),
        }),
      )
      .query(async ({ input }) => {
        return await gitService.getFileDiff(
          input.repoPath,
          input.filePath,
          input.staged,
        )
      }),
  }),

  system: router({
    getAppVersion: procedure.query(() => {
      return process.env.npm_package_version || "1.0.0"
    }),
  }),

  claudeCode: router({
    sendMessage: procedure
      .input(
        z.object({
          message: z.string(),
          verbose: z.boolean().optional().default(false),
          repoPath: z.string().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const workingDir =
          input.repoPath || "/Users/philipp/dev/headlessui-elements"
        const claudeCode = new ClaudeCode({
          verbose: input.verbose,
          workingDirectory: workingDir,
        })

        // Start the chat asynchronously - don't await
        claudeCode.chat(input.message, currentSessionId).then((response) => {
          if (response.success && response.sessionId) {
            currentSessionId = response.sessionId
          }
        }).catch((error) => {
          console.error("Claude Code chat error:", error)
          // Send error message via IPC
          if (BrowserWindow.getAllWindows().length > 0) {
            BrowserWindow.getAllWindows()[0].webContents.send(
              "claude-code-message",
              {
                type: "error",
                content: error.message || "Unknown error occurred",
                timestamp: new Date().toISOString(),
              },
            )
          }
        })

        // Return immediately with a pending status
        return {
          content: "Processing message...",
          sessionId: currentSessionId,
          success: true,
          pending: true,
        }
      }),

    version: procedure.query(async () => {
      const claudeCode = new ClaudeCode()
      return await claudeCode.version()
    }),
  }),
})

export { appRouter, router, procedure }
export type AppRouter = typeof appRouter
