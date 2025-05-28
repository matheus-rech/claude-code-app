import { ipcMain } from 'electron';
import { appRouter } from '../trpc/router';

function setupTrpcIpcHandler() {
  const caller = appRouter.createCaller({});

  ipcMain.handle('trpc:query', async (event, { procedure, input }) => {
    try {
      const pathArray = procedure.split('.');
      let proc = caller as any;
      
      for (const segment of pathArray) {
        proc = proc[segment];
        if (!proc) {
          throw new Error(`No procedure found on path "${procedure}"`);
        }
      }
      
      const result = await proc(input);
      return result;
    } catch (error) {
      console.error('tRPC query error:', error);
      throw error;
    }
  });

  ipcMain.handle('trpc:mutate', async (event, { procedure, input }) => {
    try {
      const pathArray = procedure.split('.');
      let proc = caller as any;
      
      for (const segment of pathArray) {
        proc = proc[segment];
      }
      
      const result = await proc(input);
      return result;
    } catch (error) {
      console.error('tRPC mutation error:', error);
      throw error;
    }
  });
}

export { setupTrpcIpcHandler };