import "./index.css"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { observable } from "@trpc/server/observable"
import { TRPCClientError } from "@trpc/client"
import React from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { trpc } from "./trpc"
import { preloadHighlighter } from "./utils/diff-processor"

const queryClient = new QueryClient()

const container = document.getElementById("root")
if (!container) {
  throw new Error("Root container not found")
}

const trpcClient = trpc.createClient({
  links: [
    () => {
      return ({ op }) => {
        return observable((observer) => {
          const { type, path, input } = op

          if (type === "query") {
            const procedurePath = Array.isArray(path) ? path.join(".") : path
            window.electronAPI.trpc
              .query(procedurePath, input)
              .then((result) => {
                observer.next({ result: { type: "data", data: result } })
                observer.complete()
              })
              .catch((error) => {
                observer.error(TRPCClientError.from(error))
              })
          } else if (type === "mutation") {
            const procedurePath = Array.isArray(path) ? path.join(".") : path
            window.electronAPI.trpc
              .mutate(procedurePath, input)
              .then((result) => {
                observer.next({ result: { type: "data", data: result } })
                observer.complete()
              })
              .catch((error) => {
                observer.error(TRPCClientError.from(error))
              })
          } else {
            observer.error(TRPCClientError.from(new Error(`Unsupported operation type: ${type}`)))
          }
        })
      }
    },
  ],
})

// Preload syntax highlighter for better performance
preloadHighlighter()

const root = createRoot(container)
root.render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>,
)
