import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    pool: "forks",
    server: {
      deps: {
        // Mark langgraph as external so vitest doesn't try to transform it with esbuild
        external: [/@langchain\/langgraph/],
      },
    },
  },
});