const { executeCommand } = require('./claude-code-commands');
const { Session } = require('./claude-code-session');
const { EventEmitter } = require('events');

/**
 * Main ClaudeCode class for interacting with Claude CLI
 */
class ClaudeCode extends EventEmitter {
  /**
   * @param {import('./claude-code-types').ClaudeCodeOptions} [options]
   */
  constructor(options = {}) {
    super();
    this.options = {
      claudeCodePath: 'npx @anthropic-ai/claude-code',
      workingDirectory: process.cwd(),
      verbose: false,
      ...options,
    };
  }

  /**
   * Get default arguments for claude command
   * @returns {string[]}
   */
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

  /**
   * Send a chat message to Claude
   * @param {import('./claude-code-types').PromptInput} promptInput
   * @param {string} [sessionId] - Session ID to continue
   * @returns {Promise<import('./claude-code-types').ClaudeCodeResponse>}
   */
  async chat(promptInput, sessionId = null) {
    try {
      const prompt = typeof promptInput === 'string' ? promptInput : promptInput.prompt;
      const systemPrompt = typeof promptInput === 'object' ? promptInput.systemPrompt : null;
      
      const args = [...this.defaultArgs()];
      args.push('--output-format', 'json');
      
      if (sessionId) {
        args.push('--resume', sessionId);
      }
      
      // Use piped input instead of command argument to avoid hanging
      const command = `echo "${prompt.replace(/"/g, '\\"')}" | ${this.options.claudeCodePath} ${args.join(' ')}`;
      
      if (this.options.verbose) {
        console.log('Executing command:', command);
      }
      
      const result = await executeCommand(command, {
        cwd: this.options.workingDirectory,
      }, this);
      
      if (result.exitCode === 0) {
        try {
          const message = JSON.parse(result.stdout);
          return {
            success: true,
            message,
            content: message.assistant || message.result || result.stdout,
          };
        } catch (parseError) {
          // If JSON parsing fails, treat as plain text response
          return {
            success: true,
            message: {
              type: 'text',
              result: result.stdout,
              session_id: sessionId || 'unknown',
              num_turns: 1,
              is_error: false,
              cost_usd: 0,
              duration_ms: 0,
              duration_api_ms: 0,
            },
            content: result.stdout,
          };
        }
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

  /**
   * Run a raw command
   * @param {string[]} args - Command arguments
   * @returns {Promise<import('./claude-code-types').ClaudeCodeResponse>}
   */
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

  /**
   * Get Claude version
   * @returns {Promise<string>}
   */
  async version() {
    const response = await this.runCommand(['--version']);
    return response.success ? response.message.result.trim() : 'unknown';
  }

  /**
   * Set options
   * @param {import('./claude-code-types').ClaudeCodeOptions} options
   */
  setOptions(options) {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current options
   * @returns {import('./claude-code-types').ClaudeCodeOptions}
   */
  getOptions() {
    return { ...this.options };
  }

  /**
   * Create a new session
   * @param {string} [sessionId] - Existing session ID to resume
   * @returns {Session}
   */
  newSession(sessionId = null) {
    return new Session(this, sessionId);
  }
}

module.exports = { ClaudeCode };