import React, { useState } from 'react';
import { trpc } from './trpc';

type GitView = 'changes' | 'history';

interface Repository {
  path: string;
  name: string;
}

function App() {
  const [currentView, setCurrentView] = useState<GitView>('changes');
  const [repository, setRepository] = useState<Repository | null>(null);

  const openRepositoryMutation = trpc.git.openRepository.useMutation({
    onSuccess: (data) => {
      setRepository(data);
    },
    onError: (error) => {
      console.error('Failed to open repository:', error);
      alert('Failed to open repository: ' + error.message);
    },
  });

  const gitStatusMutation = trpc.git.getStatus.useMutation({
    onSuccess: (data) => {
      const statusText = `Git Status:
Modified: ${data.modified?.length || 0} files
Staged: ${data.staged?.length || 0} files  
Untracked: ${data.untracked?.length || 0} files
Deleted: ${data.deleted?.length || 0} files

Current branch: ${data.current || 'unknown'}`;
      alert(statusText);
    },
    onError: (error) => {
      alert('Failed to get git status: ' + error.message);
    },
  });

  const handleOpenRepository = () => {
    openRepositoryMutation.mutate();
  };

  const handleGetGitStatus = () => {
    if (repository) {
      gitStatusMutation.mutate(repository.path);
    } else {
      alert('No repository selected. Please open a repository first.');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-2">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-800">
            {repository ? repository.name : 'Git Tower Clone'}
          </h1>
          <div className="flex space-x-2">
            {repository && (
              <button 
                onClick={handleGetGitStatus}
                disabled={gitStatusMutation.isPending}
                className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
              >
                {gitStatusMutation.isPending ? 'Getting Status...' : 'Git Status'}
              </button>
            )}
            <button 
              onClick={handleOpenRepository}
              disabled={openRepositoryMutation.isPending}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {openRepositoryMutation.isPending 
                ? 'Opening...' 
                : repository 
                  ? 'Change Repository' 
                  : 'Open Repository'
              }
            </button>
          </div>
        </div>
      </div>

      {repository && (
        <div className="bg-white border-b border-gray-200">
          <div className="flex">
            <button
              onClick={() => setCurrentView('changes')}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${
                currentView === 'changes'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Changes
            </button>
            <button
              onClick={() => setCurrentView('history')}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${
                currentView === 'history'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
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
              <h2 className="text-xl font-semibold text-gray-600 mb-2">
                Welcome to Git Tower Clone
              </h2>
              <p className="text-gray-500 mb-4">
                Select a repository to get started
              </p>
              <button 
                onClick={handleOpenRepository}
                disabled={openRepositoryMutation.isPending}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {openRepositoryMutation.isPending ? 'Opening...' : 'Open Repository'}
              </button>
            </div>
          </div>
        ) : currentView === 'changes' ? (
          <ChangesView repository={repository} />
        ) : (
          <HistoryView repository={repository} />
        )}
      </div>
    </div>
  );
}

function ChangesView({ repository }: { repository: Repository }) {
  const { data: status, isLoading, error } = trpc.git.getStatus.useQuery(repository.path, {
    refetchInterval: 2000, // Refresh every 2 seconds
  });

  const stageFileMutation = trpc.git.stageFile.useMutation();
  const unstageFileMutation = trpc.git.unstageFile.useMutation();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-500">Loading git status...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-red-500">Error: {error.message}</div>
      </div>
    );
  }

  const allFiles = [
    ...(status?.modified || []).map(f => ({ file: f, status: 'modified' as const })),
    ...(status?.staged || []).map(f => ({ file: f, status: 'staged' as const })),
    ...(status?.untracked || []).map(f => ({ file: f, status: 'untracked' as const })),
    ...(status?.deleted || []).map(f => ({ file: f, status: 'deleted' as const })),
  ];

  const handleStageFile = (filePath: string) => {
    stageFileMutation.mutate({ repoPath: repository.path, filePath });
  };

  const handleUnstageFile = (filePath: string) => {
    unstageFileMutation.mutate({ repoPath: repository.path, filePath });
  };

  return (
    <div className="flex-1 flex">
      <div className="w-1/3 bg-white border-r border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Changed Files</h3>
        {allFiles.length === 0 ? (
          <div className="text-sm text-gray-500">No changes detected</div>
        ) : (
          <div className="space-y-2">
            {allFiles.map(({ file, status }) => (
              <div key={file} className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                <div className="flex items-center space-x-2">
                  <span className={`w-2 h-2 rounded-full ${
                    status === 'staged' ? 'bg-green-500' :
                    status === 'modified' ? 'bg-yellow-500' :
                    status === 'untracked' ? 'bg-blue-500' :
                    'bg-red-500'
                  }`} />
                  <span className="text-sm font-mono">{file}</span>
                </div>
                <button
                  onClick={() => status === 'staged' ? handleUnstageFile(file) : handleStageFile(file)}
                  className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                  disabled={stageFileMutation.isPending || unstageFileMutation.isPending}
                >
                  {status === 'staged' ? 'Unstage' : 'Stage'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 bg-gray-50 p-4">
        <div className="text-center text-gray-500 mt-8">
          Select a file to view changes
        </div>
      </div>
    </div>
  );
}

function HistoryView({ repository }: { repository: Repository }) {
  const { data: branches } = trpc.git.getBranches.useQuery(repository.path);

  return (
    <div className="flex-1 flex">
      <div className="w-1/3 bg-white border-r border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Branch Info</h3>
        {branches && (
          <div className="space-y-2">
            <div className="text-sm">
              <span className="font-medium">Current: </span>
              <span className="font-mono text-blue-600">{branches.current}</span>
            </div>
            <div className="text-sm">
              <span className="font-medium">All branches: </span>
              <div className="mt-1 space-y-1">
                {branches.all.map(branch => (
                  <div key={branch} className={`font-mono text-xs px-2 py-1 rounded ${
                    branch === branches.current ? 'bg-blue-100 text-blue-800' : 'bg-gray-100'
                  }`}>
                    {branch}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 bg-gray-50 p-4">
        <div className="text-center text-gray-500 mt-8">
          Commit history view coming soon
        </div>
      </div>
    </div>
  );
}

export default App;