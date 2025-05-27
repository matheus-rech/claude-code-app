const { ipcMain } = require('electron');
const { appRouter } = require('./router');

function setupTrpcIpcHandler() {
  const caller = appRouter.createCaller({});

  ipcMain.handle('trpc:query', async (event, { procedure, input }) => {
    try {
      const pathArray = procedure.split('.');
      let proc = caller as any;
      
      for (const segment of pathArray) {
        proc = proc[segment];
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

module.exports = { setupTrpcIpcHandler };