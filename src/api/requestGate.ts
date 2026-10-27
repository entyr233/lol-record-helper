/** Limit fetches through body consumption; queued attempts can time out or cancel. */
export function createRequestGate(limit: number): (signal: AbortSignal) => Promise<() => void> {
  let active = 0;
  const queue: Array<() => void> = [];
  return (signal) => new Promise((resolve, reject) => {
    const onAbort = () => {
      const index = queue.indexOf(start);
      if (index !== -1) queue.splice(index, 1);
      reject(new DOMException("aborted", "AbortError"));
    };
    const start = () => {
      signal.removeEventListener("abort", onAbort);
      active += 1;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        active -= 1;
        queue.shift()?.();
      });
    };
    if (signal.aborted) onAbort();
    else if (active < limit) start();
    else {
      queue.push(start);
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}
