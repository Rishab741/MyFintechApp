"use client";

import { useEffect, useRef, useState } from "react";

export type WsStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error" | "failed";

export interface LiveTick {
  price:     number;
  volume:    number;
  timestamp: number;
}

const MAX_RETRIES = 5;
const DELAYS      = [2_000, 4_000, 8_000, 16_000, 30_000];

export function useFinnhubWs(symbols: string[]) {
  const token      = process.env.NEXT_PUBLIC_FINNHUB_TOKEN ?? "";
  const symbolsKey = symbols.join(",");

  const wsRef    = useRef<WebSocket | null>(null);
  const retries  = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status,     setStatus]     = useState<WsStatus>("idle");
  const [liveQuotes, setLiveQuotes] = useState<Record<string, LiveTick>>({});

  useEffect(() => {
    if (!token) return;

    let cancelled = false; // guards against StrictMode double-invoke

    function clearTimer() {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    }

    function kill(ws: WebSocket) {
      ws.onopen    = null;
      ws.onmessage = null;
      ws.onerror   = null;
      ws.onclose   = null;
      if (ws.readyState === WebSocket.OPEN) {
        try { symbols.forEach(s => ws.send(JSON.stringify({ type: "unsubscribe", symbol: s }))); }
        catch (_e) { /* best effort */ }
      }
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }

    function attempt() {
      if (cancelled) return;
      if (retries.current >= MAX_RETRIES) { setStatus("failed"); return; }

      setStatus(retries.current === 0 ? "connecting" : "reconnecting");

      const ws = new WebSocket(`wss://ws.finnhub.io?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) { kill(ws); return; }
        retries.current = 0;
        setStatus("connected");
        symbols.forEach(s => ws.send(JSON.stringify({ type: "subscribe", symbol: s })));
      };

      ws.onmessage = (evt: MessageEvent<string>) => {
        try {
          const msg = JSON.parse(evt.data) as {
            type: string;
            data?: Array<{ p: number; s: string; t: number; v: number }>;
          };
          if (msg.type !== "trade" || !msg.data?.length) return;
          setLiveQuotes(prev => {
            const next = { ...prev };
            for (const tick of msg.data!) {
              const cur = next[tick.s];
              if (!cur || tick.t >= cur.timestamp) {
                next[tick.s] = { price: tick.p, volume: tick.v, timestamp: tick.t };
              }
            }
            return next;
          });
        } catch (_e) { /* malformed frame */ }
      };

      ws.onerror = () => { /* onclose always follows — handle retry there */ };

      ws.onclose = (evt) => {
        if (cancelled) return;
        // 1008 = policy violation → bad token, pointless to retry
        if (evt.code === 1008) { setStatus("failed"); return; }
        retries.current++;
        const delay = DELAYS[Math.min(retries.current - 1, DELAYS.length - 1)];
        setStatus(retries.current >= MAX_RETRIES ? "failed" : "reconnecting");
        if (retries.current < MAX_RETRIES) {
          timerRef.current = setTimeout(attempt, delay);
        }
      };
    }

    // Small delay so StrictMode's first cleanup can cancel before the socket opens
    timerRef.current = setTimeout(attempt, 80);

    return () => {
      cancelled = true;
      clearTimer();
      if (wsRef.current) { kill(wsRef.current); wsRef.current = null; }
    };
  }, [token, symbolsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { liveQuotes, status };
}
