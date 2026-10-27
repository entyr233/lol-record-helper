<template>
  <div v-if="mode !== 'unknown'" class="dev-bar" :class="'dev-bar--' + mode">
    <span class="dev-dot"></span>
    <span class="dev-text">{{ mode === "real" ? "真实账号数据" : "mock 示例数据" }}</span>

    <template v-if="!panelOpen">
      <button type="button" class="dev-action" @click="panelOpen = true">
        {{ mode === "real" ? "切换数据源" : "粘贴 Cookie 连接真实账号" }}
      </button>
    </template>
    <template v-else>
      <textarea
        v-model="cookieText"
        class="dev-input"
        rows="3"
        spellcheck="false"
        placeholder="F12 → Network → 任意 wegame.com.cn 请求 → Request Headers → Cookie 整行粘到这里"
      ></textarea>
      <button type="button" class="dev-action" :disabled="!cookieText.trim()" @click="apply">连接</button>
      <button type="button" class="dev-action" @click="reset">切回 mock</button>
      <button type="button" class="dev-action" @click="panelOpen = false">取消</button>
    </template>

    <span v-if="error" class="dev-error">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";

type Mode = "mock" | "real" | "unknown";

const mode = ref<Mode>("unknown");
const panelOpen = ref(false);
const cookieText = ref("");
const error = ref("");
let devToken = "";

async function refresh(): Promise<void> {
  try {
    const res = await fetch("/__lol-tft/status");
    if (!res.ok) return;
    const data = (await res.json()) as { mode?: Mode; devToken?: string };
    if (typeof data.devToken !== "string" || !data.devToken) return;
    devToken = data.devToken;
    mode.value = data.mode === "real" ? "real" : "mock";
  } catch {
    /* 线上构建没有这个接口，保持隐藏 */
  }
}

async function sessionHeaders(): Promise<Record<string, string>> {
  if (!devToken) await refresh();
  if (!devToken) throw new Error("开发会话不可用，请刷新页面");
  return { "content-type": "application/json", "x-lol-tft-dev-token": devToken };
}

async function apply(): Promise<void> {
  error.value = "";
  try {
    const res = await fetch("/__lol-tft/cookie", {
      method: "POST",
      headers: await sessionHeaders(),
      body: JSON.stringify({ cookie: cookieText.value.trim() })
    });
    const data = (await res.json()) as { mode?: Mode; error?: string; check?: { ok: boolean; code?: number | string; reason?: string } };
    if (!res.ok) throw new Error(data.error || "开发会话请求失败");
    if (data.check && !data.check.ok) {
      error.value = (data.check.reason || "Cookie 校验失败，未切换数据源") +
        "（错误码 " + String(data.check.code ?? "-") + "）";
      return;
    }
    if (data.mode === "real" && data.check && data.check.ok) {
      cookieText.value = "";
      window.location.reload();
      return;
    }
    error.value = "cookie 为空，未切换";
  } catch (e) {
    error.value = "保存失败：" + (e instanceof Error ? e.message : String(e));
  }
}

async function reset(): Promise<void> {
  try {
    const res = await fetch("/__lol-tft/cookie", { method: "DELETE", headers: await sessionHeaders() });
    if (!res.ok) throw new Error("开发会话请求失败（HTTP " + res.status + "），请刷新页面重试");
    window.location.reload();
  } catch (e) {
    error.value = "切换失败：" + (e instanceof Error ? e.message : String(e));
  }
}

onMounted(() => {
  void refresh();
});
</script>
