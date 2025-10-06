import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react(),
        viteSingleFile({
            removeViteModuleLoader: true,
            useRecommendedBuildConfig: true,
            deleteInlinedFiles: true,
            inlinePattern: ["**/*.js", "**/*.css", "**/*.html"],
        }),
    ],
    base: "/", // Set base path for GitHub Pages
    build: {
        outDir: "dist",
        assetsDir: "assets",
        sourcemap: false,
        rollupOptions: {
            output: {
                assetFileNames: "assets/[name].[ext]",
            },
        },
    },
});
