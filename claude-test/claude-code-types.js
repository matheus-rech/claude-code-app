// Types converted to JSDoc comments for JavaScript

/**
 * @typedef {Object} ClaudeCodeOptions
 * @property {string} [claudeCodePath] - Path to claude command
 * @property {string} [apiKey] - API key for Claude
 * @property {string} [model] - Model to use
 * @property {string} [workingDirectory] - Working directory
 * @property {boolean} [verbose] - Verbose output
 */

/**
 * @typedef {Object} ClaudeCodeMessage
 * @property {string} type
 * @property {string} subtype
 * @property {number} cost_usd
 * @property {number} duration_ms
 * @property {number} duration_api_ms
 * @property {boolean} is_error
 * @property {number} num_turns
 * @property {string} result
 * @property {string} session_id
 */

/**
 * @typedef {Object} ClaudeCodeResponse
 * @property {boolean} success
 * @property {ClaudeCodeMessage} [message]
 * @property {ClaudeCodeError} [error]
 * @property {number} [exitCode]
 */

/**
 * @typedef {Object} ClaudeCodeError
 * @property {string} code
 * @property {string} message
 * @property {any} [details]
 */

/**
 * @typedef {Object} CommandOptions
 * @property {string} [cwd]
 * @property {Object} [env]
 * @property {number} [timeout]
 * @property {boolean} [shell]
 */

/**
 * @typedef {Object} Prompt
 * @property {string} prompt
 * @property {string} [systemPrompt]
 * @property {boolean} [appendSystemPrompt]
 */

/**
 * @typedef {Prompt|string} PromptInput
 */

module.exports = {
  // Export types for JSDoc reference
}
