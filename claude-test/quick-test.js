const { ClaudeCode } = require('./index');

async function quickTest() {
  console.log('Quick test of claude-code integration...');
  
  const claudeCode = new ClaudeCode({
    verbose: true,
    workingDirectory: process.cwd()
  });
  
  try {
    console.log('\nTesting simple math question...');
    const response = await claudeCode.chat('what is 1+1?');
    console.log('\nResponse received:', JSON.stringify(response, null, 2));
    
    if (response.success && response.message) {
      console.log('\n✅ SUCCESS! Claude answered:', response.message.result);
      console.log('Session ID:', response.message.session_id);
    } else {
      console.log('\n❌ FAILED:', response.error?.message || 'Unknown error');
    }
  } catch (error) {
    console.error('\n💥 ERROR:', error.message);
  }
}

quickTest();