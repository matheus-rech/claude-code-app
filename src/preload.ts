import { contextBridge, ipcRenderer } from 'electron';

// Define the API interface that will be exposed to the renderer
export interface ElectronAPI {
  trpc: {
    query: (procedure: string, input?: any) => Promise<any>;
    mutate: (procedure: string, input?: any) => Promise<any>;
  };
  ipcRenderer: {
    on: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
    removeListener: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
  };
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
  
  ipcRenderer: {
    on: (channel: string, listener: (event: any, ...args: any[]) => void) => {
      ipcRenderer.on(channel, listener);
    },
    removeListener: (channel: string, listener: (event: any, ...args: any[]) => void) => {
      ipcRenderer.removeListener(channel, listener);
    }
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