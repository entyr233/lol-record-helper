import { onScopeDispose, ref, shallowRef } from "vue";
import { isAbortError } from "../api/errors";

export interface AsyncDataHandle<T> {
  data: ReturnType<typeof shallowRef<T | null>>;
  error: ReturnType<typeof shallowRef<Error | null>>;
  loading: ReturnType<typeof ref<boolean>>;
  run: () => Promise<void>;
  abort: () => void;
}

/**
 * 带取消能力的异步数据源：
 * - 新的 run() 会中止上一次请求（避免切换对局时的竞态）
 * - 组件销毁时自动 abort
 * - error 里保留可读信息，交给 UI 决定如何呈现
 */
export function useAsyncData<T>(loader: (signal: AbortSignal) => Promise<T>): AsyncDataHandle<T> {
  const data = shallowRef<T | null>(null);
  const error = shallowRef<Error | null>(null);
  const loading = ref(false);
  let controller: AbortController | null = null;
  let sequence = 0;

  async function run(): Promise<void> {
    sequence += 1;
    const current = sequence;
    controller?.abort();
    controller = new AbortController();
    const myController = controller;
    loading.value = true;
    error.value = null;
    try {
      const result = await loader(myController.signal);
      if (current === sequence) data.value = result;
    } catch (err) {
      if (current === sequence && !isAbortError(err)) error.value = err as Error;
    } finally {
      if (current === sequence) loading.value = false;
    }
  }

  function abort(): void {
    controller?.abort();
  }

  onScopeDispose(abort);

  return { data, error, loading, run, abort };
}
