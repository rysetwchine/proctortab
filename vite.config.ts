import { defineConfig, PluginOption } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const plugins: PluginOption[] = [react()];
  // Disabled SSL plugin for easier local development access
  // if (mode === "development") {
  //   plugins.push(basicSsl());
  // }
  const enableHttps = false; // Disabled HTTPS to avoid SSL certificate errors

  return {
    server: {
      host: "0.0.0.0",
      port: 8080,
      strictPort: false,
      open: false,
      https: enableHttps as any,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: {
      host: "0.0.0.0",
      port: 8080,
      strictPort: false,
    },
    plugins: plugins.filter(Boolean) as PluginOption[],
    optimizeDeps: {
      exclude: ["pdfjs-dist", "tesseract.js"],
      esbuildOptions: {
        target: "ES2020",
      },
    },
    ssr: {
      noExternal: ["pdfjs-dist", "tesseract.js"],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    base: "/",
    build: {
      outDir: "dist",
      rollupOptions: {
        output: {
          // Ensure chunks are large enough to avoid excessive splitting
          manualChunks: {
            pdfjs: ["pdfjs-dist"],
            tesseract: ["tesseract.js"],
          },
        },
        external: [],
      },
    },
  };
});
