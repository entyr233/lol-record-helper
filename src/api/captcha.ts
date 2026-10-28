import { postJson } from "./transport";
import { reactive } from "vue";
import { ApiError } from "./errors";

/** 验证码 AppId 与 SDK 地址：取自现任 LOL 助手前端（逆向） */
const CAPTCHA_APP_ID = "2060857906";
const CAPTCHA_SDK_URL = "https://ssl.captcha.qq.com/TCaptcha.js";
const VERIFY_URL = "/api/v1/wegame.pallas.game.LolBattle/VerifyRecongnition";

interface CaptchaResult {
  ret: number;
  ticket?: string;
  randstr?: string;
}

interface CaptchaCtor {
  new(appid: string, callback: (result: CaptchaResult) => void, options?: { forceLang?: string }): { show: () => void };
}

/** TCaptcha 由 script 标签加载，挂在【页面】window 上；沙箱里必须从 unsafeWindow 拿 */
function captchaApi(): CaptchaCtor | null {
  const g = globalThis as unknown as { TencentCaptcha?: CaptchaCtor; unsafeWindow?: { TencentCaptcha?: CaptchaCtor } };
  return g.unsafeWindow?.TencentCaptcha ?? g.TencentCaptcha ?? null;
}

let sdkPromise: Promise<void> | null = null;

/** 每个调用独立结束等待，迟到的 SDK 或滑块回调不改变已结束的结果。 */
function waitForCaptcha<T>(task: Promise<T>, signal: AbortSignal | undefined, timeoutMs: number, timeoutError: Error): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      action();
    };
    const onAbort = () => finish(() => reject(new DOMException("aborted", "AbortError")));
    const timer = setTimeout(() => finish(() => reject(timeoutError)), timeoutMs);
    task.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function loadCaptchaSdk(): Promise<void> {
  if (captchaApi()) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  const script = document.createElement("script");
  script.src = CAPTCHA_SDK_URL;
  const task = new Promise<void>((resolve, reject) => {
    script.onload = () => captchaApi() ? resolve() : reject(new ApiError("CAPTCHA_SDK", "VerifyRecongnition", "验证码 SDK 加载后不可用"));
    script.onerror = () => reject(new ApiError("CAPTCHA_SDK", "VerifyRecongnition", "验证码 SDK 加载失败"));
    (document.head || document.documentElement).appendChild(script);
  });
  // SDK 下载可供其他查询复用；取消单次查询不取消其他查询的下载等待。
  sdkPromise = waitForCaptcha(task, undefined, 6000, new ApiError("CAPTCHA_SDK", "VerifyRecongnition", "验证码 SDK 加载超时"))
    .finally(() => {
      script.onload = null;
      script.onerror = null;
      script.remove();
      sdkPromise = null;
    });
  return sdkPromise;
}

export function readCookieValue(name: string): string {
  const match = document.cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : "";
}

/** 弹腾讯滑块验证，把 ticket/randstr 提交给 VerifyRecongnition 完成登记 */
export async function runCaptchaVerification(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    note("开始（加载 SDK）");
    await waitForCaptcha(loadCaptchaSdk(), controller.signal, 6000, new ApiError("CAPTCHA_SDK", "VerifyRecongnition", "验证码 SDK 加载超时"));
    note("SDK 就绪，弹滑块");
    const TC = captchaApi();
    if (!TC) throw new ApiError("CAPTCHA_SDK", "VerifyRecongnition", "验证码组件不可用");
    const challenge = new Promise<CaptchaResult>((resolve) => {
      new TC(CAPTCHA_APP_ID, resolve, { forceLang: "zh-cn" }).show();
    });
    const result = await waitForCaptcha(challenge, controller.signal, 120000,
      new ApiError("CAPTCHA_TIMEOUT", "VerifyRecongnition", "人机验证等待超时，请重试"));
    if (!result || result.ret !== 0 || !result.ticket) {
      throw new ApiError("CAPTCHA_CANCELLED", "VerifyRecongnition", "人机验证未完成，无法继续查询");
    }
    note("滑块通过，提交 VerifyRecongnition");
    const register = async () => {
      const response = await postJson(VERIFY_URL, {
        tgp_id: readCookieValue("tgp_id"), ticket: result.ticket, randstr: result.randstr,
        app_id: "LolBattle", from_src: "lol_helper"
      }, { signal: controller.signal, headers: { "trpc-caller": "wegame.pallas.web.LolBattle" } });
      if (!response.ok) throw new ApiError(String(response.status), "VerifyRecongnition", "HTTP " + response.status);
      const payload = (await response.json()) as { result?: { error_code?: number | string } };
      if (String(payload?.result?.error_code) !== "0") {
        throw new ApiError(payload?.result?.error_code ?? "VERIFY_FAIL", "VerifyRecongnition", "人机验证未通过，请重试");
      }
    };
    await waitForCaptcha(register(), controller.signal, 12000,
      new ApiError("CAPTCHA_TIMEOUT", "VerifyRecongnition", "验证登记超时，请重试"));
    note("验证登记成功");
  } catch (error) {
    note(controller.signal.aborted ? "验证已取消" : error instanceof Error ? error.message : "验证失败");
    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    controller.abort();
  }
}

/** 最近一次验证码尝试的留痕（诊断用，界面会显示） */
export const lastCaptchaAttempt = reactive({ at: "", outcome: "从未尝试" });

function note(outcome: string): void {
  lastCaptchaAttempt.at = new Date().toLocaleTimeString();
  lastCaptchaAttempt.outcome = outcome;
  try { console.debug("[lol-tft] 验证码环节:", outcome); } catch { /* ignore */ }
}

/** 是否允许触发验证码流程（测试环境跳过，避免挂起） */
export function captchaAllowed(): boolean {
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
  if (env && (env.VITEST || env.MODE === "test")) return false;
  return typeof document !== "undefined";
}

/** 需要人机验证的错误码：8000022（现任）与 8000120（旧接口实测） */
export function needsCaptcha(code: number | string): boolean {
  const c = String(code);
  return c === "8000022" || c === "8000120";
}
