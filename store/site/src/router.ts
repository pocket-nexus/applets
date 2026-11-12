import { createRouter, createWebHistory } from "vue-router";
import HomePage from "./pages/HomePage.vue";
import AppPage from "./pages/AppPage.vue";
import AuthorPage from "./pages/AuthorPage.vue";
import NotFoundPage from "./pages/NotFoundPage.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    // ?q= is a search
    { path: "/", name: "home", component: HomePage },
    // ?details= opens the app's details sheet at that section
    { path: "/app/:id", name: "app", component: AppPage, props: true },
    { path: "/author/:name", name: "author", component: AuthorPage, props: true },
    { path: "/:path(.*)*", name: "missing", component: NotFoundPage },
  ],
  scrollBehavior(to, from, saved) {
    if (saved) return saved;
    // a search or a sheet changes the query alone: the page stays where it is
    if (to.path === from.path) return false;
    return { top: 0 };
  },
});
