import { createRouter, createWebHashHistory, type Router } from "vue-router";

/** 每次挂载都新建 router：避免宿主页面重复注入时复用状态 */
export function createLolRouter(): Router {
  return createRouter({
    history: createWebHashHistory(),
    routes: [
      {
        path: "/",
        component: () => import("../views/SummaryShell.vue"),
        children: [
          { path: "", name: "bind-area", component: () => import("../views/BindAreaView.vue") },
          { path: "search/:nickname", name: "search", component: () => import("../views/SearchView.vue"), props: true },
          { path: "area/:area", name: "area", component: () => import("../views/SelfView.vue"), props: true },
          {
            path: "area/:area/type/:accountType/id/:id",
            name: "summary",
            component: () => import("../views/SummaryView.vue"),
            props: true
          },
          { path: ":pathMatch(.*)*", redirect: "/" }
        ]
      }
    ]
  });
}
