/// <reference types="node" />

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  const repositoryName = process.env.GITHUB_REPOSITORY?.split("/").pop();
  const normalizedBasePath = process.env.VITE_BASE_PATH?.trim();
  const base =
    normalizedBasePath ||
    (process.env.GITHUB_ACTIONS === "true" && repositoryName ? `/${repositoryName}/` : "/");

  return {
    base,
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy: {
        "/api": "http://localhost:3000"
      }
    }
  };
});
