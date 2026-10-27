import { onBeforeUnmount, ref } from "vue";
import { LoginError } from "../utils/weGameLogin";

/** 每个组件持有自己的等待；关闭面板或取消时，旧操作不得继续导航。 */
export function useLoginAction() {
  const pending = ref(false);
  const loginError = ref("");
  let controller: AbortController | null = null;

  function cancel(): void {
    if (!controller) return;
    controller.abort();
    controller = null;
    pending.value = false;
    loginError.value = "已取消登录操作，可重新尝试。";
  }

  async function run(action: (signal: AbortSignal) => Promise<void>): Promise<void> {
    if (pending.value) return;
    const current = new AbortController();
    controller = current;
    pending.value = true;
    loginError.value = "";
    try {
      await action(current.signal);
    } catch (error) {
      if (controller === current) loginError.value = error instanceof LoginError ? error.message : "登录操作失败，请重试。";
    } finally {
      if (controller === current) { pending.value = false; controller = null; }
    }
  }

  onBeforeUnmount(() => {
    controller?.abort();
    controller = null;
  });
  return { pending, loginError, run, cancel };
}
