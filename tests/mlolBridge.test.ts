import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BRIDGE_ORIGIN = "https://lol.qq.com";

/** 桥接页回传的响应（模拟 userscript 的 postMessage），origin 必须匹配 */
function dispatchBridgeResponse(data: Record<string, unknown>): void {
  globalThis.dispatchEvent(new MessageEvent("message", { origin: BRIDGE_ORIGIN, data }));
}

function makeMlolPayload(): unknown {
  return {
    data: {
      info: {
        game_id: "bridge-game",
        start_time_ts: 1700000000,
        duration_ts: 1800,
        battle_map_id: 11,
        game_queue_id: 420,
        win: true,
        match: {
          my_team: [
            { uuid: "uuid-me", team_id: "100", champion_id: 57, name: "%E6%88%91", champions_killed: 8, num_deaths: 2, assists: 6 },
            { uuid: "uuid-mate", team_id: "100", champion_id: 22, name: "%E9%98%9F%E5%8F%8B", champions_killed: 3, num_deaths: 5, assists: 9 }
          ],
          opponent_team: [
            { uuid: "uuid-opp", team_id: "200", champion_id: 103, name: "%E5%AF%B9%E6%89%8B", champions_killed: 2, num_deaths: 7, assists: 4 }
          ]
        }
      }
    }
  };
}

interface BridgeHarness {
  posted: Array<Record<string, unknown>>;
  restore: () => void;
}

/** 把隐藏 iframe 的 contentWindow 换成可观测的假对象，从而拿到请求 id */
function installBridgeHarness(): BridgeHarness {
  const posted: Array<Record<string, unknown>> = [];
  const fakeWindow = {
    postMessage: (message: Record<string, unknown>) => { posted.push(message); }
  };
  const original = document.body.appendChild.bind(document.body);
  const spy = vi.spyOn(document.body, "appendChild").mockImplementation(((node: Node) => {
    if (node instanceof HTMLIFrameElement) {
      Object.defineProperty(node, "contentWindow", { configurable: true, value: fakeWindow });
    }
    return node;
  }) as typeof document.body.appendChild);
  return {
    posted,
    restore: () => {
      spy.mockRestore();
      document.body.appendChild = original;
    }
  };
}

async function waitForRequest(harness: BridgeHarness): Promise<Record<string, unknown>> {
  dispatchBridgeResponse({ type: "lol-tft-bridge-ready" });
  for (let i = 0; i < 10 && harness.posted.length === 0; i += 1) {
    await Promise.resolve();
  }
  const request = harness.posted[0];
  if (!request) throw new Error("桥接请求未发出");
  return request;
}

let harness: BridgeHarness | null = null;

beforeEach(() => {
  vi.resetModules();
  harness = installBridgeHarness();
});

afterEach(() => {
  harness?.restore();
  harness = null;
});

describe("掌盟桥接消息约定", () => {
  it("userscript 发送的响应类型都能被接收端识别（不会因命名不一致一直等到超时）", () => {
    const template = readFileSync("userscript/lol-tft.template.js", "utf8");
    const sentTypes = [...template.matchAll(/type:\s*"([^"]+)"/g)].map((match) => match[1]!);
    const responseTypes = sentTypes.filter((type) => type.endsWith("-response"));
    expect(responseTypes.length).toBeGreaterThan(0);

    return import("../src/api/mlolDetail").then(({ BRIDGE_RESPONSE_TYPES }) => {
      for (const type of responseTypes) {
        expect(BRIDGE_RESPONSE_TYPES as readonly string[]).toContain(type);
      }
    });
  });

  it("成功响应能结束等待并解析出详情", async () => {
    const { fetchMlolBattleDetail } = await import("../src/api/mlolDetail");
    const promise = fetchMlolBattleDetail({ gameId: "bridge-game", areaId: 1, startTime: 1700000000000 });
    const request = await waitForRequest(harness!);

    dispatchBridgeResponse({
      type: "lol-tft-mlol-response",
      id: request.id,
      text: JSON.stringify(makeMlolPayload())
    });

    const detail = await promise;
    expect(detail.game_id).toBe("bridge-game");
    expect(detail.player_details).toHaveLength(3);
    expect(detail.player_details[0]!.championId).toBe(57);
  });

  it("失败响应同样结束等待，并抛出可读错误", async () => {
    const { fetchMlolBattleDetail } = await import("../src/api/mlolDetail");
    const promise = fetchMlolBattleDetail({ gameId: "bridge-game", areaId: 1, startTime: 1700000000000 });
    const request = await waitForRequest(harness!);

    dispatchBridgeResponse({
      type: "lol-tft-mlol-response",
      id: request.id,
      error: "桥接请求失败"
    });

    await expect(promise).rejects.toMatchObject({ code: "BRIDGE_ERROR", message: "桥接请求失败" });
  });
});
