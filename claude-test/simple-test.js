const execa = require("execa")

async function simpleTest() {
  console.log("Testing basic command execution...")

  try {
    console.log("\n1. Testing basic echo command:")
    const echo = await execa("echo", ["hello world"])
    console.log("Echo result:", echo.stdout)

    console.log("\n2. Testing claude version:")
    const version = await execa("claude", ["--version"])
    console.log("Claude version:", version.stdout)

    console.log("\n3. Testing claude with simple question:")
    const child = execa("claude", [
      "--print",
      "--output-format",
      "stream-json",
      "what is 1+1?",
    ])

    child.stdout.on("data", (data) => {
      console.log("STDOUT chunk:", data.toString())
    })

    child.stderr.on("data", (data) => {
      console.log("STDERR chunk:", data.toString())
    })

    const result = await child
    console.log("Final result:", result.stdout)
  } catch (error) {
    console.error("Error:", error.message)
    if (error.stdout) console.log("Error stdout:", error.stdout)
    if (error.stderr) console.log("Error stderr:", error.stderr)
  }
}

simpleTest()
