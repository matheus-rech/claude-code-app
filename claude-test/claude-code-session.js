/**
 * Session management for Claude Code interactions
 */
class Session {
  constructor(claudeCode, sessionId = null) {
    this.claudeCode = claudeCode
    this.sessionId = sessionId
    this.messages = []
  }

  /**
   * Send a prompt to Claude and get response
   * @param {import('./claude-code-types').PromptInput} promptInput
   * @returns {Promise<import('./claude-code-types').ClaudeCodeResponse>}
   */
  async prompt(promptInput) {
    const response = await this.claudeCode.chat(promptInput, this.sessionId)

    if (response.success && response.message) {
      this.sessionId = response.message.session_id
      this.messages.push({
        input: promptInput,
        response: response.message,
      })
    }

    return response
  }

  /**
   * Fork this session to create a new one with the same history
   * @returns {Session}
   */
  fork() {
    const newSession = new Session(this.claudeCode, this.sessionId)
    newSession.messages = [...this.messages]
    return newSession
  }

  /**
   * Revert the last n messages
   * @param {number} [count=1] - Number of messages to revert
   */
  revert(count = 1) {
    this.messages.splice(-count, count)
    // Note: This doesn't actually revert the Claude session, just local tracking
  }

  /**
   * Get the current session ID
   * @returns {string|null}
   */
  getSessionId() {
    return this.sessionId
  }

  /**
   * Get all messages in this session
   * @returns {Array}
   */
  getMessages() {
    return [...this.messages]
  }
}

module.exports = { Session }
