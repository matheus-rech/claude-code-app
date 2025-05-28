import { contextBridge, ipcRenderer } from 'electron';

// Define the API interface that will be exposed to the renderer
export interface ElectronAPI {
  trpc: {
    query: (procedure: string, input?: any) => Promise<any>;
    mutate: (procedure: string, input?: any) => Promise<any>;
  };
  onClaudeCodeStream: (callback: (data: any) => void) => void;
  removeClaudeCodeStreamListener: (callback: (data: any) => void) => void;
}

// Create the API object
const electronAPI: ElectronAPI = {
  trpc: {
    query: async (procedure: string, input?: any) => {
      return await ipcRenderer.invoke('trpc:query', { procedure, input });
    },
    
    mutate: async (procedure: string, input?: any) => {
      return await ipcRenderer.invoke('trpc:mutate', { procedure, input });
    },
  },
  
  onClaudeCodeStream: (callback: (data: any) => void) => {
    ipcRenderer.on('claude-code-stream', (event, data) => callback(data));
  },
  
  removeClaudeCodeStreamListener: (callback: (data: any) => void) => {
    ipcRenderer.removeListener('claude-code-stream', callback);
  }
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declarations for the renderer process
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}