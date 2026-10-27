import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import DevDataBar from "../src/components/DevDataBar.vue";

const devToken = "fake-development-token";
const cookie = "FAKE_ONLY=provided";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("DevDataBar session protocol", () => {
  it("POST 携带 JSON 和 token，业务校验失败时显示原因并保留输入框", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ mode: "mock", devToken }))
      .mockResolvedValueOnce(json({ mode: "mock", check: { ok: false, code: 8000102, reason: "未登录，未切换数据源" } }));
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mount(DevDataBar);
    try {
      await flushPromises();
      await wrapper.get("button").trigger("click");
      await wrapper.get("textarea").setValue(cookie);
      await wrapper.findAll("button")[0]!.trigger("click");
      await flushPromises();

      expect(fetchMock).toHaveBeenNthCalledWith(2, "/__lol-tft/cookie", {
        method: "POST",
        headers: { "content-type": "application/json", "x-lol-tft-dev-token": devToken },
        body: JSON.stringify({ cookie })
      });
      expect(wrapper.get("textarea").element.value).toBe(cookie);
      expect(wrapper.text()).toContain("8000102");
      expect(wrapper.text()).toContain("未切换数据源");
      expect(wrapper.text()).not.toContain(cookie);
    } finally { wrapper.unmount(); }
  });

  it("DELETE 携带 token 和 JSON Content-Type，失败时提示并保持页面", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ mode: "real", devToken }))
      .mockResolvedValueOnce(json({ error: "开发会话 token 无效" }, 403));
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mount(DevDataBar);
    try {
      await flushPromises();
      await wrapper.get("button").trigger("click");
      await wrapper.findAll("button")[1]!.trigger("click");
      await flushPromises();

      expect(fetchMock).toHaveBeenNthCalledWith(2, "/__lol-tft/cookie", {
        method: "DELETE",
        headers: { "content-type": "application/json", "x-lol-tft-dev-token": devToken }
      });
      expect(wrapper.text()).toContain("HTTP 403");
    } finally { wrapper.unmount(); }
  });

  it("POST 拒绝响应显示错误并保留待重试输入", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ mode: "mock", devToken }))
      .mockResolvedValueOnce(json({ error: "开发会话请求体过大" }, 413));
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mount(DevDataBar);
    try {
      await flushPromises();
      await wrapper.get("button").trigger("click");
      await wrapper.get("textarea").setValue(cookie);
      await wrapper.findAll("button")[0]!.trigger("click");
      await flushPromises();

      expect(wrapper.text()).toContain("开发会话请求体过大");
      expect(wrapper.get("textarea").element.value).toBe(cookie);
    } finally { wrapper.unmount(); }
  });

  it("没有开发 token 时保持隐藏", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ mode: "mock" })));
    const wrapper = mount(DevDataBar);
    try {
      await flushPromises();
      expect(wrapper.find("button").exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });
});
