import { readFileSync } from "node:fs";
import { chromium, expect, test } from "@playwright/test";

const origin = "https://www.wegame.com.cn";
const shell = readFileSync("userscript/lol-tft.user.js", "utf8");

for (const mode of ["脚本菜单", "专用窗口"]) test(mode + "：重开后仍能认证，注销后保持退出", async ({ browserName, channel }, testInfo) => {
  test.skip(browserName !== "chromium", "此测试覆盖 Chromium 浏览器进程重启");
  test.setTimeout(90_000);
  const profile = testInfo.outputPath("profile");
  const expires = Math.floor(Date.now() / 1000) + 3600;

  for (const step of ["登录", "重开", "注销后重开"]) {
    const context = await chromium.launchPersistentContext(profile, {
      channel: channel ?? "chromium",
      // 恢复标签页可能早于拦截器注册。测试期间禁止外部域名解析。
      args: [...(mode === "专用窗口" ? ["--restore-last-session"] : []), "--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND"]
    });
    try {
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname === "/account") {
          const cookies = await route.request().headerValue("cookie");
          const valid = cookies?.split(/;\s*/).includes("tgp_ticket=fixture-only");
          return route.fulfill({ status: valid ? 200 : 401, body: "" });
        }
        if (url.pathname === "/logout") {
          return route.fulfill({ headers: { "set-cookie": "tgp_ticket=; Path=/; Secure; HttpOnly; Max-Age=0" }, body: "" });
        }
        return route.fulfill({ contentType: "text/html", body: "<html><body></body></html>" });
      });

      if (step === "登录") {
        await context.addCookies([
          { url: origin, name: "tgp_ticket", value: "fixture-only", secure: true, httpOnly: true },
          { url: origin, name: "p_uin", value: "o10001", secure: true, expires },
          { url: origin, name: "unrelated", value: "session-only", secure: true }
        ]);
      }
      const page = await context.newPage();
      await page.goto(origin + "/helper/lol/");
      if (mode === "脚本菜单" && step === "登录") {
        // 用隔离配置中的两枚测试 Cookie 模拟管理器接口；落盘、发送与重启由真实浏览器执行。
        await page.exposeFunction("listFixture", async ({ name }: { name: string }) => {
          if (!["tgp_ticket", "p_uin"].includes(name)) return [];
          return (await context.cookies(origin)).filter(item => item.name === name).map(item => ({
            ...item, hostOnly: true, session: item.expires < 0, sameSite: "unspecified", expirationDate: item.expires
          }));
        });
        await page.exposeFunction("setFixture", async (item: { name: string; value: string; expirationDate: number; httpOnly: boolean; secure: boolean }) => {
          expect(item).toMatchObject({ name: "tgp_ticket", value: "fixture-only", httpOnly: true, secure: true, path: "/" });
          await context.addCookies([{ url: origin, name: item.name, value: item.value, expires: item.expirationDate, httpOnly: item.httpOnly, secure: item.secure }]);
        });
        await page.addScriptTag({ content: `
          window.GM = { cookie: { list: listFixture, set: setFixture } };
          window.GM_registerMenuCommand = (title, action) => {
            if (title === "保持本机登录（最多 7 天）") {
              const button = document.createElement("button");
              button.textContent = title;
              button.onclick = action;
              document.body.append(button);
            }
          };
        ` });
      }
      await page.addScriptTag({ content: shell });
      if (mode === "脚本菜单" && step === "登录") {
        const dialog = page.waitForEvent("dialog").then(async dialog => {
          const message = dialog.message();
          await dialog.accept();
          expect(message).toContain("已在此浏览器保存");
        });
        await page.getByRole("button", { name: "保持本机登录（最多 7 天）" }).click();
        await dialog;
      }
      if (mode === "脚本菜单" && step === "重开") {
        expect((await context.cookies(origin)).some(item => item.name === "unrelated")).toBe(false);
      }
      const accountCookie = (await context.cookies(origin)).find(cookie => cookie.name === "p_uin");
      if (step === "注销后重开") {
        expect(accountCookie).toBeUndefined();
        expect(await page.evaluate(() => window.TGP?.status?.uin)).toBeUndefined();
      } else {
        expect(accountCookie?.expires).toBe(expires);
        expect(accountCookie?.secure).toBe(true);
        expect(await page.evaluate(() => window.TGP?.status?.uin)).toBe("10001");
      }
      expect(await page.evaluate(() => document.cookie)).not.toContain("tgp_ticket");
      expect(await page.evaluate(async () => (await fetch("/account")).status))
        .toBe(step === "注销后重开" ? 401 : 200);
      if (step === "重开") {
        await page.evaluate(async () => {
          await fetch("/logout");
          document.cookie = "p_uin=; Path=/; Secure; Max-Age=0";
        });
      }
    } finally {
      await context.close();
    }
  }
});
