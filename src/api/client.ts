import { ApiError } from "./errors";
import type {
  BattleDetail,
  BattleCount,
  GetBattleDetailResponse,
  GetBattleListResponse,
  GetBattleReportResponse,
  GetSummonerInfoResponse,
  PlayerSearchResult,
  RqOptions,
  SearchPlayerResponse,
  Summoner
} from "./types";

export const API_BASE = "/api/v1/wegame.pallas.game.LolBattle";
const DEFAULT_TIMEOUT = 12000;

interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
}

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), timeoutMs);
  const onAbort = () => controller.abort(signal ? signal.reason : undefined);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
    }
  };
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      const reason = signal && signal.reason;
      reject(reason instanceof Error ? reason : new DOMException("aborted", "AbortError"));
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

async function post<T>(method: string, body: unknown, options: RequestOptions = {}): Promise<T> {
  const { signal, timeoutMs = DEFAULT_TIMEOUT, retries = 1 } = options;
  if (signal && signal.aborted) {
    throw new DOMException("aborted", "AbortError");
  }
  let attempt = 0;

  for (;;) {
    const box = withTimeout(signal, timeoutMs);
    let response: Response;
    try {
      response = await fetch(API_BASE + "/" + method, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "trpc-caller": "wegame.pallas.web.LolBattle"
        },
        signal: box.signal
      });
    } catch (error) {
      box.dispose();
      const retryable = attempt < retries && !(signal && signal.aborted);
      if (retryable) {
        attempt += 1;
        await delay(300 * attempt, signal);
        continue;
      }
      if (signal && signal.aborted) throw new DOMException("aborted", "AbortError");
      throw error;
    }
    box.dispose();

    if (!response.ok) {
      if (response.status >= 500 && attempt < retries) {
        attempt += 1;
        await delay(300 * attempt, signal);
        continue;
      }
      throw new ApiError(String(response.status), method, "HTTP " + response.status);
    }

    const payload = (await response.json()) as T & { result?: { error_code?: number | string; error_message?: string } };
    const result = payload.result;
    if (result && result.error_code && String(result.error_code) !== "0") {
      throw new ApiError(result.error_code, method, result.error_message);
    }
    return payload;
  }
}

export interface LolBattleApi {
  searchPlayer(nickname: string, options?: RequestOptions): Promise<PlayerSearchResult[]>;
  getSummonerInfo(rq: RqOptions, options?: RequestOptions): Promise<Summoner>;
  getBattleReport(rq: RqOptions, options?: RequestOptions): Promise<BattleCount>;
  getBattleList(rq: RqOptions, params: { count: number; offset: number }, options?: RequestOptions): Promise<GetBattleListResponse["battles"]>;
  getBattleDetail(rq: RqOptions, gameId: string, options?: RequestOptions): Promise<GetBattleDetailResponse>;
}

export const lolBattleApi: LolBattleApi = {
  async searchPlayer(nickname, options) {
    const res = await post<SearchPlayerResponse>("SearchPlayer", { nickname, from_src: "lol_helper" }, options);
    return res.players ?? [];
  },
  async getSummonerInfo(rq, options) {
    const res = await post<GetSummonerInfoResponse>("GetSummonerInfo", rq, options);
    return res.summoner;
  },
  async getBattleReport(rq, options) {
    const res = await post<GetBattleReportResponse>("GetBattleReport", rq, options);
    return res.battle_count;
  },
  async getBattleList(rq, params, options) {
    const res = await post<GetBattleListResponse>("GetBattleList", { ...rq, ...params }, options);
    return res.battles ?? [];
  },
  async getBattleDetail(rq, gameId, options) {
    return post<GetBattleDetailResponse>("GetBattleDetail", { ...rq, game_id: gameId }, options);
  }
};

export type { BattleDetail, BattleCount, Summoner, PlayerSearchResult };
