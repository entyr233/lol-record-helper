import { computed } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const FAV_KEY = "lol-tft-favorites";

/** 模块级单例：每个用例用 resetModules + 动态 import 拿一份干净实例 */
async function loadFavoritesModule() {
  vi.resetModules();
  return await import("../src/composables/useFavorites");
}

beforeEach(() => {
  localStorage.clear();
});

describe("useFavorites 三元组收藏", () => {
  it("迁移旧收藏：补 accountType '2'、规整 area/id 类型，并能被三元组命中", async () => {
    localStorage.setItem(FAV_KEY, JSON.stringify([{ name: "老收藏", area: "1", id: 1001 }]));
    const { favoriteKey, useFavorites } = await loadFavoritesModule();
    const { favorites, isFavorite } = useFavorites();

    expect(favorites.value).toEqual([
      { name: "老收藏", area: 1, accountType: "2", id: "1001", savedAt: 0 }
    ]);
    expect(isFavorite({ area: "1", accountType: "2", id: 1001 })).toBe(true);
    expect(isFavorite({ area: 1, accountType: 1, id: 1001 })).toBe(false);
    expect(favoriteKey({ area: "1", accountType: 2, id: 1001 })).toBe("1:2:1001");
  });

  it("localStorage 内容损坏或不是数组时容错为空列表", async () => {
    localStorage.setItem(FAV_KEY, "{oops");
    let module = await loadFavoritesModule();
    expect(module.useFavorites().favorites.value).toEqual([]);

    localStorage.setItem(FAV_KEY, "null");
    module = await loadFavoritesModule();
    expect(module.useFavorites().favorites.value).toEqual([]);

    localStorage.setItem(FAV_KEY, JSON.stringify([{ name: "无 id" }, null, 42]));
    module = await loadFavoritesModule();
    expect(module.useFavorites().favorites.value).toEqual([]);
  });

  it("toggle 新增/删除并立即持久化，savedAt 为时间戳", async () => {
    const { useFavorites } = await loadFavoritesModule();
    const { favorites, toggle } = useFavorites();

    toggle({ name: "甲", area: 1, accountType: "2", id: "10" });
    expect(favorites.value).toHaveLength(1);
    expect(favorites.value[0]).toMatchObject({ name: "甲", area: 1, accountType: "2", id: "10" });
    expect(typeof favorites.value[0]!.savedAt).toBe("number");
    expect(JSON.parse(localStorage.getItem(FAV_KEY) as string)).toHaveLength(1);

    toggle({ name: "甲", area: 1, accountType: "2", id: "10" });
    expect(favorites.value).toEqual([]);
    expect(JSON.parse(localStorage.getItem(FAV_KEY) as string)).toEqual([]);
  });

  it("同一账号标识在不同大区/账号类型下互不命中", async () => {
    const { favoriteKey, useFavorites } = await loadFavoritesModule();
    const { favorites, isFavorite, remove, toggle } = useFavorites();

    toggle({ name: "甲", area: 1, accountType: "2", id: "10" });
    expect(isFavorite({ area: 1, accountType: "2", id: "10" })).toBe(true);
    expect(isFavorite({ area: 2, accountType: "2", id: "10" })).toBe(false);
    expect(isFavorite({ area: 1, accountType: "1", id: "10" })).toBe(false);
    expect(isFavorite({ area: 1, accountType: "2", id: "11" })).toBe(false);

    toggle({ name: "乙", area: 2, accountType: "2", id: "10" });
    toggle({ name: "丙", area: 1, accountType: "1", id: "10" });
    expect(favorites.value).toHaveLength(3);

    remove(favoriteKey({ area: 1, accountType: "2", id: "10" }));
    expect(favorites.value).toHaveLength(2);
    expect(isFavorite({ area: 1, accountType: "2", id: "10" })).toBe(false);
    // 其余两个三元组不受影响
    expect(isFavorite({ area: 2, accountType: "2", id: "10" })).toBe(true);
    expect(isFavorite({ area: 1, accountType: "1", id: "10" })).toBe(true);
  });

  it("读取时按三元组去重，保留先出现的一条", async () => {
    localStorage.setItem(FAV_KEY, JSON.stringify([
      { name: "旧", area: 1, accountType: "2", id: "10", savedAt: 1 },
      { name: "新", area: "1", accountType: 2, id: 10, savedAt: 2 }
    ]));
    const { useFavorites } = await loadFavoritesModule();
    const { favorites } = useFavorites();

    expect(favorites.value).toHaveLength(1);
    expect(favorites.value[0]).toMatchObject({ name: "旧", area: 1, accountType: "2", id: "10", savedAt: 1 });
  });

  it("最多 20 条：读取截断，新增插到最前并挤出末尾", async () => {
    const many = Array.from({ length: 25 }, (_, index) => ({
      name: "玩家" + index, area: 1, accountType: "2", id: String(index), savedAt: index
    }));
    localStorage.setItem(FAV_KEY, JSON.stringify(many));

    const { useFavorites } = await loadFavoritesModule();
    const { favorites, toggle } = useFavorites();
    expect(favorites.value).toHaveLength(20);
    expect(favorites.value[0]!.id).toBe("0");
    expect(favorites.value[19]!.id).toBe("19");

    toggle({ name: "新玩家", area: 1, accountType: "2", id: "999" });
    expect(favorites.value).toHaveLength(20);
    expect(favorites.value[0]!.id).toBe("999");
    expect(favorites.value.some((entry) => entry.id === "19")).toBe(false);
    expect(JSON.parse(localStorage.getItem(FAV_KEY) as string)).toHaveLength(20);
  });

  it("isFavorite 在 computed 中保持响应式", async () => {
    const { useFavorites } = await loadFavoritesModule();
    const { isFavorite, toggle } = useFavorites();
    const target = { area: 1, accountType: "2", id: "10" };
    const flag = computed(() => isFavorite(target));

    expect(flag.value).toBe(false);
    toggle({ name: "甲", ...target });
    expect(flag.value).toBe(true);
    toggle({ name: "甲", ...target });
    expect(flag.value).toBe(false);
  });

  it("clear 清空并持久化", async () => {
    const { useFavorites } = await loadFavoritesModule();
    const { favorites, toggle, clear } = useFavorites();
    toggle({ name: "甲", area: 1, accountType: "2", id: "10" });

    clear();
    expect(favorites.value).toEqual([]);
    expect(JSON.parse(localStorage.getItem(FAV_KEY) as string)).toEqual([]);
  });

  it("模块级单例共享状态，并同步其他标签页的 storage 事件", async () => {
    const { useFavorites } = await loadFavoritesModule();
    const first = useFavorites();
    const second = useFavorites();
    expect(first.favorites).toBe(second.favorites);

    window.dispatchEvent(new StorageEvent("storage", {
      key: FAV_KEY,
      newValue: JSON.stringify([{ name: "远端", area: 3, accountType: "1", id: "77" }])
    }));
    expect(first.favorites.value).toEqual([
      { name: "远端", area: 3, accountType: "1", id: "77", savedAt: 0 }
    ]);
    expect(first.isFavorite({ area: 3, accountType: "1", id: "77" })).toBe(true);

    window.dispatchEvent(new StorageEvent("storage", { key: FAV_KEY, newValue: null }));
    expect(first.favorites.value).toEqual([]);
  });
});
