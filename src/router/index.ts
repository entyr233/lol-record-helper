import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { getLoginUser, isSdkAvailable } from "../utils/weGameLogin";

/** 每次挂载都新建 router：避免宿主页面重复注入时复用状态 */
export function createLolRouter(): Router {
  return createRouter({
    // 用 memory history：面板是注入到别人页面里的，不应该改写宿主页地址栏
    history: createMemoryHistory(),
    routes: [
      {
        path: "/",
        component: () => import("../views/SummaryShell.vue"),
        children: [
          { path: "", name: "bind-area", component: () => import("../views/BindAreaView.vue") },
          { path: "search/:nickname", name: "search", component: () => import("../views/SearchView.vue"), props: true },
          {
            path: "area/:area",
            name: "area",
            component: () => import("../views/SelfView.vue"),
            props: true,
            // 「我的战绩」：在导航阶段解析登录用户，再重定向到自己的详情页。
            // 不要放到组件的 onMounted 里做——Vue Router 4 里挂载期发起的导航可能一直处于 pending。
            beforeEnter: async (to) => {
              if (!isSdkAvailable()) return true;
              const user = await getLoginUser();
              if (!user || !user.uin) return true;
              return {
                name: "summary",
                params: { area: String(to.params.area ?? ""), accountType: "1", id: String(user.uin) }
              };
            }
          },
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
