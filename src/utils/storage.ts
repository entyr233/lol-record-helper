/** 带异常保护的 localStorage 封装（隐私模式/配额满都不会炸） */
const SCOPE = "lol_tft";

function key(name: string): string {
  return SCOPE + ":" + name;
}

export function readStorage<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key(name));
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeStorage(name: string, value: unknown): boolean {
  try {
    localStorage.setItem(key(name), JSON.stringify(value));
    return true;
  } catch {
    /* 隐私模式或配额满时静默失败，由调用方决定是否提示 */
    return false;
  }
}

export function removeStorage(name: string): void {
  try {
    localStorage.removeItem(key(name));
  } catch {
    /* ignore */
  }
}

export const storage = { read: readStorage, write: writeStorage, remove: removeStorage };
