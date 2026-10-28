import { readonly, ref } from "vue";
import { readStorage, writeStorage } from "../utils/storage";

const STORAGE_NAME = "search-history";
const STORAGE_KEY = "lol_tft:" + STORAGE_NAME;
const LEGACY_KEY = "lol-tft-search-history";

function loadHistory(): string[] {
  let stored = readStorage<unknown>(STORAGE_NAME, null);
  if (stored === null) {
    try { stored = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "[]"); }
    catch { stored = []; }
  }
  if (!Array.isArray(stored)) return [];
  return [...new Set(stored.filter((name): name is string => typeof name === "string")
    .map((name) => name.trim()).filter(Boolean))].slice(0, 10);
}

const historyNames = ref(loadHistory());

function save(names: string[]): void {
  historyNames.value = names;
  writeStorage(STORAGE_NAME, names);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === LEGACY_KEY || event.key === null) historyNames.value = loadHistory();
  });
}

export function useSearchHistory() {
  return {
    historyNames: readonly(historyNames),
    remember(name: string) {
      const trimmed = name.trim();
      if (trimmed) save([trimmed, ...historyNames.value.filter((entry) => entry !== trimmed)].slice(0, 10));
    },
    remove(name: string) { save(historyNames.value.filter((entry) => entry !== name)); },
    clear() { save([]); }
  };
}
