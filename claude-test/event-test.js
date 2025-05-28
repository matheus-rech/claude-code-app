const { ClaudeCode } = require("./index")

async function eventTest() {
  console.log("Testing ClaudeCode event emission...")

  const claudeCode = new ClaudeCode({
    verbose: true,
    workingDirectory: process.cwd(),
  })

  const jsonEvents = []
  const rawEvents = []

  // Listen for JSON events
  claudeCode.on("json", (data) => {
    console.log("\n🔥 JSON EVENT:", JSON.stringify(data, null, 2))
    jsonEvents.push(data)
  })

  // Listen for raw text events
  claudeCode.on("raw", (data) => {
    console.log("\n📝 RAW EVENT:", data)
    rawEvents.push(data)
  })

  try {
    console.log("\nTesting simple math question...")
    const response = await claudeCode.chat("what is 2+2?")

    console.log("\n✅ Final response:", JSON.stringify(response, null, 2))
    console.log(
      `\n📊 Events received: ${jsonEvents.length} JSON, ${rawEvents.length} raw`,
    )

    console.log("\n🎯 JSON Event Types:")
    jsonEvents.forEach((event, i) => {
      console.log(
        `  ${i + 1}. ${event.type}${event.subtype ? `:${event.subtype}` : ""}`,
      )
    })
  } catch (error) {
    console.error("\n💥 ERROR:", error.message)
  }
}

eventTest()
