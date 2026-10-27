import { postJson } from "./transport";
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
  new (appid: string, callback: (result: CaptchaResult) => void, options?: { forceLang?: string }): { show: () => void };
}

/** TCaptcha 由 script 标签加载，挂在【页面】window 上；沙箱里必须从 unsafeWindow 拿 */
function captchaApi(): CaptchaCtor | null {
  const g = globalThis as unknown as { TencentCaptcha?: CaptchaCtor; unsafeWindow?: { TencentCaptcha?: CaptchaCtor } };
  return g.unsafeWindow?.TencentCaptcha ?? g.TencentCaptcha ?? null;
}

let sdkPromise: Promise<void> | null = null;

function loadCaptchaSdk(): Promise<void> {
  if (captchaApi()) {
    return Promise.resolve();
  }
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CAPTCHA_SDK_URL;
    script.onload = () => {
      // 脚本执行在页面上下文，全局挂在 unsafeWindow，给一拍时间
      setTimeout(() => {
        if (captchaApi()) resolve();
        else { sdkPromise = null; reject(new ApiError("CAPTCHA_SDK", "VerifyRecongnition", "验证码 SDK 加载后不可用")); }
      }, 50);
    };
    script.onerror = () => {
      sdkPromise = null;
      reject(new ApiError("CAPTCHA_SDK", "VerifyRecongnition", "验证码 SDK 加载失败"));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export function readCookieValue(name: string): string {
  const match = document.cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : "";
}

/** 弹腾讯滑块验证，把 ticket/randstr 提交给 VerifyRecongnition 完成登记 */
export async function runCaptchaVerification(): Promise<void> {
  await loadCaptchaSdk();
  const TC = captchaApi();
  if (!TC) throw new ApiError("CAPTCHA_SDK", "VerifyRecongnition", "验证码组件不可用");

  const result = await new Promise<CaptchaResult>((resolve) => {
    new TC(CAPTCHA_APP_ID, (res) => resolve(res), { forceLang: "zh-cn" }).show();
  });
  if (!result || result.ret !== 0 || !result.ticket) {
    throw new ApiError("CAPTCHA_CANCELLED", "VerifyRecongnition", "人机验证未完成，无法继续查询");
  }

  const response = await postJson(VERIFY_URL, {
    tgp_id: readCookieValue("tgp_id"),
    ticket: result.ticket,
    randstr: result.randstr,
    app_id: "LolBattle",
    from_src: "lol_helper"
  }, { headers: { "trpc-caller": "wegame.pallas.web.LolBattle" } });

  const payload = (await response.json()) as { result?: { error_code?: number | string; error_message?: string } };
  if (payload?.result?.error_code !== 0) {
    throw new ApiError(payload?.result?.error_code ?? "VERIFY_FAIL", "VerifyRecongnition", "人机验证未通过，请重试");
  }
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
