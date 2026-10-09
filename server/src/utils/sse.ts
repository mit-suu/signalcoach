import type { Response } from "express";

/** Azure App Service drops idle connections after ~230s, so keep the stream warm. */
const HEARTBEAT_MS = 15_000;

export interface SseStream {
  send(event: string, data: unknown): void;
  close(): void;
  readonly closed: boolean;
}

export function openSse(res: Response): SseStream {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  // no-transform stops proxies (Vercel rewrite, Azure front end) from buffering/compressing.
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let closed = false;
  const heartbeat = setInterval(() => !closed && res.write(": ping\n\n"), HEARTBEAT_MS);
  res.on("close", () => {
    closed = true;
    clearInterval(heartbeat);
  });

  return {
    send(event, data) {
      if (closed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      res.end();
    },
    get closed() {
      return closed;
    },
  };
}
