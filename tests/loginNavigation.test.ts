import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppHeader from "../src/components/AppHeader.vue";
import { isNavigationFailure } from "vue-router";
import { createLolRouter } from "../src/router";
import type { WeGameLoginSdk } from "../src/types/wegame-login";
import { toRqOptions } from "../src/composables/useUserInfo";
import { useLoginAction } from "../src/composables/useLoginAction";

vi.mock("../src/views/SummaryView.vue", () => ({ default: { template: "<p>summary</p>" } }));
vi.mock("../src/api/staticData", () => ({ ensureDdragonVersion: vi.fn() }));
vi.mock("../src/components/DevDataBar.vue", () => ({ default: { template: "<span />" } }));

let wrapper: VueWrapper | undefined;
function install(overrides: Partial<WeGameLoginSdk> = {}) {
  const api: WeGameLoginSdk = {
    isLogin: () => true, logout: vi.fn(), getUserInfo: () => ({}),
    getLoginUser: vi.fn(async () => ({})), popup: vi.fn(), ...overrides
  };
  window.WegameLogin = { default: api };
  return api;
}
async function render() {
  const router = createLolRouter();
  await router.push("/");
  wrapper = mount(defineComponent({ components: { AppHeader }, template: "<AppHeader /><router-view />" }), {
    global: { plugins: [router] }
  });
  await router.isReady();
  return router;
}
function button(text: string) {
  return wrapper!.findAll("button").find((item) => item.text() === text)!;
}
async function enterFallback(router: ReturnType<typeof createLolRouter>) {
  const navigation = router.push({ name: "area", params: { area: "1" } });
  await flushPromises();
  await vi.advanceTimersByTimeAsync(4000);
  await navigation;
  await vi.dynamicImportSettled();
  await flushPromises();
  expect(router.currentRoute.value.name).toBe("area");
}

beforeEach(() => { vi.useFakeTimers(); delete window.WegameLogin; localStorage.clear(); });
afterEach(() => { wrapper?.unmount(); wrapper = undefined; delete window.WegameLogin; vi.clearAllTimers(); vi.useRealTimers(); });

describe("login navigation with the real SDK adapter", () => {
  it("查看其他大区玩家不覆盖个人大区，我的战绩返回个人大区；主动选择才保存", async () => {
    install({ getLoginUser: async () => ({ uin: "12345" }) });
    const router = await render();
    await wrapper!.get(".area-select").setValue("1");
    await flushPromises();
    expect(localStorage.getItem("lol_tft:last-area")).toBe('"1"');
    await router.push({ name: "summary", params: { area: "3", accountType: "2", id: "other" } });
    await flushPromises();
    expect(localStorage.getItem("lol_tft:last-area")).toBe('"1"');
    expect(localStorage.getItem("lol_tft:area")).toBe("1");
    await button("我的战绩").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.params).toMatchObject({ area: "1", accountType: "1", id: "12345" });
    await wrapper!.get(".area-select").setValue("3");
    await flushPromises();
    expect(localStorage.getItem("lol_tft:last-area")).toBe('"3"');
    expect(router.currentRoute.value.params).toMatchObject({ area: "3", accountType: "1" });
  });

  it("空 SDK fallback 后迟到，立即登录按钮动态出现；点击恢复账号保持旧 account_type=1", async () => {
    const router = await render();
    await enterFallback(router);
    expect(button("立即登录")).toBeUndefined();
    install({ getLoginUser: async () => ({ uin: "90071992547409931234" }) });
    await vi.advanceTimersByTimeAsync(500);
    expect(button("立即登录")).toBeDefined();
    await button("重新读取账号").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("summary");
    expect(toRqOptions(router.currentRoute.value.params as { area: string; accountType: string; id: string })).toMatchObject({
      account_type: 1, id: "90071992547409931234"
    });
  });

  it("同一路由连续点我的战绩，每次都重新解析，失败可见，恢复才跳 summary", async () => {
    const api = install();
    const router = await render();
    await enterFallback(router);
    const read = vi.mocked(api.getLoginUser);
    const before = read.mock.calls.length;
    await button("我的战绩").trigger("click");
    await vi.advanceTimersByTimeAsync(4000);
    await flushPromises();
    expect(read.mock.calls.length).toBeGreaterThan(before);
    expect(router.currentRoute.value.name).toBe("area");
    expect(wrapper!.text()).toContain("已登录，但尚未读取到账号");
    read.mockResolvedValue({ uin: "12345" });
    await button("我的战绩").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("summary");
    const count = read.mock.calls.length;
    await button("我的战绩").trigger("click");
    await flushPromises();
    expect(read).toHaveBeenCalledTimes(count + 1);
    expect(router.currentRoute.value.params).toMatchObject({ id: "12345", accountType: "1" });
    expect(api.logout).not.toHaveBeenCalled();
  });

  it("进入 area 时等待 SDK ready，再解析账号；不落入错误 fallback", async () => {
    let ready!: () => void;
    const api = install({ readyPromise: new Promise<void>((resolve) => { ready = resolve; }), getLoginUser: vi.fn(async () => ({ uin: "12345" })) });
    const router = await render();
    const navigation = router.push("/area/1");
    await flushPromises();
    expect(api.getLoginUser).not.toHaveBeenCalled();
    ready();
    await navigation;
    expect(router.currentRoute.value.name).toBe("summary");
  });

  it.each(["missing", "throw", "reject"])("fallback popup %s 显示错误且不注销", async (kind) => {
    const api = install({ isLogin: () => false, popup: kind === "missing" ? undefined : () => {
      if (kind === "throw") throw new Error("private");
      return Promise.reject(new Error("private"));
    } });
    const router = await render();
    await enterFallback(router);
    await button("立即登录").trigger("click");
    await flushPromises();
    expect(wrapper!.text()).toContain("无法打开 WeGame 登录窗口");
    expect(router.currentRoute.value.name).toBe("area");
    expect(api.logout).not.toHaveBeenCalled();
  });

  it("弹窗登录标志为真但 UIN 不可读时保持等待，可取消并重新读取", async () => {
    const api = install({ isLogin: () => false });
    const router = await render();
    await enterFallback(router);
    api.isLogin = () => true;
    await button("立即登录").trigger("click");
    await vi.advanceTimersByTimeAsync(1000);
    expect(router.currentRoute.value.name).toBe("area");
    expect(button("取消等待")).toBeDefined();
    await button("取消等待").trigger("click");
    await flushPromises();
    expect(wrapper!.text()).toContain("已取消登录操作");
    api.getLoginUser = async () => ({ uin: "23456" });
    await button("重新读取账号").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("summary");
    expect(api.logout).not.toHaveBeenCalled();
  });

  it("fallback 操作中卸载，迟到账号不能继续导航，轮询被清理", async () => {
    const api = install({ isLogin: () => false });
    const router = await render();
    await enterFallback(router);
    let resolve!: (user: { uin: string }) => void;
    api.isLogin = () => true;
    api.getLoginUser = () => new Promise((done) => { resolve = done; });
    const navigate = vi.spyOn(router, "replace");
    await button("重新读取账号").trigger("click");
    await flushPromises();
    wrapper!.unmount(); wrapper = undefined;
    resolve({ uin: "12345" });
    await flushPromises();
    expect(navigate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("mount unmount 取消路由守卫，重开可正常解析", async () => {
    const { mountLolTft } = await import("../src/mount");
    let ready!: () => void;
    install({ readyPromise: new Promise<void>((resolve) => { ready = resolve; }), getLoginUser: async () => ({ uin: "12345" }) });
    const host = document.createElement("div");
    const instance = mountLolTft({ host });
    await instance.router.isReady();
    const navigation = instance.router.push("/area/1");
    await flushPromises();
    instance.unmount();
    ready();
    expect(isNavigationFailure(await navigation)).toBe(true);
    expect(instance.router.currentRoute.value.name).not.toBe("summary");
    host.remove();
    const nextHost = document.createElement("div");
    const reopened = mountLolTft({ host: nextHost });
    try {
      await reopened.router.isReady();
      await reopened.router.push("/area/1");
      expect(reopened.router.currentRoute.value.name).toBe("summary");
    } finally { reopened.unmount(); nextHost.remove(); }
    expect(vi.getTimerCount()).toBe(0);
  });

  it("useLoginAction 空闲取消和卸载不写响应状态，pending 卸载也不显示取消", async () => {
    let action!: ReturnType<typeof useLoginAction>;
    wrapper = mount(defineComponent({ setup() { action = useLoginAction(); return () => null; } }));
    action.cancel();
    expect(action.loginError.value).toBe("");
    let signal!: AbortSignal;
    const pending = action.run(async (current) => { signal = current; await new Promise(() => {}); });
    void pending;
    await nextTick();
    wrapper.unmount(); wrapper = undefined;
    expect(signal.aborted).toBe(true);
    expect(action.loginError.value).toBe("");
  });
});
