const { spawn } = require('child_process');

/**
 * Execute a command and return its output with proper streaming
 * @param {string} command - Command to execute
 * @param {import('./claude-code-types').CommandOptions} [options] - Command options
 * @param {EventEmitter} [emitter] - EventEmitter to emit JSON lines
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
async function executeCommand(command, options = {}, emitter = null) {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let allStdout = '';
    let allStderr = '';
    let buffer = '';
    
    // Handle stdout streaming
    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      allStdout += chunk;
      
      if (options.verbose !== false) {
        process.stdout.write(`STDOUT: ${chunk}`);
      }
      
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
              // Not valid JSON, emit as raw text
              emitter.emit('raw', trimmed);
            }
          }
        }
      }
    });
    
    // Handle stderr streaming  
    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      allStderr += chunk;
      
      if (options.verbose !== false) {
        process.stderr.write(`STDERR: ${chunk}`);
      }
    });
    
    // Handle process completion
    child.on('close', (code) => {
      // Handle any remaining buffer content
      if (emitter && buffer.trim()) {
        try {
          const json = JSON.parse(buffer.trim());
          emitter.emit('json', json);
        } catch (e) {
          emitter.emit('raw', buffer.trim());
        }
      }
      
      resolve({
        stdout: allStdout,
        stderr: allStderr,
        exitCode: code || 0,
      });
    });
    
    // Handle process errors
    child.on('error', (error) => {
      reject({
        stdout: allStdout,
        stderr: error.message,
        exitCode: 1,
      });
    });
    
    // Set timeout if specified
    if (options.timeout) {
      setTimeout(() => {
        child.kill('SIGTERM');
        reject({
          stdout: allStdout,
          stderr: 'Process timed out',
          exitCode: 1,
        });
      }, options.timeout);
    }
  });
}

/**
 * Stream a command with inherited stdio
 * @param {string} command - Command to execute
 * @param {import('./claude-code-types').CommandOptions} [options] - Command options
 * @returns {Promise}
 */
function streamCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: 'inherit'
    });
    
    child.on('close', (code) => {
      resolve({ exitCode: code || 0 });
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