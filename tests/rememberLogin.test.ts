import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LoginCookie } from "../userscript/src/types";
import { rememberLogin } from "../userscript/src/rememberLogin";

const origin = "https://www.wegame.com.cn";
const base: LoginCookie = { name: "tgp_ticket", value: "fixture", hostOnly: true, domain: "www.wegame.com.cn",
  path: "/", secure: true, httpOnly: true, session: true, sameSite: "unspecified" };

beforeEach(() => vi.stubGlobal("location", new URL(origin)));
afterEach(() => vi.unstubAllGlobals());

it("菜单只在 WeGame HTTPS 页面处理登录 Cookie", async () => {
  const list = vi.fn();
  vi.stubGlobal("GM", { cookie: { list, set: vi.fn() } });
  for (const url of ["https://elsewhere.test", "http://www.wegame.com.cn"]) {
    vi.stubGlobal("location", new URL(url));
    expect(await rememberLogin()).toContain("官网");
  }
  expect(list).not.toHaveBeenCalled();
});

it("必要票据不可读时不持久化账号标识", async () => {
  const set = vi.fn();
  vi.stubGlobal("GM", { cookie: { list: vi.fn().mockResolvedValue([]), set } });
  expect(await rememberLogin()).toContain("未读到");
  expect(set).not.toHaveBeenCalled();
});

it("管理器忽略 SameSite 时不会重写受保护的票据", async () => {
  const set = vi.fn();
  const list = async ({ name }: { name: string }) => {
    if (name === "tgp_ticket") return [{ ...base, sameSite: "strict" }];
    if (name === "uin") return [{ ...base, name, httpOnly: false }];
    return name.startsWith("__Host-") ? [{ ...base, name }] : [];
  };
  vi.stubGlobal("GM", { cookie: { list, set } });
  expect(await rememberLogin()).toContain("无法保留");
  expect(set).toHaveBeenCalledTimes(1);
  expect(set.mock.calls[0][0].name).toMatch(/^__Host-lol-tft-check-/);
});

it("写入被静默拒绝时不报告成功", async () => {
  const set = vi.fn();
  const list = async ({ name }: { name: string }) =>
    ["p_uin", "tgp_ticket"].includes(name) ? [{ ...base, name }] : [];
  vi.stubGlobal("GM", { cookie: { list, set } });
  expect(await rememberLogin()).toContain("未能完整保存");
});
