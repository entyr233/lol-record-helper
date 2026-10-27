import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { getLoginUser, getSelfUinFromCookie } from "../utils/weGameLogin";

/** 每次挂载都新建 router：避免宿主页面重复注入时复用状态 */
export function createLolRouter(signal?: AbortSignal): Router {
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
          { path: "mlol", name: "mlol", component: () => import("../components/MlolQueryView.vue") },
          {
            path: "area/:area",
            name: "area",
            component: () => import("../views/SelfView.vue"),
            props: true,
            // 「我的战绩」：在导航阶段解析登录用户，再重定向到自己的详情页。
            // 不要放到组件的 onMounted 里做——Vue Router 4 里挂载期发起的导航可能一直处于 pending。
            beforeEnter: async (to) => {
              // cookie 优先：接口真正吃的是登录 cookie，而且不碰 SDK 就不会触发票据握手
              const cookieUin = getSelfUinFromCookie();
              if (cookieUin) {
                return {
                  name: "summary",
                  params: { area: String(to.params.area ?? ""), accountType: "1", id: cookieUin }
                };
              }
              try {
                const user = await getLoginUser({ signal });
                if (signal?.aborted) return false;
                return {
                  name: "summary",
                  params: { area: String(to.params.area ?? ""), accountType: "1", id: user.uin }
                };
              } catch {
                // 兜底页提供显式重试；错误不携带 SDK 原始对象或账号值。
                return signal?.aborted ? false : true;
              }
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
