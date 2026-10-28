import { computed, watch } from "vue";
import { lolBattleApi } from "../api/client";
import { ApiError, toErrorMessage } from "../api/errors";
import { fetchMlolBattleDetail } from "../api/mlolDetail";
import { lastCaptchaAttempt, needsCaptcha } from "../api/captcha";
import type { BattleDetail } from "../api/types";
import { toRqOptions } from "./useUserInfo";
import { useAsyncData } from "./useAsyncData";
import { useLoginAction } from "./useLoginAction";
import { triggerLogin, waitForLogin } from "../utils/weGameLogin";

/** 详情数据来源：wegame = 官方接口（含搜索定位后的重试），mlol = 掌盟公开数据 */
export type DetailSource = "wegame" | "mlol";

/** 失败原因分类：决定提示文案与可执行的操作 */
export type DetailErrorKind = "captcha" | "auth" | "all-failed" | "unknown";

/** 取数需要的最小 props 集合（组件的 defineProps 对象可直接传入） */
export interface BattleDetailRequestProps {
  area: string;
  accountType: string;
  id: string;
  gameId: string | null;
  startTime?: number | string;
  /** 选中对局的队列 id */
  queueId?: number | string;
  mode?: "概要" | "技能" | "伤害";
}

interface GetBattleDetailLike {
  battle_detail: BattleDetail;
  openid: string | null;
  source: DetailSource;
}

/**
 * 对局详情的取数与多来源回退：
 * wegame 同源详情 → 搜索换口径重试（仅 self 场景）→ 掌盟公开详情，并保留失败轨迹。
 * 同时给出数据来源徽标、错误分类提示、诊断信息与登录相关操作。
 */
const DETAIL_CACHE_TTL_MS = 60_000;
const DETAIL_CACHE_MAX = 20;
const detailCache = new Map<string, { at: number; value: GetBattleDetailLike }>();
const detailInflight = new Map<string, Promise<GetBattleDetailLike>>();

function rememberDetail(key: string, value: GetBattleDetailLike): void {
  detailCache.set(key, { at: Date.now(), value });
  while (detailCache.size > DETAIL_CACHE_MAX) {
    const oldest = detailCache.keys().next().value;
    if (oldest === undefined) break;
    detailCache.delete(oldest);
  }
}

/** 测试/调试用：清空详情短期缓存 */
export function clearBattleDetailCache(): void {
  detailCache.clear();
  detailInflight.clear();
}
export function useBattleDetail(options: { props: BattleDetailRequestProps }) {
  const props = options.props;
  const diag = lastCaptchaAttempt;

  const request = useAsyncData(async (signal) => {
    const cacheKey = [props.area, props.accountType, props.id, props.gameId ?? "", props.startTime ?? ""].join("|");
    const cached = detailCache.get(cacheKey);
    if (cached && Date.now() - cached.at < DETAIL_CACHE_TTL_MS) return cached.value;
    const pending = detailInflight.get(cacheKey);
    if (pending) return pending;

    const task = (async () => {
    const rq = toRqOptions({ area: props.area, accountType: props.accountType, id: props.id });
    const trail: string[] = [];
    const codeOf = (error: unknown): string => {
      if (error instanceof ApiError) return String(error.code) + (error.serverMessage ? " " + error.serverMessage : "");
      return error instanceof Error ? error.message.slice(0, 40) : String(error);
    };

    try {
      // 首选：wegame 同源详情
      const result = await lolBattleApi.getBattleDetail(rq, String(props.gameId), { signal });
      return { ...result, source: "wegame" as DetailSource };
    } catch (error) {
      trail.push("wegame详情:" + codeOf(error));
      if (!(error instanceof ApiError) || signal.aborted) throw error;
      // 回退一：详情接口对 account_type=2+openid 的口径可能仍开放——
      // 用召唤师名字搜索自己的 openid，换口径重试（仅 self 场景）
      if (String(rq.account_type) === "1") {
        try {
          const summoner = await lolBattleApi.getSummonerInfo(rq, { signal });
          const players = await lolBattleApi.searchPlayer(summoner.name, { signal });
          const match = players.find((p) => Number(p.area) === Number(props.area));
          trail.push("搜索:" + (match ? "ok" : "无匹配"));
          if (match) {
            const found = await lolBattleApi.getBattleDetail(
              { ...rq, account_type: 2, id: match.openid },
              String(props.gameId),
              { signal }
            );
            return { ...found, source: "wegame" as DetailSource };
          }
        } catch (error) {
          trail.push("搜索:" + codeOf(error));
        }
      }
      // 回退二：掌盟公开详情（桥）
      try {
        const mlol = await fetchMlolBattleDetail({
          gameId: String(props.gameId),
          areaId: props.area,
          startTime: props.startTime
        }, signal);
        trail.push("掌盟:ok");
        if (mlol.player_details.length > 0) {
          const wrapped: GetBattleDetailLike = { battle_detail: mlol, openid: null, source: "mlol" };
          return wrapped;
        }
        trail.push("掌盟:空数据");
      } catch (error) {
        trail.push("掌盟:" + codeOf(error));
      }
      throw new ApiError("DETAIL_ALL_FAILED", "GetBattleDetail", "全部详情来源失败 [" + trail.join(" | ") + "]");
    }
    })();

    detailInflight.set(cacheKey, task);
    try {
      const value = await task;
      if (!signal.aborted) rememberDetail(cacheKey, value);
      return value;
    } finally {
      detailInflight.delete(cacheKey);
    }
  });

  const detail = computed<BattleDetail | null>(() => request.data.value?.battle_detail ?? null);
  const selfOpenid = computed(() => request.data.value?.openid ?? null);
  /** 掌盟数据源的玩家没有 wegame openid，点击跳转不可用 */
  const canOpenPlayer = computed(() => selfOpenid.value !== null);
  const loading = request.loading;
  const error = request.error;
  const run = request.run;

  /** 当前详情数据来源（成功时才有） */
  const detailSource = computed<DetailSource | null>(() => request.data.value?.source ?? null);
  const sourceText = computed(() => (detailSource.value === "mlol" ? "掌盟公开数据" : "数据来源：WeGame"));
  const sourceTitle = computed(() =>
    detailSource.value === "mlol"
      ? "WeGame 详情接口不可用时回退到掌盟公开数据，不含玩家 openid"
      : "数据来自 WeGame 战绩接口"
  );

  const errorKind = computed<DetailErrorKind | null>(() => {
    const err = error.value;
    if (!err) return null;
    if (err instanceof ApiError) {
      if (err.isUnauthenticated) return "auth";
      if (needsCaptcha(err.code)) return "captcha";
      if (String(err.code) === "DETAIL_ALL_FAILED") {
        // 所有来源都失败时，原错误码只保留在尝试轨迹里，据此还原可操作的原因
        const trailText = err.serverMessage || err.message;
        if (/8000022|8000120/.test(trailText)) return "captcha";
        if (trailText.includes("8000102")) return "auth";
        return "all-failed";
      }
    }
    return "unknown";
  });
  const errorHint = computed(() => {
    switch (errorKind.value) {
      case "captcha":
        return "需要完成人机验证：可先去 LOL 助手页查询一次，再回来重试";
      case "auth":
        return "登录状态已失效，请重新登录后再查看";
      case "all-failed":
        return "WeGame 与掌盟两个来源都没取到这场详情，稍后可重试";
      default:
        return "网络或接口异常，请稍后重试";
    }
  });
  /** 失败诊断：验证码留痕 + 各来源尝试轨迹（轨迹在错误 message 里） */
  const debugText = computed(() => {
    const parts: string[] = [];
    if (diag.outcome && diag.outcome !== "从未尝试") parts.push("验证码：" + (diag.at || "") + " " + diag.outcome);
    const err = error.value;
    if (err instanceof ApiError && err.serverMessage) parts.push(err.serverMessage);
    if (parts.length === 0) parts.push(toErrorMessage(err ?? new Error("未知错误")));
    return parts.join("\n");
  });

  const { pending: loggingIn, run: loginAction } = useLoginAction();

  function openHelper(): void {
    window.open("https://www.wegame.com.cn/helper/lol/", "_blank", "noopener");
  }

  function retryLogin(): void {
    void loginAction(async (signal) => {
      await triggerLogin({ signal });
      await waitForLogin({ signal });
      await run();
    });
  }

  watch(
    () => props.gameId,
    (gameId) => {
      if (gameId) void run();
    },
    { immediate: true }
  );

  return {
    detail,
    loading,
    error,
    run,
    detailSource,
    sourceText,
    sourceTitle,
    errorKind,
    errorHint,
    debugText,
    loggingIn,
    retryLogin,
    openHelper,
    canOpenPlayer,
    selfOpenid
  };
}
