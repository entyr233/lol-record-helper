import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const REPO = "https://github.com/entyr233/lol-record-helper";
const RAW = "https://raw.githubusercontent.com/entyr233/lol-record-helper";
const files = {
  shell: readFileSync("userscript/lol-tft.user.js", "utf8"),
  manifest: JSON.parse(readFileSync("userscript/manifest.json", "utf8")) as { repo: string },
  readme: readFileSync("readme.md", "utf8"),
  pkg: JSON.parse(readFileSync("package.json", "utf8")) as {
    name: string;
    repository?: { url?: string };
    homepage?: string;
    bugs?: { url?: string };
  }
};

describe("仓库元信息一致性", () => {
  it("manifest、脚本、README、package.json 都指向当前仓库", () => {
    expect(files.shell).toContain(RAW);
    expect(files.shell).toContain(REPO);
    expect("https://github.com/" + files.manifest.repo).toBe(REPO);
    expect(files.readme).toContain(REPO);
    expect(files.pkg.repository?.url).toBe("git+" + REPO + ".git");
    expect(files.pkg.homepage).toBe(REPO);
    expect(files.pkg.bugs?.url).toBe(REPO + "/issues");
  });

  it("不再残留旧仓库地址", () => {
    for (const [name, text] of Object.entries(files)) {
      const serialized = typeof text === "string" ? text : JSON.stringify(text);
      expect(serialized, name).not.toContain("entyr233/lol-tft");
    }
  });
});
