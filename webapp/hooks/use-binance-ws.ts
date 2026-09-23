"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Live crypto trade ticks straight from Binance's public market-data
 * WebSocket — the same feed Binance's own UI reads from, and (unlike the
 * Finnhub connection this mirrors) it needs no API key: Binance's combined
 * trade stream is unauthenticated and free, so there's no secret to leak and
 * no per-key connection limit to share with other symbols.
 *
 * Reconnect/backoff logic intentionally mirrors use-finnhub-ws.ts so both
 * live-data hooks in the app behave the same way under network failure.
 */

export type WsStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error" | "failed";

export interface LiveTick {
  price:     number;
  volume:    number;
  timestamp: number;
}

const MAX_RETRIES = 5;
const DELAYS      = [2_000, 4_000, 8_000, 16_000, 30_000];

interface BinanceTradeMsg {
  stream: string;
  data: { e: string; s: string; p: string; q: string; T: number };
}

export function useBinanceWs(symbols: string[]) {
  // Binance stream names are lowercase, e.g. "btcusdt@trade".
  const symbolsKey = symbols.join(",");

  const wsRef    = useRef<WebSocket | null>(null);
  const retries  = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status,     setStatus]     = useState<WsStatus>("idle");
  const [liveQuotes, setLiveQuotes] = useState<Record<string, LiveTick>>({});

  useEffect(() => {
    if (symbols.length === 0) return;

    let cancelled = false; // guards against StrictMode double-invoke

    function clearTimer() {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    }

    function kill(ws: WebSocket) {
      ws.onopen    = null;
      ws.onmessage = null;
      ws.onerror   = null;
      ws.onclose   = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }

    function attempt() {
      if (cancelled) return;
      if (retries.current >= MAX_RETRIES) { setStatus("failed"); return; }

      setStatus(retries.current === 0 ? "connecting" : "reconnecting");

      const streams = symbols.map(s => `${s.toLowerCase()}@trade`).join("/");
      const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) { kill(ws); return; }
        retries.current = 0;
        setStatus("connected");
        // No subscribe message needed — streams are selected via the URL.
      };

      ws.onmessage = (evt: MessageEvent<string>) => {
        try {
          const msg = JSON.parse(evt.data) as BinanceTradeMsg;
          if (!msg?.data || msg.data.e !== "trade") return;
          const { s: sym, p, q, T } = msg.data;
          setLiveQuotes(prev => {
            const cur = prev[sym];
            if (cur && T < cur.timestamp) return prev;
            return { ...prev, [sym]: { price: parseFloat(p), volume: parseFloat(q), timestamp: T } };
          });
        } catch (_e) { /* malformed frame */ }
      };

      ws.onerror = () => { /* onclose always follows — handle retry there */ };

      ws.onclose = () => {
        if (cancelled) return;
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
  }, [symbolsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { liveQuotes, status };
}
