import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Login sub-slice L7c (owner answer (a) to Q-2026-10-21-159): when the local certificate of
// `scripts/local/make-certificate.sh` is in the ignored `.local/https` folder, the screen server
// uses HTTPS and lets the Mac mini's `.local` name in, so the iPad on the same Wi-Fi can open it
// too. It forwards `/api` to the API on 127.0.0.1:8000, so the screens and the API share one
// origin and the `__Host-` cookies work. Without the certificate it stays plain HTTP, as before.
const httpsFolder = fileURLToPath(new URL("../.local/https/", import.meta.url));
const certificateFile = `${httpsFolder}server.pem`;
const keyFile = `${httpsFolder}server-key.pem`;
const localHttps =
  existsSync(certificateFile) && existsSync(keyFile)
    ? { cert: readFileSync(certificateFile), key: readFileSync(keyFile) }
    : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    ...(localHttps === undefined
      ? {}
      : { https: localHttps, allowedHosts: [".local"] }),
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: false },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
