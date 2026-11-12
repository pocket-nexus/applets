// The store's website: a Vue app built into store/site/dist, which the Worker
// serves as its assets (store/wrangler.jsonc).
//
//   bun run site          the pages with hot reload; /v1/* is answered by the
//                         live store, or by STORE (http://127.0.0.1:8787 for
//                         a `wrangler dev` beside it)
//   bun run site:build    store/site/dist
import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";

/** The applet player's frame is /play/ (public/play/index.html). The Worker's
 *  assets answer a directory with its index; the dev server would answer it
 *  with the app's own page, so here it is pointed at the file. */
const playerFrame: Plugin = {
  name: "player-frame",
  configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      if (request.url === "/play/" || request.url?.startsWith("/play/?")) request.url = "/play/index.html";
      next();
    });
  },
};

export default defineConfig({
  plugins: [vue(), playerFrame],
  // vue-i18n, without what the site does not use: its old API, the components
  // it would register everywhere, its devtools. Its message compiler stays:
  // the messages (src/i18n) are compiled in the page, without eval.
  define: {
    __VUE_I18N_LEGACY_API__: false,
    __VUE_I18N_FULL_INSTALL__: false,
    __INTLIFY_PROD_DEVTOOLS__: false,
    __INTLIFY_DROP_MESSAGE_COMPILER__: false,
  },
  build: { target: "es2022" },
  server: {
    proxy: { "/v1": { target: process.env.STORE ?? "https://applets.pocket.nexus", changeOrigin: true } },
  },
});
