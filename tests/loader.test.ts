import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildUiUrls, diagnosticsText, normalizeUiText, sha256Hex } from "../userscript/src/loader";

describe("userscript loader", () => {
  it("统一 CRLF 并生成稳定的 SHA-256", async () => {
    expect(normalizeUiText("a\r\nb")).toBe("a\nb");
    const expected = createHash("sha256").update("a\nb", "utf8").digest("hex");
    await expect(sha256Hex("a\r\nb")).resolves.toBe(expected);
  });

  it("Release 资产优先，jsDelivr ui 分支兜底", () => {
    const urls = buildUiUrls("owner/repo", "v1.2.3");
    expect(urls).toHaveLength(3);
    expect(urls[0]).toBe("https://github.com/owner/repo/releases/download/v1.2.3/lol-tft-ui.js");
    expect(urls[1]).toBe("https://cdn.jsdelivr.net/gh/owner/repo@ui/versions/v1.2.3/lol-tft-ui.js");
    expect(urls[2]).toBe("https://fastly.jsdelivr.net/gh/owner/repo@ui/versions/v1.2.3/lol-tft-ui.js");
    expect(buildUiUrls("owner/repo", "v1.2.4")[1]).not.toBe(urls[1]);
  });

  it("诊断信息不包含 cookie 字段", () => {
    const text = diagnosticsText({
      version: "2.15.0",
      sha256: "abc",
      href: "https://www.wegame.com.cn/",
      userAgent: "test",
      error: new Error("boom")
    });
    expect(text).toContain("LOL 战绩助手 v2.15.0");
    expect(text).toContain("boom");
    expect(text).not.toContain("cookie");
  });
});
