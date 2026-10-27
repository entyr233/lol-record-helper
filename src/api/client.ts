import { ApiError } from "./errors";
import { postJson } from "./transport";
import { captchaAllowed, needsCaptcha, runCaptchaVerification } from "./captcha";
import { assertResponse, invalidResponse } from "./contracts";
import { createRequestGate } from "./requestGate";
import { createDetailCache } from "./detailCache";
import type {
  BattleDetail,
  BattleCount,
  BattleOverview,
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
const MAX_RETRY_AFTER_MS = 10000;

export interface RequestOptions {
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
      reject(new DOMException("aborted", "AbortError"));
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

// A long server delay must not be shortened into an early retry.
function retryAfterMs(value: string | null): number {
  const text = value?.trim() ?? "";
  if (/^\d+$/.test(text)) return Number(text) * 1000;
  // HTTP-date permits the standard form and two historical forms. asctime is UTC.
  const httpDate = /^(?:[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4}|[A-Za-z]+, \d{2}-[A-Za-z]{3}-\d{2}) \d{2}:\d{2}:\d{2} GMT$/;
  const asctime = /^[A-Za-z]{3} [A-Za-z]{3} {1,2}\d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/;
  const date = httpDate.test(text) ? Date.parse(text) : asctime.test(text) ? Date.parse(text + " GMT") : NaN;
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 1000;
}

async function post<T>(method: string, body: unknown, options: RequestOptions, acquire: ReturnType<typeof createRequestGate>): Promise<T> {
  const { signal, timeoutMs = DEFAULT_TIMEOUT, retries = 1 } = options;
  if (signal && signal.aborted) {
    throw new DOMException("aborted", "AbortError");
  }
  let attempt = 0;
  let rateLimitWaitMs = 0;

  for (;;) {
    const box = withTimeout(signal, timeoutMs);
    let release: (() => void) | undefined;
    let retryDelay = 300 * (attempt + 1);
    // Fetch failures, HTTP 5xx and bounded 429 delays are retryable; JSON/business errors are not.
    let retryable = true;
    try {
      release = await acquire(box.signal);
      if (box.signal.aborted) throw box.signal.reason;
      // 用户脚本环境走 GM 传输（自动带 wegame cookie），普通页面走 fetch
      const response = await postJson(API_BASE + "/" + method, body ?? {}, {
        signal: box.signal,
        timeoutMs: timeoutMs,
        headers: { "trpc-caller": "wegame.pallas.web.LolBattle" }
      });
      retryable = response.status >= 500;
      if (!response.ok) {
        if (response.status === 429) {
          retryDelay = retryAfterMs(response.headers.get("Retry-After"));
          retryable = retryDelay <= MAX_RETRY_AFTER_MS - rateLimitWaitMs;
        }
        // We will not read an HTTP error body; release its stream before retrying.
        const stream = (response as { body?: { cancel?: () => void } }).body;
        try { stream?.cancel?.(); } catch { /* 释放失败不影响主流程 */ }
        if (response.status === 429) {
          throw new ApiError("429", method, "请求过于频繁，请稍后重试");
        }
        throw new ApiError(String(response.status), method, "HTTP " + response.status);
      }

      retryable = false;
      const payload: unknown = await response.json();
      assertResponse(method, payload);
      return payload as T;
    } catch (error) {
      if (signal && signal.aborted) throw new DOMException("aborted", "AbortError");
      if (attempt >= retries || !(retryable || box.signal.aborted)) {
        throw box.signal.aborted ? box.signal.reason : error instanceof SyntaxError ? invalidResponse(method) : error;
      }
      if (error instanceof ApiError && error.code === "429") rateLimitWaitMs += retryDelay;
    } finally {
      // Keep both the deadline and the external abort listener until the body is read.
      box.dispose();
      release?.();
    }

    attempt += 1;
    await delay(retryDelay, signal);
  }
}

export interface LolBattleApi {
  searchPlayer(nickname: string, options?: RequestOptions): Promise<PlayerSearchResult[]>;
  getSummonerInfo(rq: RqOptions, options?: RequestOptions): Promise<Summoner>;
  getBattleReport(rq: RqOptions, options?: RequestOptions): Promise<BattleCount>;
  /** 现任格式：战绩总览（列表 + 赛季段位 + 维度百分位） */
  getBattleOverview(rq: RqOptions, options?: RequestOptions): Promise<BattleOverview>;
  getBattleList(rq: RqOptions, params: { count: number; offset: number }, options?: RequestOptions): Promise<GetBattleListResponse["battles"]>;
  getBattleDetail(rq: RqOptions, gameId: string, options?: RequestOptions): Promise<GetBattleDetailResponse>;
}

export function createLolBattleApi(): LolBattleApi {
  const acquire = createRequestGate(4);
  const request = async <T>(method: string, body: unknown, options: RequestOptions = {}): Promise<T> => {
    try {
      return await post<T>(method, body, options, acquire);
    } catch (error) {
      // 人机验证门槛（8000022 现任确认 / 8000120 搜索与详情实测）：验证后重试一次
      if (error instanceof ApiError && needsCaptcha(error.code) && captchaAllowed() && !(options.signal?.aborted)) {
        try {
          await runCaptchaVerification();
          const retried = await post<T>(method, body, options, acquire);
          return retried;
        } catch (cause) {
          // 验证环节本身失败（SDK 加载失败/用户取消）：原因附到最终错误里，界面可见
          if (cause instanceof ApiError && String(cause.code).startsWith("CAPTCHA")) {
            throw new ApiError(error.code, error.method, error.displayMessage + "；验证环节：" + cause.message);
          }
          // 验证通过但重试仍是验证门槛：别再循环，抛重试的错误
          if (cause instanceof ApiError && needsCaptcha(cause.code)) {
            throw new ApiError(cause.code, cause.method, "人机验证已通过但仍被拒绝（" + cause.code + "）");
          }
          throw cause instanceof ApiError ? cause : error;
        }
      }
      if (error instanceof ApiError && (error.isUnauthenticated || error.isHidden || error.needsCaptcha
        || ["401", "403", "8000009", "8000021"].includes(String(error.code)))) details.clear();
      throw error;
    }
  };
  const details = createDetailCache((body, options) => request<GetBattleDetailResponse>("GetBattleDetail", body, options));
  return {
    async searchPlayer(nickname, options) {
      const res = await request<SearchPlayerResponse>("SearchPlayer", { nickname, from_src: "lol_helper" }, options);
      return res.players;
    },
    async getSummonerInfo(rq, options) {
      const res = await request<GetSummonerInfoResponse>("GetSummonerInfo", rq, options);
      return res.summoner;
    },
    async getBattleReport(rq, options) {
      // 现行格式要求 sids（255 = 全部赛季），否则拿不到 season_list 段位信息
      const res = await request<GetBattleReportResponse>("GetBattleReport", { ...rq, sids: [255] }, options);
      return res.battle_count;
    },
    async getBattleOverview(rq, options) {
      // 现任前端的调用格式（gameids 传空数组 = 最近对局总览；source: "lcu"）
      return request<BattleOverview>("GetBattleOverview", { ...rq, gameids: [], source: "lcu" }, { timeoutMs: 15000, ...options });
    },
    async getBattleList(rq, params, options) {
      const res = await request<GetBattleListResponse>("GetBattleList", { ...rq, ...params }, options);
      return res.battles;
    },
    async getBattleDetail(rq, gameId, options) {
      return details.get(rq, gameId, options);
    }
  };
}

export const lolBattleApi = createLolBattleApi();

export type { BattleDetail, BattleCount, BattleOverview, Summoner, PlayerSearchResult };
