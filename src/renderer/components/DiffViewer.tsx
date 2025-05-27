import React, { useEffect, useState } from 'react';
import { processDiff, type ProcessedDiffFile, type ProcessedChange } from '../utils/diff-processor';

interface DiffViewerProps {
  diffText: string;
  fileName?: string;
  staged?: boolean;
  className?: string;
}

export default function DiffViewer({ diffText, fileName, staged, className = '' }: DiffViewerProps) {
  const [processedFiles, setProcessedFiles] = useState<ProcessedDiffFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function processFiles() {
      try {
        setLoading(true);
        setError(null);
        const files = await processDiff(diffText, 'dark');
        setProcessedFiles(files);
      } catch (err) {
        console.error('Error processing diff:', err);
        setError(err instanceof Error ? err.message : 'Failed to process diff');
      } finally {
        setLoading(false);
      }
    }

    if (diffText && diffText.trim()) {
      processFiles();
    } else {
      setProcessedFiles([]);
      setLoading(false);
    }
  }, [diffText]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-gray-500 dark:text-gray-400">Processing diff...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-red-500 dark:text-red-400">Error: {error}</div>
      </div>
    );
  }

  if (!processedFiles.length) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-gray-500 dark:text-gray-400">No changes to display</div>
      </div>
    );
  }

  return (
    <div className={`font-mono text-sm ${className}`}>
      {processedFiles.map((file, fileIndex) => (
        <DiffFile key={fileIndex} file={file} staged={staged} />
      ))}
    </div>
  );
}

function DiffFile({ file, staged }: { file: ProcessedDiffFile; staged?: boolean }) {
  const getFileStatus = () => {
    if (file.from === '/dev/null') return 'added';
    if (file.to === '/dev/null') return 'deleted';
    if (file.from !== file.to) return 'renamed';
    return 'modified';
  };

  const status = getFileStatus();
  const fileName = file.to || file.from || 'unknown';

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden mb-4">
      {/* File header */}
      <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
              status === 'added' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
              status === 'deleted' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
              status === 'renamed' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
              'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
            }`}>
              {status.toUpperCase()}
            </span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {fileName}
              {staged !== undefined && (
                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                  ({staged ? 'staged' : 'unstaged'})
                </span>
              )}
            </span>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <span className="text-green-600 dark:text-green-400">+{file.additions || 0}</span>
            <span className="mx-1">/</span>
            <span className="text-red-600 dark:text-red-400">-{file.deletions || 0}</span>
          </div>
        </div>
      </div>

      {/* Diff content */}
      <div className="bg-gray-900 dark:bg-gray-950 overflow-y-auto overflow-x-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
        <table className="w-full">
          <tbody>
            {file.chunks.map((chunk, chunkIndex) => (
              <React.Fragment key={chunkIndex}>
                {/* Chunk header */}
                <tr>
                  <td colSpan={3} className="px-4 py-1 bg-gray-700 dark:bg-gray-800 text-gray-300 dark:text-gray-400 text-xs">
                    {chunk.content}
                  </td>
                </tr>
                {/* Chunk changes */}
                {chunk.changes.map((change, changeIndex) => (
                  <DiffLine key={changeIndex} change={change} />
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DiffLine({ change }: { change: ProcessedChange }) {
  const getLineNumbers = () => {
    switch (change.type) {
      case 'add':
        return { old: '', new: change.ln || '' };
      case 'del':
        return { old: change.ln || '', new: '' };
      case 'normal':
        return { old: change.ln1 || '', new: change.ln2 || '' };
      default:
        return { old: '', new: '' };
    }
  };

  const { old: oldLineNumber, new: newLineNumber } = getLineNumbers();

  const getBackgroundColor = () => {
    switch (change.type) {
      case 'add':
        return 'bg-green-900/30 dark:bg-green-900/20';
      case 'del':
        return 'bg-red-900/30 dark:bg-red-900/20';
      default:
        return '';
    }
  };

  const getLinePrefix = () => {
    switch (change.type) {
      case 'add':
        return '+';
      case 'del':
        return '-';
      default:
        return ' ';
    }
  };

  return (
    <tr className={getBackgroundColor()}>
      {/* Old line number */}
      <td className="px-2 py-0 text-right text-gray-500 dark:text-gray-400 select-none w-12 min-w-12">
        {oldLineNumber}
      </td>
      
      {/* New line number */}
      <td className="px-2 py-0 text-right text-gray-500 dark:text-gray-400 select-none w-12 min-w-12">
        {newLineNumber}
      </td>
      
      {/* Code content */}
      <td className="px-2 py-0 text-white dark:text-gray-100">
        <pre className="whitespace-pre-wrap break-all">
          <span className={`inline-block w-4 ${
            change.type === 'add' ? 'text-green-400' :
            change.type === 'del' ? 'text-red-400' :
            'text-gray-500'
          }`}>
            {getLinePrefix()}
          </span>
          {change.tokens?.map((token, index) => (
            <span
              key={index}
              style={{
                color: token.color,
                fontStyle: token.fontStyle,
                backgroundColor: token.isWordDiff ? 
                  (token.diffType === 'added' ? 'rgba(34, 197, 94, 0.3)' : 
                   token.diffType === 'removed' ? 'rgba(239, 68, 68, 0.3)' : 
                   undefined) : undefined
              }}
            >
              {token.content}
            </span>
          )) || change.content.slice(1)}
        </pre>
      </td>
    </tr>
  );
}