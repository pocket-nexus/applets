// applets.pocket.nexus: the store's pages, drawn from what /v1/* answers
// (store/src/index.ts). An app's title, summary and author come from whoever
// published it, so they only ever reach the page as text.
import { createApp } from "vue";
import "@fontsource-variable/inter";
import "./styles/base.css";
import App from "./App.vue";
import { router } from "./router.ts";

createApp(App).use(router).mount("#app");
