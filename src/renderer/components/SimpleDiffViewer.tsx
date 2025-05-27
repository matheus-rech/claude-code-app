import React from 'react';
import parseDiff, { type File, type Chunk, type Change } from 'parse-diff';

interface SimpleDiffViewerProps {
  diffText: string;
  fileName?: string;
  className?: string;
}

export default function SimpleDiffViewer({ diffText, className = '' }: SimpleDiffViewerProps) {
  if (!diffText || !diffText.trim()) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-gray-500 dark:text-gray-400">No changes to display</div>
      </div>
    );
  }

  let files: File[] = [];
  try {
    files = parseDiff(diffText);
  } catch (error) {
    console.error('Error parsing diff:', error);
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-red-500 dark:text-red-400">Error parsing diff: {String(error)}</div>
      </div>
    );
  }

  if (!files.length) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-gray-500 dark:text-gray-400">No files in diff</div>
      </div>
    );
  }

  return (
    <div className={`font-mono text-sm ${className}`}>
      {files.map((file, fileIndex) => (
        <DiffFile key={fileIndex} file={file} />
      ))}
    </div>
  );
}

function DiffFile({ file }: { file: File }) {
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
      <div className="bg-gray-900 dark:bg-gray-950 overflow-x-auto">
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

function DiffLine({ change }: { change: Change }) {
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

  // Remove the leading +/- from content for display
  const displayContent = change.type === 'normal' ? change.content : change.content.slice(1);

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
          <span>{displayContent}</span>
        </pre>
      </td>
    </tr>
  );
}