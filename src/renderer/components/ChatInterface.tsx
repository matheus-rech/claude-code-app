import React, { useState, useRef, useEffect } from 'react';
import { trpc } from '../trpc';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  streaming?: boolean;
}

interface ChatInterfaceProps {
  onClose: () => void;
}

export default function ChatInterface({ onClose }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const chatMutation = trpc.claudeCode.chat.useMutation({
    onSuccess: (response) => {
      setIsStreaming(false);
      // Update the streaming message with final content
      setMessages(prev => 
        prev.map(msg => 
          msg.streaming 
            ? { ...msg, content: response.content, streaming: false }
            : msg
        )
      );
    },
    onError: (error) => {
      setIsStreaming(false);
      setMessages(prev => [
        ...prev,
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
    
    // Add streaming placeholder for assistant response
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true,
    };
    setMessages(prev => [...prev, assistantMessage]);

    setInputValue('');
    setIsStreaming(true);

    // Send the message
    chatMutation.mutate({
      message: userMessage.content,
      verbose: true
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
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          🤖 Claude Code
        </h3>
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
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                }`}
              >
                <div className="whitespace-pre-wrap font-mono text-sm">
                  {(() => {
                    const content = message.content || (message.streaming ? 'Thinking...' : '');
                    
                    // Try to parse as JSON and format it nicely
                    if (content && content.trim().startsWith('{')) {
                      try {
                        const parsed = JSON.parse(content);
                        return JSON.stringify(parsed, null, 2);
                      } catch (e) {
                        // If parsing fails, try to parse multiple JSON objects
                        const lines = content.split('\n');
                        const formattedLines = lines.map(line => {
                          if (line.trim().startsWith('{')) {
                            try {
                              const parsed = JSON.parse(line.trim());
                              return JSON.stringify(parsed, null, 2);
                            } catch (e) {
                              return line;
                            }
                          }
                          return line;
                        });
                        return formattedLines.join('\n');
                      }
                    }
                    
                    return content;
                  })()}
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