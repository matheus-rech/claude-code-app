import { spawn } from "node:child_process"
import { EventEmitter } from "node:events"
import { BrowserWindow } from "electron"

// Type definitions
interface ExecuteOptions {
  cwd?: string
  env?: Record<string, string>
}

interface ExecuteResult {
  stdout: string
  stderr: string
  exitCode: number
}

interface ClaudeMessage {
  type: "system" | "assistant" | "user"
  content: string
  timestamp: string
}

interface ClaudeJsonMessage {
  type: string
  subtype?: string
  session_id?: string
  tools?: any[]
  message?: {
    content?: any[] | string
  }
  duration_ms?: number
  num_turns?: number
  cost_usd?: number
  name?: string
  input?: Record<string, any>
}

interface ClaudeFinalResult {
  type: string
  result?: string
  session_id: string
  num_turns: number
  is_error: boolean
  cost_usd: number
  duration_ms: number
  duration_api_ms: number
}

interface ClaudeCodeResponse {
  success: boolean
  message?: ClaudeFinalResult
  content?: ClaudeMessage[]
  sessionId?: string | null
  allMessages?: ClaudeMessage[]
  error?: {
    code: string
    message: string
    details: any
  }
  exitCode?: number
}

/**
 * Execute a command and return the result
 */
async function executeCommand(
  command: string,
  options: ExecuteOptions = {},
  emitter: EventEmitter | null = null,
): Promise<ExecuteResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("sh", ["-c", command], {
      cwd: options.cwd || process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...options.env },
    })

    // Add timeout to prevent hanging
    const timeout = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error("Command timed out after 60 seconds"))
    }, 60000)

    let stdout = ""
    let stderr = ""
    let buffer = ""

    child.stdout.on("data", (data) => {
      const chunk = data.toString()
      stdout += chunk

      // Emit JSON lines if emitter is provided
      if (emitter) {
        buffer += chunk
        const lines = buffer.split("\n")
        buffer = lines.pop() || "" // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed) {
            try {
              const json = JSON.parse(trimmed)
              emitter.emit("json", json)
            } catch (e) {
              emitter.emit("raw", trimmed)
            }
          }
        }
      }
    })

    child.stderr.on("data", (data) => {
      stderr += data.toString()
    })

    child.on("close", (code) => {
      clearTimeout(timeout)

      // Process any remaining buffer content
      if (emitter && buffer.trim()) {
        try {
          const json = JSON.parse(buffer.trim())
          emitter.emit("json", json)
        } catch (e) {
          emitter.emit("raw", buffer.trim())
        }
      }

      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code || 0,
      })
    })

    child.on("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })
}

/**
 * Main ClaudeCode class for interacting with Claude CLI
 */
interface ClaudeCodeOptions {
  claudeCodePath?: string
  workingDirectory?: string
  verbose?: boolean
  model?: string
}

class ClaudeCode extends EventEmitter {
  private options: ClaudeCodeOptions

  constructor(options: ClaudeCodeOptions = {}) {
    super()
    this.options = {
      claudeCodePath: "npx @anthropic-ai/claude-code",
      workingDirectory: process.cwd(),
      verbose: false,
      ...options,
    }
  }

  defaultArgs(): string[] {
    const args: string[] = []

    if (this.options.verbose) {
      args.push("--verbose")
    }

    if (this.options.model) {
      args.push("--model", this.options.model)
    }

    // Always add dangerous skip permissions for automated usage
    args.push("--dangerously-skip-permissions")

    return args
  }

  async chat(
    promptInput: string | { prompt: string; systemPrompt?: string },
    sessionId: string | null = null,
  ): Promise<ClaudeCodeResponse> {
    try {
      const prompt =
        typeof promptInput === "string" ? promptInput : promptInput.prompt
      // const systemPrompt =
      //   typeof promptInput === "object" ? promptInput.systemPrompt : null

      const args = [...this.defaultArgs()]
      args.push("--print")
      args.push("--output-format", "stream-json")

      if (sessionId && sessionId !== "persistent") {
        args.push("--resume", sessionId)
      } else if (sessionId === "persistent") {
        args.push("--resume", "persistent")
      }

      // Use piped input instead of command argument to avoid hanging
      const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, "\\n")
      const command = `echo "${escapedPrompt}" | ${this.options.claudeCodePath} ${args.join(" ")}`

      if (this.options.verbose) {
        console.log("Executing command:", command)
      }

      // Set up real-time message streaming
      const allMessages: ClaudeMessage[] = []
      let finalResult: ClaudeFinalResult | null = null
      let capturedSessionId: string | null = null

      // Process JSON chunks as they arrive
      this.on("json", (json: ClaudeJsonMessage) => {
        // Store session ID from system init
        if (
          json.type === "system" &&
          json.subtype === "init" &&
          json.session_id
        ) {
          capturedSessionId = json.session_id
          const message: ClaudeMessage = {
            type: "system",
            content: `🔧 Claude Code initialized with ${json.tools?.length || 0} tools available`,
            timestamp: new Date().toISOString(),
          }
          allMessages.push(message)

          // Send immediately via IPC
          if (BrowserWindow.getAllWindows().length > 0) {
            BrowserWindow.getAllWindows()[0].webContents.send(
              "claude-code-message",
              message,
            )
          }
        }

        // Handle assistant messages
        else if (
          json.type === "assistant" &&
          json.message &&
          json.message.content
        ) {
          if (Array.isArray(json.message.content)) {
            for (const contentItem of json.message.content) {
              if (contentItem.type === "text" && contentItem.text) {
                const message: ClaudeMessage = {
                  type: "assistant",
                  content: contentItem.text,
                  timestamp: new Date().toISOString(),
                }
                allMessages.push(message)

                // Send immediately via IPC
                if (BrowserWindow.getAllWindows().length > 0) {
                  BrowserWindow.getAllWindows()[0].webContents.send(
                    "claude-code-message",
                    message,
                  )
                }
              } else if (contentItem.type === "tool_use") {
                const message: ClaudeMessage = {
                  type: "system",
                  content: `🔧 Using tool: ${contentItem.name}${contentItem.input ? ` with ${Object.keys(contentItem.input).join(", ")}` : ""}`,
                  timestamp: new Date().toISOString(),
                }
                allMessages.push(message)

                // Send immediately via IPC
                if (BrowserWindow.getAllWindows().length > 0) {
                  BrowserWindow.getAllWindows()[0].webContents.send(
                    "claude-code-message",
                    message,
                  )
                }
              }
            }
          }
        }

        // Handle tool results
        else if (json.type === "user" && json.message && json.message.content) {
          if (Array.isArray(json.message.content)) {
            for (const contentItem of json.message.content) {
              if (contentItem.type === "tool_result" && contentItem.content) {
                const preview =
                  typeof contentItem.content === "string"
                    ? contentItem.content.substring(0, 100) +
                      (contentItem.content.length > 100 ? "..." : "")
                    : "[Tool result]"
                const message: ClaudeMessage = {
                  type: "system",
                  content: `📄 Tool result: ${preview}`,
                  timestamp: new Date().toISOString(),
                }
                allMessages.push(message)

                // Send immediately via IPC
                if (BrowserWindow.getAllWindows().length > 0) {
                  BrowserWindow.getAllWindows()[0].webContents.send(
                    "claude-code-message",
                    message,
                  )
                }
              }
            }
          }
        }

        // Store final result for session info
        else if (json.type === "result") {
          finalResult = json as ClaudeFinalResult
          const message: ClaudeMessage = {
            type: "system",
            content: `✅ Completed in ${json.duration_ms}ms (${json.num_turns} turns, $${json.cost_usd?.toFixed(4) || "0.0000"})`,
            timestamp: new Date().toISOString(),
          }
          allMessages.push(message)

          // Send immediately via IPC
          if (BrowserWindow.getAllWindows().length > 0) {
            BrowserWindow.getAllWindows()[0].webContents.send(
              "claude-code-message",
              message,
            )
          }
        }
      })

      const result: ExecuteResult = await executeCommand(
        command,
        {
          cwd: this.options.workingDirectory,
        },
        this,
      )

      if (result.exitCode === 0) {
        console.log("=== CLAUDE CODE RESPONSE ===")
        console.log("result.stdout:", result.stdout)
        console.log("allMessages:", allMessages)
        console.log("finalResult:", finalResult)

        return {
          success: true,
          message: finalResult || {
            type: "text",
            result:
              allMessages.length > 0
                ? "Multiple messages processed"
                : result.stdout,
            session_id: capturedSessionId || "unknown",
            num_turns: 1,
            is_error: false,
            cost_usd: 0,
            duration_ms: 0,
            duration_api_ms: 0,
          },
          content: allMessages,
          sessionId: capturedSessionId,
          allMessages: allMessages,
        }
      }
      return {
        success: false,
        error: {
          code: "COMMAND_FAILED",
          message: result.stderr || "Command execution failed",
          details: result,
        },
        exitCode: result.exitCode,
      }
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "EXECUTION_ERROR",
          message: error.message,
          details: error,
        },
      }
    }
  }

  async version(): Promise<string> {
    const response = await this.runCommand(["--version"])
    return response.success && response.message
      ? response.message.result?.trim() || "unknown"
      : "unknown"
  }

  async runCommand(args: string[]): Promise<ClaudeCodeResponse> {
    try {
      const command = `${this.options.claudeCodePath} ${args.join(" ")}`

      if (this.options.verbose) {
        console.log("Executing command:", command)
      }

      const result: ExecuteResult = await executeCommand(command, {
        cwd: this.options.workingDirectory,
      })

      return {
        success: result.exitCode === 0,
        message:
          result.exitCode === 0
            ? {
                type: "command",
                result: result.stdout,
                session_id: "command",
                num_turns: 1,
                is_error: false,
                cost_usd: 0,
                duration_ms: 0,
                duration_api_ms: 0,
              }
            : undefined,
        error:
          result.exitCode !== 0
            ? {
                code: "COMMAND_FAILED",
                message: result.stderr || "Command failed",
                details: result,
              }
            : undefined,
        exitCode: result.exitCode,
      }
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "EXECUTION_ERROR",
          message: error.message,
          details: error,
        },
      }
    }
  }
}

export { ClaudeCode }
