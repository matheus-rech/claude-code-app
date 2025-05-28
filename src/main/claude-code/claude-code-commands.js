const { spawn } = require('child_process');

/**
 * Execute a command and return the result
 * @param {string} command - Command to execute
 * @param {object} options - Execution options
 * @param {EventEmitter} emitter - Optional event emitter for streaming
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
async function executeCommand(command, options = {}, emitter = null) {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], {
      cwd: options.cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...options.env },
    });

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
      reject(error);
    });
  });
}

/**
 * Stream command execution
 * @param {string} command - Command to execute
 * @param {object} options - Execution options
 * @param {function} onData - Callback for data chunks
 * @returns {Promise<{exitCode: number}>}
 */
async function streamCommand(command, options = {}, onData = null) {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], {
      cwd: options.cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...options.env },
    });

    let buffer = '';

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      
      if (onData) {
        // Try to parse JSON lines for streaming
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            try {
              const json = JSON.parse(trimmed);
              onData(json, 'json');
            } catch (e) {
              onData(trimmed, 'raw');
            }
          }
        }
      }
    });

    child.stderr.on('data', (data) => {
      if (onData) {
        onData(data.toString(), 'stderr');
      }
    });

    child.on('close', (code) => {
      // Process any remaining buffer content
      if (onData && buffer.trim()) {
        try {
          const json = JSON.parse(buffer.trim());
          onData(json, 'json');
        } catch (e) {
          onData(buffer.trim(), 'raw');
        }
      }
      
      resolve({
        exitCode: code || 0,
      });
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

module.exports = {
  executeCommand,
  streamCommand,
};