function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

/** 秒 -> 中文时长；0 返回 "0秒"（旧实现会返回空串） */
export function formatDuration(totalSeconds: number | null | undefined): string {
  const sec = Number(totalSeconds);
  if (!Number.isFinite(sec) || sec < 0) return "";
  if (sec === 0) return "0秒";
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  let text = "";
  if (hours > 0) text += hours + "小时 ";
  if (minutes > 0) text += minutes + "分 ";
  if (seconds > 0) text += seconds + "秒";
  return text.trim();
}

/** 毫秒/秒时间戳 -> YYYY-MM-DD HH:mm:ss */
export function formatDateTime(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const numeric = typeof value === "number" ? value : parseInt(value, 10);
  const date = new Date(Number.isFinite(numeric) ? numeric : value);
  if (Number.isNaN(date.getTime())) return "";
  return (
    date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate()) +
    " " + pad2(date.getHours()) + ":" + pad2(date.getMinutes()) + ":" + pad2(date.getSeconds())
  );
}

/** 游戏内评分（原始值 / 10000） */
export function formatGameScore(value: number | null | undefined): string {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return "";
  return (num / 10000).toFixed(1);
}

export function kdaRatio(kills: number, deaths: number, assists: number): number {
  const k = Number(kills) || 0;
  const d = Number(deaths) || 0;
  const a = Number(assists) || 0;
  return (k + a) / Math.max(d, 1);
}

/** 伤害/承伤柱状条的百分比，防除零与非有限值 */
export function barPercent(value: number | null | undefined, max: number | null | undefined): string {
  const v = Number(value);
  const m = Number(max);
  if (!Number.isFinite(v) || !Number.isFinite(m) || m <= 0) return "0%";
  const percent = Math.min(100, Math.max(0, (v / m) * 100));
  return percent.toFixed(1) + "%";
}

export function formatThousands(value: number | null | undefined): string {
  const num = Math.round(Number(value) || 0);
  return (num / 1000).toFixed(1) + "k";
}
