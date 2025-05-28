const { ClaudeCode } = require("./index");

async function debugClaudeCode() {
  console.log("Starting Claude Code debug session...");

  try {
    // Initialize with no API key, no model, verbose yes, current working directory
    const claudeCode = new ClaudeCode({
      verbose: true,
      workingDirectory: process.cwd(),
    });

    console.log("Claude Code initialized with config:", {
      apiKey: null,
      model: null,
      verbose: true,
      workingDirectory: process.cwd(),
    });

    // Ask first question: "what is 1+1"
    console.log('\nAsking first question: "what is 1+1"');
    const response1 = await claudeCode.chat("what is 1+1");
    console.log("Response 1:", response1);

    // Wait a moment
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Ask second question: "go to the homepage of google.com, take a screenshot, and figure out where i'm from"
    console.log(
      '\nAsking second question: "go to the homepage of google.com, take a screenshot, and figure out where i\'m from"'
    );
    const response2 = await claudeCode.chat(
      "go to the homepage of google.com, take a screenshot, and figure out where i'm from"
    );
    console.log("Response 2:", response2);
  } catch (error) {
    console.error("Error during debug session:", error);
    console.error("Error stack:", error.stack);
  }
}

// Run the debug function
debugClaudeCode()
  .then(() => {
    console.log("\nDebug session completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
