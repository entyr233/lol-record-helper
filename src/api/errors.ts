export const API_ERROR = {
  /** 未登录 / 登录态失效（实测 WeGame 返回的 code） */
  UNAUTHENTICATED: 8000102,
  /** 战绩被隐藏 */
  HIDDEN: "WG_COMM_ERR_USER_CONFIG_LIMIT"
} as const;

const FRIENDLY: Record<string, string> = {
  "8000102": "登录状态已失效，请重新登录"
};

export class ApiError extends Error {
  readonly code: number | string;
  readonly method: string;

  constructor(code: number | string, method: string, message?: string) {
    super(message || FRIENDLY[String(code)] || "请求失败(" + method + ")");
    this.name = "ApiError";
    this.code = code;
    this.method = method;
  }

  get isUnauthenticated(): boolean {
    return String(this.code) === String(API_ERROR.UNAUTHENTICATED);
  }

  get isHidden(): boolean {
    return String(this.code).includes(String(API_ERROR.HIDDEN));
  }
}

export function isAbortError(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { name?: string }).name === "AbortError";
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
