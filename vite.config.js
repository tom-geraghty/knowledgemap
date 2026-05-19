import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    // Inject noindex meta tag when building for staging
    {
      name: "inject-noindex",
      transformIndexHtml(html) {
        if (process.env.VITE_STAGING === "true") {
          return html.replace(
            "<head>",
            '<head>\n    <meta name="robots" content="noindex, nofollow" />'
          );
        }
        return html;
      },
    },
  ],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
