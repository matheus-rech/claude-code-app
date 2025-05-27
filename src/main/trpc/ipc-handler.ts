const { ipcMain } = require('electron');
const { appRouter } = require('./router');

function setupTrpcIpcHandler() {
  const caller = appRouter.createCaller({});

  ipcMain.handle('trpc:query', async (event, { procedure, input }) => {
    try {
      console.log('=== IPC HANDLER DEBUG ===');
      console.log('procedure:', procedure);
      console.log('input:', input);
      
      const pathArray = procedure.split('.');
      console.log('pathArray:', pathArray);
      
      let proc = caller as any;
      
      for (const segment of pathArray) {
        console.log('navigating to segment:', segment);
        proc = proc[segment];
        if (!proc) {
          console.error('Procedure not found at segment:', segment);
          throw new Error(`No procedure found on path "${procedure}"`);
        }
      }
      
      console.log('Found procedure, calling with input:', input);
      const result = await proc(input);
      console.log('Procedure result:', result);
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