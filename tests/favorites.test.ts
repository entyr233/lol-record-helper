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

  it("支持 100 条：读取保留前 100；满员时返回 full 而不是静默淘汰", async () => {
    const many = Array.from({ length: 105 }, (_, index) => ({
      name: "玩家" + index, area: 1, accountType: "2", id: String(index), savedAt: index
    }));
    localStorage.setItem(FAV_KEY, JSON.stringify(many));

    const { MAX_FAVORITES, useFavorites } = await loadFavoritesModule();
    const { favorites, toggle } = useFavorites();
    expect(MAX_FAVORITES).toBe(100);
    expect(favorites.value).toHaveLength(100);
    expect(favorites.value[0]!.id).toBe("0");
    expect(favorites.value[99]!.id).toBe("99");

    expect(toggle({ name: "新玩家", area: 1, accountType: "2", id: "999" })).toBe("full");
    expect(favorites.value).toHaveLength(100);
    expect(favorites.value.some((entry) => entry.id === "999")).toBe(false);
    expect(JSON.parse(localStorage.getItem(FAV_KEY) as string).some((entry: { id: string }) => entry.id === "999")).toBe(false);
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

describe("useFavorites 备注/分组与排序", () => {
  it("旧数据缺 note/group 时正常读取，不补空字段；补齐后立即持久化", async () => {
    localStorage.setItem(FAV_KEY, JSON.stringify([
      { name: "老玩家", area: 1, accountType: "2", id: "10", savedAt: 5 }
    ]));
    const { favoriteKey, useFavorites } = await loadFavoritesModule();
    const { favorites, update } = useFavorites();

    // 缺字段不报错，也不写 undefined，保持与旧版本落盘一致
    expect(favorites.value).toEqual([
      { name: "老玩家", area: 1, accountType: "2", id: "10", savedAt: 5 }
    ]);
    expect("note" in favorites.value[0]!).toBe(false);
    expect("group" in favorites.value[0]!).toBe(false);

    update(favoriteKey(favorites.value[0]!), { group: "老友" });
    const stored = JSON.parse(localStorage.getItem(FAV_KEY) as string) as Array<Record<string, unknown>>;
    expect(stored[0]!.group).toBe("老友");
    expect(stored[0]!.note).toBeUndefined();
  });

  it("读取时规整 note/group：去掉首尾空白，非字符串或空串视为未设置", async () => {
    localStorage.setItem(FAV_KEY, JSON.stringify([
      { name: "甲", area: 1, accountType: "2", id: "10", note: "  双排  ", group: " 车队 " },
      { name: "乙", area: 1, accountType: "2", id: "11", note: "   ", group: 42 }
    ]));
    const { useFavorites } = await loadFavoritesModule();
    const { favorites } = useFavorites();

    expect(favorites.value[0]).toMatchObject({ note: "双排", group: "车队" });
    expect("note" in favorites.value[1]!).toBe(false);
    expect("group" in favorites.value[1]!).toBe(false);
  });

  it("update 写入备注/分组并立即持久化，savedAt 与顺序都不变", async () => {
    const { favoriteKey, useFavorites } = await loadFavoritesModule();
    const { favorites, toggle, update } = useFavorites();

    toggle({ name: "甲", area: 1, accountType: "2", id: "10" });
    const key = favoriteKey({ area: 1, accountType: "2", id: "10" });
    const savedAt = favorites.value[0]!.savedAt;

    update(key, { note: "  一起双排  ", group: "车队" });
    expect(favorites.value).toHaveLength(1);
    expect(favorites.value[0]).toMatchObject({ name: "甲", note: "一起双排", group: "车队", savedAt });
    expect(JSON.parse(localStorage.getItem(FAV_KEY) as string)[0]).toMatchObject({
      note: "一起双排", group: "车队", savedAt
    });

    // 空串清除备注，分组与 savedAt 不受影响
    update(key, { note: "" });
    expect(favorites.value[0]!.note).toBeUndefined();
    expect(favorites.value[0]!.group).toBe("车队");
    expect(favorites.value[0]!.savedAt).toBe(savedAt);
    expect((JSON.parse(localStorage.getItem(FAV_KEY) as string)[0] as Record<string, unknown>).note).toBeUndefined();

    // 未知 key：no-op，不影响已有条目
    update("9:9:9", { note: "不存在" });
    expect(favorites.value[0]!.note).toBeUndefined();
    expect(favorites.value[0]!.group).toBe("车队");
  });

  it("move 调整顺序并持久化，找不到 key 时 no-op", async () => {
    const { favoriteKey, useFavorites } = await loadFavoritesModule();
    const { favorites, toggle, move } = useFavorites();
    const keyOf = (id: string): string => favoriteKey({ area: 1, accountType: "2", id });

    // toggle 新条目插到最前，得到 丙(12) 乙(11) 甲(10)
    toggle({ name: "甲", area: 1, accountType: "2", id: "10" });
    toggle({ name: "乙", area: 1, accountType: "2", id: "11" });
    toggle({ name: "丙", area: 1, accountType: "2", id: "12" });
    expect(favorites.value.map((entry) => entry.id)).toEqual(["12", "11", "10"]);

    // 向上拖动：甲拖到 丙 的位置 → 落在目标之前
    move(keyOf("10"), keyOf("12"));
    expect(favorites.value.map((entry) => entry.id)).toEqual(["10", "12", "11"]);

    // 向下拖动：甲拖到 丙 的位置 → 落在目标之后
    move(keyOf("10"), keyOf("12"));
    // 此时 甲 已在首位，12 在第二位：向下拖到 12 位置后落到其后
    expect(favorites.value.map((entry) => entry.id)).toEqual(["12", "10", "11"]);
    expect(JSON.parse(localStorage.getItem(FAV_KEY) as string).map((entry: { id: string }) => entry.id))
      .toEqual(["12", "10", "11"]);

    // 拖回自己 / 未知 key：保持原顺序
    move(keyOf("12"), keyOf("12"));
    move("9:9:9", keyOf("12"));
    move(keyOf("12"), "9:9:9");
    expect(favorites.value.map((entry) => entry.id)).toEqual(["12", "10", "11"]);
  });

  it("toggle 返回 added/removed/full，并支持写回昵称、等级、段位、最近查看和置顶", async () => {
    const { favoriteKey, useFavorites } = await loadFavoritesModule();
    const { favorites, toggle, update } = useFavorites();
    const input = { name: "甲", area: 1, accountType: "2", id: "10" };

    expect(toggle(input)).toBe("added");
    const key = favoriteKey(input);
    update(key, {
      name: "甲改名",
      level: 321,
      lastRank: "翡翠 · 59 LP",
      lastSeenAt: 123456,
      pinned: true
    });
    expect(favorites.value[0]).toMatchObject({
      name: "甲改名", level: 321, lastRank: "翡翠 · 59 LP", lastSeenAt: 123456, pinned: true
    });

    update(key, { level: 0, lastRank: "", lastSeenAt: 0, pinned: false });
    expect(favorites.value[0]).toMatchObject({ level: 0 });
    expect("lastRank" in favorites.value[0]!).toBe(false);
    expect("lastSeenAt" in favorites.value[0]!).toBe(false);
    expect("pinned" in favorites.value[0]!).toBe(false);

    expect(toggle(input)).toBe("removed");
  });

  it("setGroup / renameGroup / deleteGroup 只调整分组，不删除收藏", async () => {
    const { favoriteKey, useFavorites } = await loadFavoritesModule();
    const { favorites, toggle, setGroup, renameGroup, deleteGroup } = useFavorites();
    toggle({ name: "甲", area: 1, accountType: "2", id: "10" });
    toggle({ name: "乙", area: 1, accountType: "2", id: "11" });
    toggle({ name: "丙", area: 1, accountType: "2", id: "12" });
    const keyOf = (id: string): string => favoriteKey({ area: 1, accountType: "2", id });

    setGroup([keyOf("10"), keyOf("11")], " 车队 ");
    expect(favorites.value.find((entry) => entry.id === "10")!.group).toBe("车队");
    expect(favorites.value.find((entry) => entry.id === "11")!.group).toBe("车队");

    renameGroup("车队", "双排");
    expect(favorites.value.filter((entry) => entry.group === "双排")).toHaveLength(2);

    deleteGroup("双排");
    expect(favorites.value).toHaveLength(3);
    expect(favorites.value.every((entry) => entry.group === undefined)).toBe(true);
  });

  it("moveBy 在手动顺序中上移/下移，边界时保持不动", async () => {
    const { favoriteKey, useFavorites } = await loadFavoritesModule();
    const { favorites, toggle, moveBy } = useFavorites();
    const keyOf = (id: string): string => favoriteKey({ area: 1, accountType: "2", id });
    toggle({ name: "甲", area: 1, accountType: "2", id: "10" });
    toggle({ name: "乙", area: 1, accountType: "2", id: "11" });
    toggle({ name: "丙", area: 1, accountType: "2", id: "12" });
    expect(favorites.value.map((entry) => entry.id)).toEqual(["12", "11", "10"]);

    moveBy(keyOf("10"), -1);
    expect(favorites.value.map((entry) => entry.id)).toEqual(["12", "10", "11"]);
    moveBy(keyOf("10"), -1);
    expect(favorites.value.map((entry) => entry.id)).toEqual(["10", "12", "11"]);
    moveBy(keyOf("10"), -1);
    expect(favorites.value.map((entry) => entry.id)).toEqual(["10", "12", "11"]);
    moveBy(keyOf("11"), 1);
    expect(favorites.value.map((entry) => entry.id)).toEqual(["10", "12", "11"]);
    expect(JSON.parse(localStorage.getItem(FAV_KEY) as string).map((entry: { id: string }) => entry.id))
      .toEqual(["10", "12", "11"]);
  });

  it("导入/导出：合并去重、覆盖、非法 JSON 和旧数组格式", async () => {
    const { favoriteKey, useFavorites } = await loadFavoritesModule();
    const { favorites, toggle, clear, exportData, importData } = useFavorites();
    toggle({ name: "甲", area: 1, accountType: "2", id: "10" });
    const exported = exportData();
    expect(JSON.parse(exported)).toMatchObject({ version: 1 });
    expect(JSON.parse(exported).favorites).toHaveLength(1);

    clear();
    expect(importData(exported, "merge")).toEqual({ added: 1, skipped: 0 });
    expect(favorites.value).toHaveLength(1);
    expect(importData(exported, "merge")).toEqual({ added: 0, skipped: 1 });

    // 旧版裸数组也接受；覆盖模式只保留导入内容
    const bare = JSON.stringify([{ name: "乙", area: 2, accountType: "1", id: "11" }]);
    expect(importData(bare, "replace")).toEqual({ added: 1, skipped: 0 });
    expect(favorites.value.map((entry) => entry.name)).toEqual(["乙"]);
    expect(favorites.value[0]!.savedAt).toBe(0);

    expect(importData("{oops", "merge").error).toBeTruthy();
    expect(importData('{"foo":[]}', "merge").error).toBeTruthy();
    expect(favorites.value.map((entry) => favoriteKey(entry))).toEqual([favoriteKey({ area: 2, accountType: "1", id: "11" })]);
  });

  it("读取时规整最近查看/段位/置顶字段，并丢弃非法时间戳", async () => {
    localStorage.setItem(FAV_KEY, JSON.stringify([
      { name: "甲", area: 1, accountType: "2", id: "10", lastSeenAt: 456, lastRank: " 钻石 · 12 LP ", pinned: true },
      { name: "乙", area: 1, accountType: "2", id: "11", lastSeenAt: -1, lastRank: "  ", pinned: "yes" }
    ]));
    const { useFavorites } = await loadFavoritesModule();
    const { favorites } = useFavorites();
    expect(favorites.value[0]).toMatchObject({ lastSeenAt: 456, lastRank: "钻石 · 12 LP", pinned: true });
    expect("lastSeenAt" in favorites.value[1]!).toBe(false);
    expect("lastRank" in favorites.value[1]!).toBe(false);
    expect("pinned" in favorites.value[1]!).toBe(false);
  });
});
