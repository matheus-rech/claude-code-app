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
    onSuccess: (data: Repository) => {
      setRepository(data)
    },
    onError: (error) => {
      console.error("Failed to open repository:", error)
      alert(`Failed to open repository: ${error.message}`)
    },
  })

  const [shouldGetStatus, setShouldGetStatus] = useState(false)
  const gitStatusQuery = trpc.git.getStatus.useQuery(repository?.path ?? "", {
    enabled: shouldGetStatus && !!repository,
  })

  // Handle git status query results
  React.useEffect(() => {
    if (gitStatusQuery.data && shouldGetStatus) {
      const data = gitStatusQuery.data
      const statusText = `Git Status:
Modified: ${data.modified?.length || 0} files
Staged: ${data.staged?.length || 0} files  
Untracked: ${data.untracked?.length || 0} files
Deleted: ${data.deleted?.length || 0} files`
      alert(statusText)
      setShouldGetStatus(false)
    }
    if (gitStatusQuery.error && shouldGetStatus) {
      alert(`Failed to get git status: ${gitStatusQuery.error.message}`)
      setShouldGetStatus(false)
    }
  }, [gitStatusQuery.data, gitStatusQuery.error, shouldGetStatus])

  const handleOpenRepository = () => {
    openRepositoryMutation.mutate()
  }

  const handleGetGitStatus = () => {
    if (repository) {
      setShouldGetStatus(true)
    } else {
      alert("No repository selected. Please open a repository first.")
    }
  }

  return (
    <div className="flex flex-col h-screen bg-base">
      <div
        className="bg-mantle border-b border-surface-0 px-4 py-2"
        style={{ paddingTop: "32px" }}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-text">
            {repository ? repository.name : "Git Tower Clone"}
          </h1>
        </div>
      </div>

      {repository && (
        <div className="bg-mantle border-b border-surface-0">
          <div className="flex">
            <button
              type="button"
              onClick={() => setCurrentView("changes")}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${
                currentView === "changes"
                  ? "border-blue text-blue"
                  : "border-transparent text-subtext-1 hocus:text-subtext-0"
              }`}
            >
              Changes
            </button>
            <button
              type="button"
              onClick={() => setCurrentView("history")}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${
                currentView === "history"
                  ? "border-blue text-blue"
                  : "border-transparent text-subtext-1 hocus:text-subtext-0"
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
              <h2 className="text-xl font-semibold text-subtext-1 mb-2">
                Welcome to Git Tower Clone
              </h2>
              <p className="text-subtext-0 mb-4">
                Select a repository to get started
              </p>
              <button
                type="button"
                onClick={handleOpenRepository}
                disabled={openRepositoryMutation.isPending}
                className="px-4 py-2 bg-blue text-crust rounded hocus:bg-sapphire disabled:opacity-50 inline-block"
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
        <div className="text-subtext-0">Loading git status...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-red">Error: {error.message}</div>
      </div>
    )
  }

  const stagedFileSet = new Set(status?.staged || [])

  const stagedFiles = (status?.staged || []).map((f) => ({
    file: f,
    status: "staged" as const,
  }))

  // Create a set of all unstaged files to avoid duplicates
  const unstagedFileMap = new Map<
    string,
    {
      file: string
      status: "modified" | "untracked" | "deleted"
      isPartiallyStaged: boolean
    }
  >()

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
        className="w-1/3 bg-mantle border-r border-surface-0 p-4 overflow-y-auto overflow-x-hidden"
        style={{ height: "calc(100vh - 120px)" }}
      >
        {stagedFiles.length === 0 && unstagedFiles.length === 0 ? (
          <div className="text-sm text-subtext-0">No changes detected</div>
        ) : (
          <div className="space-y-6">
            {/* Staged Files Section */}
            <div>
              <h3 className="text-sm font-semibold text-text mb-3">
                Staged ({stagedFiles.length})
              </h3>
              {stagedFiles.length === 0 ? (
                <div className="text-xs text-subtext-0 italic">
                  No staged files
                </div>
              ) : (
                <div className="space-y-2">
                  {stagedFiles.map(({ file }) => (
                    <div
                      key={`staged-${file}`}
                      className={`flex items-center justify-between p-2 rounded hocus:bg-surface-0 cursor-pointer ${
                        selectedFile?.file === file && selectedFile?.staged
                          ? "bg-surface-1"
                          : ""
                      }`}
                      onClick={() => {
                        setSelectedFile({ file, staged: true })
                        setSelectedView("file")
                      }}
                      onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          setSelectedFile({ file, staged: true })
                          setSelectedView("file")
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      onContextMenu={async (
                        e: React.MouseEvent<HTMLDivElement>,
                      ) => {
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
                        <span className="w-2 h-2 rounded-full bg-green" />
                        <span className="text-sm font-mono text-text">
                          {file}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation()
                          handleUnstageFile(file)
                        }}
                        className="text-xs px-2 py-1 rounded bg-surface-0 hocus:bg-surface-1 text-text"
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
              <h3 className="text-sm font-semibold text-text mb-3">
                Unstaged ({unstagedFiles.length})
              </h3>
              {unstagedFiles.length === 0 ? (
                <div className="text-xs text-subtext-0 italic">
                  No unstaged files
                </div>
              ) : (
                <div className="space-y-2">
                  {unstagedFiles.map(({ file, status, isPartiallyStaged }) => (
                    <div
                      key={`unstaged-${file}`}
                      className={`flex items-center justify-between p-2 rounded hocus:bg-surface-0 cursor-pointer ${
                        selectedFile?.file === file && !selectedFile?.staged
                          ? "bg-surface-1"
                          : ""
                      }`}
                      onClick={() => {
                        setSelectedFile({ file, staged: false })
                        setSelectedView("file")
                      }}
                      onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          setSelectedFile({ file, staged: false })
                          setSelectedView("file")
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      onContextMenu={async (
                        e: React.MouseEvent<HTMLDivElement>,
                      ) => {
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
                              ? "bg-yellow"
                              : status === "untracked"
                                ? "bg-blue"
                                : "bg-red"
                          }`}
                        />
                        <span className="text-sm font-mono text-text">
                          {file}
                        </span>
                        {isPartiallyStaged && (
                          <span className="text-xs px-1 py-0.5 bg-green/20 text-green rounded">
                            partial
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation()
                          handleStageFile(file)
                        }}
                        className="text-xs px-2 py-1 rounded bg-surface-0 hocus:bg-surface-1 text-text"
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
        <div className="sticky bottom-0 mt-4 pt-4 border-t border-surface-0 bg-mantle">
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
                ? "bg-blue/20 text-blue border border-blue/50"
                : "bg-surface-0 text-subtext-1 hocus:bg-surface-1"
            }`}
          >
            🤖 Claude Code
          </button>
        </div>
      </div>
      <div
        className="flex-1 bg-base p-4 overflow-y-auto overflow-x-hidden"
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
              <div className="text-center text-subtext-0 mt-8">
                Loading diff...
              </div>
            ) : diffError ? (
              <div className="text-center text-red mt-8">
                Error loading diff: {diffError.message}
              </div>
            ) : diffData ? (
              <DiffViewer
                diffText={diffData}
                fileName={selectedFile.file}
                staged={selectedFile.staged}
                className="bg-surface-0 rounded-lg shadow"
              />
            ) : (
              <div className="text-center text-subtext-0 mt-8">
                No diff data available
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-subtext-0 mt-8">
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
      <div className="w-1/3 bg-mantle border-r border-surface-0 p-4">
        <h3 className="text-sm font-semibold text-text mb-3">Branch Info</h3>
        {branches && (
          <div className="space-y-2">
            <div className="text-sm">
              <span className="font-medium text-text">Current: </span>
              <span className="font-mono text-blue">{branches.current}</span>
            </div>
            <div className="text-sm">
              <span className="font-medium text-text">All branches: </span>
              <div className="mt-1 space-y-1">
                {branches.all.map((branch) => (
                  <div
                    key={branch}
                    className={`font-mono text-xs px-2 py-1 rounded ${
                      branch === branches.current
                        ? "bg-blue/20 text-blue"
                        : "bg-surface-0 text-text"
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
      <div className="flex-1 bg-base p-4">
        <div className="text-center text-subtext-0 mt-8">
          Commit history view coming soon
        </div>
      </div>
    </div>
  )
}

export default App
