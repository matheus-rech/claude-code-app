import { diffWordsWithSpace } from "diff"
import parseDiff, { type File, type Chunk, type Change } from "parse-diff"
import {
  type HighlighterGeneric,
  bundledLanguages,
  createHighlighter,
} from "shiki"

let highlighter: HighlighterGeneric<any, any> | null = null

// Common languages for preloading
const commonLanguages = [
  "typescript",
  "javascript",
  "tsx",
  "jsx",
  "json",
  "html",
  "css",
  "scss",
  "python",
  "rust",
  "go",
  "java",
  "c",
  "cpp",
  "bash",
  "markdown",
  "yaml",
  "xml",
]

async function getHighlighter() {
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: ["github-dark", "github-light"],
      langs: commonLanguages,
    })
  }
  return highlighter
}

// Preload highlighter asynchronously
export function preloadHighlighter() {
  setTimeout(() => {
    getHighlighter().catch(console.warn)
  }, 100)
}

export interface ProcessedDiffFile {
  from?: string
  to?: string
  deletions?: number
  additions?: number
  chunks: ProcessedChunk[]
}

export interface ProcessedChunk {
  content: string
  changes: ProcessedChange[]
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
}

export type ProcessedChange = {
  tokens?: Array<{
    content: string
    color?: string
    fontStyle?: string
    isWordDiff?: boolean
    diffType?: "added" | "removed"
  }>
} & Change

function getLanguageFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase()

  const langMap: Record<string, string> = {
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    py: "python",
    rb: "ruby",
    php: "php",
    java: "java",
    c: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    go: "go",
    rs: "rust",
    kt: "kotlin",
    swift: "swift",
    html: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    json: "json",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    sh: "bash",
    bash: "bash",
    zsh: "zsh",
    fish: "fish",
    ps1: "powershell",
    sql: "sql",
    r: "r",
    dockerfile: "dockerfile",
  }

  return langMap[ext || ""] || "text"
}

async function highlightCode(
  code: string,
  language: string,
  theme: "dark" | "light" = "dark",
) {
  try {
    const hl = await getHighlighter()
    const themeName = theme === "dark" ? "github-dark" : "github-light"

    // Ensure language is supported
    const supportedLangs = hl.getLoadedLanguages()
    const langToUse = supportedLangs.includes(language) ? language : "text"

    const tokens = hl.codeToTokens(code, {
      lang: langToUse,
      theme: themeName,
    })

    return tokens.tokens.map((line) =>
      line.map((token) => ({
        content: token.content,
        color: token.color,
        fontStyle: token.fontStyle,
      })),
    )
  } catch (error) {
    // Fallback to plain text if highlighting fails
    return code.split("\n").map((line) => [
      {
        content: line,
        color: undefined,
        fontStyle: undefined,
      },
    ])
  }
}

function processWordLevelDiff(oldContent: string, newContent: string) {
  const changes = diffWordsWithSpace(oldContent, newContent)
  const oldTokens: Array<{ content: string; diffType?: "removed" }> = []
  const newTokens: Array<{ content: string; diffType?: "added" }> = []

  changes.forEach((change) => {
    if (change.removed) {
      oldTokens.push({ content: change.value, diffType: "removed" })
    } else if (change.added) {
      newTokens.push({ content: change.value, diffType: "added" })
    } else {
      oldTokens.push({ content: change.value })
      newTokens.push({ content: change.value })
    }
  })

  return { oldTokens, newTokens }
}

export async function processDiff(
  diffText: string,
  theme: "dark" | "light" = "dark",
): Promise<ProcessedDiffFile[]> {
  if (!diffText.trim()) {
    return []
  }

  const files = parseDiff(diffText)
  const processedFiles: ProcessedDiffFile[] = []

  for (const file of files) {
    const language = getLanguageFromFilename(file.to || file.from || "")
    const processedChunks: ProcessedChunk[] = []

    for (const chunk of file.chunks) {
      const processedChanges: ProcessedChange[] = []

      // Group adjacent changes for word-level diffing
      let i = 0
      while (i < chunk.changes.length) {
        const change = chunk.changes[i]

        if (change.type === "del") {
          // Look for an adjacent add to do word-level diff
          const nextChange = chunk.changes[i + 1]
          if (nextChange && nextChange.type === "add") {
            // Process word-level diff between deleted and added lines
            const { oldTokens, newTokens } = processWordLevelDiff(
              change.content.slice(1), // Remove leading - or +
              nextChange.content.slice(1),
            )

            // Highlight the content
            const oldHighlighted = await highlightCode(
              change.content.slice(1),
              language,
              theme,
            )
            const newHighlighted = await highlightCode(
              nextChange.content.slice(1),
              language,
              theme,
            )

            processedChanges.push({
              ...change,
              tokens: mergeHighlightingWithWordDiff(
                oldHighlighted[0]?.map(t => ({
                  ...t,
                  fontStyle: t.fontStyle ? String(t.fontStyle) : undefined
                })) || [],
                oldTokens,
              ),
            })

            processedChanges.push({
              ...nextChange,
              tokens: mergeHighlightingWithWordDiff(
                newHighlighted[0]?.map(t => ({
                  ...t,
                  fontStyle: t.fontStyle ? String(t.fontStyle) : undefined
                })) || [],
                newTokens,
              ),
            })

            i += 2 // Skip the next change since we processed it
          } else {
            // Regular deletion
            const highlighted = await highlightCode(
              change.content.slice(1),
              language,
              theme,
            )
            processedChanges.push({
              ...change,
              tokens: highlighted[0]?.map(token => ({
                ...token,
                fontStyle: token.fontStyle ? String(token.fontStyle) : undefined
              })) || [],
            })
            i++
          }
        } else {
          // Normal or add change
          const content =
            change.type === "normal" ? change.content : change.content.slice(1)
          const highlighted = await highlightCode(content, language, theme)
          processedChanges.push({
            ...change,
            tokens: highlighted[0]?.map(token => ({
              ...token,
              fontStyle: token.fontStyle ? String(token.fontStyle) : undefined
            })) || [],
          })
          i++
        }
      }

      processedChunks.push({
        ...chunk,
        changes: processedChanges,
      })
    }

    processedFiles.push({
      from: file.from,
      to: file.to,
      deletions: file.deletions,
      additions: file.additions,
      chunks: processedChunks,
    } as ProcessedDiffFile)
  }

  return processedFiles
}

function mergeHighlightingWithWordDiff(
  syntaxTokens: Array<{ content: string; color?: string; fontStyle?: string }>,
  wordDiffTokens: Array<{ content: string; diffType?: "added" | "removed" }>,
) {
  const result: Array<{
    content: string
    color?: string
    fontStyle?: string
    isWordDiff?: boolean
    diffType?: "added" | "removed"
  }> = []

  let syntaxIndex = 0
  let syntaxOffset = 0
  let wordIndex = 0
  let wordOffset = 0

  while (
    wordIndex < wordDiffTokens.length &&
    syntaxIndex < syntaxTokens.length
  ) {
    const wordToken = wordDiffTokens[wordIndex]
    const syntaxToken = syntaxTokens[syntaxIndex]

    const wordRemaining = wordToken.content.slice(wordOffset)
    const syntaxRemaining = syntaxToken.content.slice(syntaxOffset)

    if (wordRemaining.length <= syntaxRemaining.length) {
      // Word token fits within syntax token
      result.push({
        content: wordRemaining,
        color: syntaxToken.color,
        fontStyle: syntaxToken.fontStyle,
        isWordDiff: !!wordToken.diffType,
        diffType: wordToken.diffType,
      })

      syntaxOffset += wordRemaining.length
      wordIndex++
      wordOffset = 0

      if (syntaxOffset >= syntaxToken.content.length) {
        syntaxIndex++
        syntaxOffset = 0
      }
    } else {
      // Syntax token is smaller than word token
      result.push({
        content: syntaxRemaining,
        color: syntaxToken.color,
        fontStyle: syntaxToken.fontStyle,
        isWordDiff: !!wordToken.diffType,
        diffType: wordToken.diffType,
      })

      wordOffset += syntaxRemaining.length
      syntaxIndex++
      syntaxOffset = 0
    }
  }

  return result
}
