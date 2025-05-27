import './index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { observable } from '@trpc/server/observable';
import { trpc } from './trpc';
import App from './App';

const queryClient = new QueryClient();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container not found');
}

const trpcClient = trpc.createClient({
  links: [
    () => {
      return ({ op }) => {
        return observable((observer) => {
          const { type, path, input } = op;
          
          if (type === 'query') {
            window.electronAPI.trpc.query(path, input)
              .then(result => {
                observer.next({ result: { type: 'data', data: result } });
                observer.complete();
              })
              .catch(error => {
                observer.error(error);
              });
          } else if (type === 'mutation') {
            window.electronAPI.trpc.mutate(path, input)
              .then(result => {
                observer.next({ result: { type: 'data', data: result } });
                observer.complete();
              })
              .catch(error => {
                observer.error(error);
              });
          } else {
            observer.error(new Error(`Unsupported operation type: ${type}`));
          }
        });
      };
    },
  ],
});

const root = createRoot(container);
root.render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);