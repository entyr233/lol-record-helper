// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("userscript/lol-tft.user.js", "utf8");

describe("脚本桥接端", () => {
  it("只接受详情请求，以 POST 表单发送并回传响应；忽略通用接口请求和非 WeGame 来源", async () => {
    let receive!: (event: { origin: string; data: Record<string, unknown>; source: { postMessage: ReturnType<typeof vi.fn> } }) => void;
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, text: async () => '{"ok":true}' });
    const postMessage = vi.fn();
    new Function("location", "globalThis", "window", "fetch", "setTimeout", source)(
      { hostname: "lol.qq.com" }, { addEventListener: (_type: string, handler: typeof receive) => { receive = handler; } },
      { parent: null }, fetchMock, vi.fn()
    );
    receive({ origin: "https://www.wegame.com.cn", data: { type: "lol-tft-mlol-request", id: "unused" }, source: { postMessage } });
    receive({ origin: "https://example.invalid", data: { type: "lol-tft-detail-request", id: "wrong" }, source: { postMessage } });
    expect(fetchMock).not.toHaveBeenCalled();
    receive({ origin: "https://www.wegame.com.cn", data: { type: "lol-tft-detail-request", id: "detail", areaId: 1, gameId: "g1" }, source: { postMessage } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("https://mlol.qt.qq.com/go/battle_info/get_battle_detail_h5");
    expect(request.method).toBe("POST");
    expect(request.body.get("game_id")).toBe("g1");
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      { type: "lol-tft-mlol-response", id: "detail", status: 200, text: '{"ok":true}' }, "https://www.wegame.com.cn"
    ));
  });
});
