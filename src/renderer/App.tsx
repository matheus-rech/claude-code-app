import React, { useState } from "react"
import ChatInterface from "./components/ChatInterface"
import DiffViewer from "./components/DiffViewer"
import { trpc } from "./trpc"

type GitView = "changes" | "history"

interface Repository {
  path: string
  name: string
}

function App() {
  const [currentView, setCurrentView] = useState<GitView>("changes")
  const [repository, setRepository] = useState<Repository | null>(null)
  const [selectedView, setSelectedView] = useState<"file" | "chat" | null>(null)
  const [selectedFile, setSelectedFile] = useState<{
    file: string
    staged: boolean
  } | null>(null)

  const openRepositoryMutation = trpc.git.openRepository.useMutation({
    onSuccess: (data) => {
      setRepository(data)
    },
    onError: (error) => {
      console.error("Failed to open repository:", error)
      alert(`Failed to open repository: ${error.message}`)
    },
  })

  const gitStatusMutation = trpc.git.getStatus.useMutation({
    onSuccess: (data) => {
      const statusText = `Git Status:
Modified: ${data.modified?.length || 0} files
Staged: ${data.staged?.length || 0} files  
Untracked: ${data.untracked?.length || 0} files
Deleted: ${data.deleted?.length || 0} files

Current branch: ${data.current || "unknown"}`
      alert(statusText)
    },
    onError: (error) => {
      alert(`Failed to get git status: ${error.message}`)
    },
  })

  const handleOpenRepository = () => {
    openRepositoryMutation.mutate()
  }

  const handleGetGitStatus = () => {
    if (repository) {
      gitStatusMutation.mutate(repository.path)
    } else {
      alert("No repository selected. Please open a repository first.")
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      <div
        className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2"
        style={{ paddingTop: "32px" }}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            {repository ? repository.name : "Git Tower Clone"}
          </h1>
        </div>
      </div>

      {repository && (
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex">
            <button
              type="button"
              onClick={() => setCurrentView("changes")}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${
                currentView === "changes"
                  ? "border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              Changes
            </button>
            <button
              type="button"
              onClick={() => setCurrentView("history")}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${
                currentView === "history"
                  ? "border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              History
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex">
        {!repository ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-600 dark:text-gray-400 mb-2">
                Welcome to Git Tower Clone
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Select a repository to get started
              </p>
              <button
                type="button"
                onClick={handleOpenRepository}
                disabled={openRepositoryMutation.isPending}
                className="px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded hover:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-50 inline-block"
              >
                {openRepositoryMutation.isPending
                  ? "Opening..."
                  : "Open Repository"}
              </button>
            </div>
          </div>
        ) : currentView === "changes" ? (
          <ChangesView
            repository={repository}
            selectedView={selectedView}
            setSelectedView={setSelectedView}
            selectedFile={selectedFile}
            setSelectedFile={setSelectedFile}
          />
        ) : (
          <HistoryView repository={repository} />
        )}
      </div>
    </div>
  )
}

function ChangesView({
  repository,
  selectedView,
  setSelectedView,
  selectedFile,
  setSelectedFile,
}: {
  repository: Repository
  selectedView: "file" | "chat" | null
  setSelectedView: (view: "file" | "chat" | null) => void
  selectedFile: { file: string; staged: boolean } | null
  setSelectedFile: (file: { file: string; staged: boolean } | null) => void
}) {
  const {
    data: status,
    isLoading,
    error,
  } = trpc.git.getStatus.useQuery(repository.path, {
    refetchInterval: 2000, // Refresh every 2 seconds
  })

  const {
    data: diffData,
    isLoading: diffLoading,
    error: diffError,
  } = trpc.git.getFileDiff.useQuery(
    {
      repoPath: repository.path,
      filePath: selectedFile?.file || "",
      staged: selectedFile?.staged || false,
    },
    {
      enabled: !!selectedFile,
    },
  )

  const utils = trpc.useUtils()

  const stageFileMutation = trpc.git.stageFile.useMutation({
    onSuccess: () => {
      utils.git.getStatus.invalidate(repository.path)
    },
  })

  const unstageFileMutation = trpc.git.unstageFile.useMutation({
    onSuccess: () => {
      utils.git.getStatus.invalidate(repository.path)
    },
  })

  const resetFileMutation = trpc.git.resetFile.useMutation({
    onSuccess: () => {
      utils.git.getStatus.invalidate(repository.path)
      // Close diff view if the reset file was selected
      if (
        selectedFile &&
        selectedFile.file === resetFileMutation.variables?.filePath
      ) {
        setSelectedFile(null)
        setSelectedView(null)
      }
    },
  })

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">
          Loading git status...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-red-500 dark:text-red-400">
          Error: {error.message}
        </div>
      </div>
    )
  }

  const stagedFileSet = new Set(status?.staged || [])

  const stagedFiles = (status?.staged || []).map((f) => ({
    file: f,
    status: "staged" as const,
  }))

  // Create a set of all unstaged files to avoid duplicates
  const unstagedFileMap = new Map()

  // Add modified files
  ;(status?.modified || []).forEach((f) => {
    if (!unstagedFileMap.has(f)) {
      unstagedFileMap.set(f, {
        file: f,
        status: "modified" as const,
        isPartiallyStaged: stagedFileSet.has(f),
      })
    }
  })

  // Add untracked files
  ;(status?.untracked || []).forEach((f) => {
    if (!unstagedFileMap.has(f)) {
      unstagedFileMap.set(f, {
        file: f,
        status: "untracked" as const,
        isPartiallyStaged: false,
      })
    }
  })

  // Add deleted files
  ;(status?.deleted || []).forEach((f) => {
    if (!unstagedFileMap.has(f)) {
      unstagedFileMap.set(f, {
        file: f,
        status: "deleted" as const,
        isPartiallyStaged: stagedFileSet.has(f),
      })
    }
  })

  const unstagedFiles = Array.from(unstagedFileMap.values())

  const handleStageFile = (filePath: string) => {
    stageFileMutation.mutate({ repoPath: repository.path, filePath })
  }

  const handleUnstageFile = (filePath: string) => {
    unstageFileMutation.mutate({ repoPath: repository.path, filePath })
  }

  const handleResetFile = (filePath: string) => {
    // Check if file is untracked
    const isUntracked = status?.untracked?.includes(filePath) || false
    const message = isUntracked
      ? `Are you sure you want to delete ${filePath}? This cannot be undone.`
      : `Are you sure you want to discard all changes to ${filePath}? This cannot be undone.`

    if (confirm(message)) {
      resetFileMutation.mutate({ repoPath: repository.path, filePath })
    }
  }

  return (
    <div className="flex-1 flex">
      <div
        className="w-1/3 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4 overflow-y-auto overflow-x-hidden"
        style={{ height: "calc(100vh - 120px)" }}
      >
        {stagedFiles.length === 0 && unstagedFiles.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            No changes detected
          </div>
        ) : (
          <div className="space-y-6">
            {/* Staged Files Section */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Staged ({stagedFiles.length})
              </h3>
              {stagedFiles.length === 0 ? (
                <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                  No staged files
                </div>
              ) : (
                <div className="space-y-2">
                  {stagedFiles.map(({ file }) => (
                    <div
                      key={`staged-${file}`}
                      className={`flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer ${
                        selectedFile?.file === file && selectedFile?.staged
                          ? "bg-blue-50 dark:bg-blue-900/30"
                          : ""
                      }`}
                      onClick={() => {
                        setSelectedFile({ file, staged: true })
                        setSelectedView("file")
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          setSelectedFile({ file, staged: true })
                          setSelectedView("file")
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      onContextMenu={async (e) => {
                        e.preventDefault()

                        const action = await window.electronAPI.showContextMenu(
                          [
                            {
                              label: "Unstage",
                              action: "unstage",
                              enabled: true,
                            },
                            {
                              label: "View Diff",
                              action: "view-diff",
                              enabled: true,
                            },
                          ],
                        )

                        if (action === "unstage") {
                          handleUnstageFile(file)
                        } else if (action === "view-diff") {
                          setSelectedFile({ file, staged: true })
                          setSelectedView("file")
                        }
                      }}
                    >
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-sm font-mono text-gray-900 dark:text-gray-100">
                          {file}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleUnstageFile(file)
                        }}
                        className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 text-gray-900 dark:text-gray-100"
                        disabled={
                          stageFileMutation.isPending ||
                          unstageFileMutation.isPending
                        }
                      >
                        Unstage
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Unstaged Files Section */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Unstaged ({unstagedFiles.length})
              </h3>
              {unstagedFiles.length === 0 ? (
                <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                  No unstaged files
                </div>
              ) : (
                <div className="space-y-2">
                  {unstagedFiles.map(({ file, status, isPartiallyStaged }) => (
                    <div
                      key={`unstaged-${file}`}
                      className={`flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer ${
                        selectedFile?.file === file && !selectedFile?.staged
                          ? "bg-blue-50 dark:bg-blue-900/30"
                          : ""
                      }`}
                      onClick={() => {
                        setSelectedFile({ file, staged: false })
                        setSelectedView("file")
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          setSelectedFile({ file, staged: false })
                          setSelectedView("file")
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      onContextMenu={async (e) => {
                        e.preventDefault()

                        const menuItems = [
                          {
                            label: "Stage",
                            action: "stage",
                            enabled: true,
                          },
                        ]

                        if (status === "untracked") {
                          menuItems.push({
                            label: "Delete File",
                            action: "reset",
                            enabled: true,
                          })
                        } else {
                          menuItems.push({
                            label: "Discard Changes",
                            action: "reset",
                            enabled: true,
                          })
                        }

                        menuItems.push({
                          label: "View Diff",
                          action: "view-diff",
                          enabled: true,
                        })

                        const action =
                          await window.electronAPI.showContextMenu(menuItems)

                        if (action === "stage") {
                          handleStageFile(file)
                        } else if (action === "reset") {
                          handleResetFile(file)
                        } else if (action === "view-diff") {
                          setSelectedFile({ file, staged: false })
                          setSelectedView("file")
                        }
                      }}
                    >
                      <div className="flex items-center space-x-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            status === "modified"
                              ? "bg-yellow-500"
                              : status === "untracked"
                                ? "bg-blue-500"
                                : "bg-red-500"
                          }`}
                        />
                        <span className="text-sm font-mono text-gray-900 dark:text-gray-100">
                          {file}
                        </span>
                        {isPartiallyStaged && (
                          <span className="text-xs px-1 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded">
                            partial
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleStageFile(file)
                        }}
                        className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 text-gray-900 dark:text-gray-100"
                        disabled={
                          stageFileMutation.isPending ||
                          unstageFileMutation.isPending
                        }
                      >
                        Stage
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Claude Code Button - Sticky at bottom */}
        <div className="sticky bottom-0 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <button
            type="button"
            onClick={() => {
              if (selectedView === "chat") {
                setSelectedView(null)
              } else {
                setSelectedView("chat")
                setSelectedFile(null)
              }
            }}
            className={`w-full px-3 py-2 rounded text-sm font-medium transition-colors ${
              selectedView === "chat"
                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            🤖 Claude Code
          </button>
        </div>
      </div>
      <div
        className="flex-1 bg-gray-50 dark:bg-gray-900 p-4 overflow-y-auto overflow-x-hidden"
        style={{ height: "calc(100vh - 120px)" }}
      >
        {selectedView === "chat" ? (
          <ChatInterface
            onClose={() => setSelectedView(null)}
            repository={repository}
          />
        ) : selectedFile ? (
          <div>
            {diffLoading ? (
              <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
                Loading diff...
              </div>
            ) : diffError ? (
              <div className="text-center text-red-500 dark:text-red-400 mt-8">
                Error loading diff: {diffError.message}
              </div>
            ) : diffData ? (
              <DiffViewer
                diffText={diffData}
                fileName={selectedFile.file}
                staged={selectedFile.staged}
                className="bg-white dark:bg-gray-800 rounded-lg shadow"
              />
            ) : (
              <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
                No diff data available
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
            Select a file to view changes or use Claude Code
          </div>
        )}
      </div>
    </div>
  )
}

function HistoryView({ repository }: { repository: Repository }) {
  const { data: branches } = trpc.git.getBranches.useQuery(repository.path)

  return (
    <div className="flex-1 flex">
      <div className="w-1/3 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Branch Info
        </h3>
        {branches && (
          <div className="space-y-2">
            <div className="text-sm">
              <span className="font-medium text-gray-900 dark:text-gray-100">
                Current:{" "}
              </span>
              <span className="font-mono text-blue-600 dark:text-blue-400">
                {branches.current}
              </span>
            </div>
            <div className="text-sm">
              <span className="font-medium text-gray-900 dark:text-gray-100">
                All branches:{" "}
              </span>
              <div className="mt-1 space-y-1">
                {branches.all.map((branch) => (
                  <div
                    key={branch}
                    className={`font-mono text-xs px-2 py-1 rounded ${
                      branch === branches.current
                        ? "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    }`}
                  >
                    {branch}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 bg-gray-50 dark:bg-gray-900 p-4">
        <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
          Commit history view coming soon
        </div>
      </div>
    </div>
  )
}

export default App
