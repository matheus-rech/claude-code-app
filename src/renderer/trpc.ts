import { createTRPCReact } from '@trpc/react-query';

// We need to import the AppRouter type from main.ts, but since it's in CommonJS,
// we'll define it here for now
interface GitRouter {
  openRepository: any;
  getStatus: any;
  stageFile: any;
  unstageFile: any;
  getBranches: any;
  getFileDiff: any;
}

interface AppRouter {
  git: GitRouter;
}

export const trpc = createTRPCReact<AppRouter>();