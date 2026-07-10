// setTimeout that stays on time in background tabs. Browsers throttle
// main-thread timers of hidden pages (up to minute-aligned wakeups), but that
// throttling doesn't apply to dedicated workers — so the wait runs in a tiny
// inline worker that pings back when it's due. Falls back to a plain
// setTimeout when workers are unavailable.
//
// Returns a cancel function. Cancelling just drops the callback; the worker's
// own timer still fires and is ignored, which keeps the worker side trivial.

const WORKER_SRC = "onmessage=(e)=>{setTimeout(()=>postMessage(e.data.id),e.data.delay)}";

let worker: Worker | null | undefined; // undefined = not tried yet, null = failed
let nextId = 1;
const pending = new Map<number, () => void>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" })));
    worker.onmessage = (e: MessageEvent<number>) => {
      const cb = pending.get(e.data);
      pending.delete(e.data);
      cb?.();
    };
  } catch {
    worker = null;
  }
  return worker;
}

export function setWorkerTimeout(cb: () => void, delay: number): () => void {
  const w = getWorker();
  if (!w) {
    const id = window.setTimeout(cb, delay);
    return () => window.clearTimeout(id);
  }
  const id = nextId++;
  pending.set(id, cb);
  w.postMessage({ id, delay });
  return () => {
    pending.delete(id);
  };
}
