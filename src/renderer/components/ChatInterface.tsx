import React, { useState, useRef, useEffect } from 'react';
import { trpc } from '../trpc';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  streaming?: boolean;
}

interface Repository {
  path: string;
  name: string;
}

interface ChatInterfaceProps {
  onClose: () => void;
  repository: Repository | null;
}

export default function ChatInterface({ onClose, repository }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Set up real-time message listener
  useEffect(() => {
    const handleMessage = (event: any, message: any) => {
      console.log('Received IPC message:', message);
      // Add the real-time message immediately
      const newMessage: Message = {
        id: `${Date.now()}-${Math.random()}`,
        role: message.type === 'assistant' ? 'assistant' : 'system',
        content: message.content,
        timestamp: new Date(message.timestamp),
      };
      
      setMessages(prev => {
        // Remove any streaming/loading messages and add the new one
        const filtered = prev.filter(msg => !msg.streaming);
        return [...filtered, newMessage];
      });
    };

    // Listen for real-time claude-code messages
    if (window.electronAPI?.ipcRenderer) {
      window.electronAPI.ipcRenderer.on('claude-code-message', handleMessage);
    }

    return () => {
      if (window.electronAPI?.ipcRenderer) {
        window.electronAPI.ipcRenderer.removeListener('claude-code-message', handleMessage);
      }
    };
  }, []);

  const sendMessageMutation = trpc.claudeCode.sendMessage.useMutation({
    onSuccess: (response) => {
      setIsStreaming(false);
      // Save session ID if provided
      if (response.sessionId) {
        setSessionId(response.sessionId);
      }
      
      // Since we're using real-time streaming, we don't need to add messages here
      // The real-time listener will handle all the message updates
      // Just remove any streaming placeholder
      setMessages(prev => prev.filter(msg => !msg.streaming));
    },
    onError: (error) => {
      setIsStreaming(false);
      setMessages(prev => [
        ...prev.filter(msg => !msg.streaming),
        {
          id: Date.now().toString(),
          role: 'system',
          content: `Error: ${error.message}`,
          timestamp: new Date(),
        }
      ]);
    }
  });

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isStreaming) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    // Add user message
    setMessages(prev => [...prev, userMessage]);
    
    // Add a loading indicator
    const loadingMessage: Message = {
      id: `${Date.now()}-loading`,
      role: 'assistant',
      content: 'Thinking...',
      timestamp: new Date(),
      streaming: true
    };
    setMessages(prev => [...prev, loadingMessage]);

    setInputValue('');
    setIsStreaming(true);

    // Send the message
    sendMessageMutation.mutate({
      message: userMessage.content,
      verbose: true,
      repoPath: repository?.path
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-2">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            🤖 Claude Code
          </h3>
          {sessionId && (
            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
              Session: {sessionId.slice(0, 8)}...
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
            <div className="text-2xl mb-2">🤖</div>
            <p>Start a conversation with Claude Code</p>
            <p className="text-sm mt-2">Ask questions about your code, request features, or get help with development</p>
            {repository && (
              <p className="text-xs mt-2 font-mono text-blue-600 dark:text-blue-400">
                Working in: {repository.name}
              </p>
            )}
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-3/4 p-3 rounded-lg ${
                  message.role === 'user'
                    ? 'bg-blue-500 dark:bg-blue-600 text-white'
                    : message.role === 'system'
                    ? 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                }`}
              >
                <div className="whitespace-pre-wrap text-sm">
                  {message.content || (message.streaming ? 'Thinking...' : '')}
                </div>
                {message.streaming && (
                  <div className="mt-2 flex items-center space-x-1 text-xs opacity-70">
                    <div className="w-1 h-1 bg-current rounded-full animate-pulse"></div>
                    <div className="w-1 h-1 bg-current rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-1 h-1 bg-current rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                )}
                <div className="text-xs opacity-70 mt-1">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex space-x-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask Claude Code anything..."
            className="flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 resize-none"
            rows={2}
            disabled={isStreaming}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isStreaming}
            className="px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isStreaming ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              'Send'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}