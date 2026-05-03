import { useEffect, useRef, useState, useCallback } from "react";

export interface LivePrice {
  symbol: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  timestamp: number;
}

type WsEvent =
  | { type: "snapshot"; data: LivePrice[] }
  | { type: "prices"; data: LivePrice[] }
  | { type: "pong" };

function buildWsUrl(): string {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${base}/api/ws/prices`;
}

interface UseLivePricesOptions {
  symbols?: string[];
  enabled?: boolean;
}

export function useLivePrices(options: UseLivePricesOptions = {}) {
  const { symbols, enabled = true } = options;
  const [prices, setPrices] = useState<Map<string, LivePrice>>(new Map());
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!enabled || !mountedRef.current) return;
    try {
      const ws = new WebSocket(buildWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setConnected(true);
        if (symbols && symbols.length > 0) {
          ws.send(JSON.stringify({ type: "subscribe", symbols }));
        }
      };

      ws.onmessage = (evt) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(evt.data as string) as WsEvent;
          if (msg.type === "snapshot" || msg.type === "prices") {
            setPrices((prev) => {
              const next = new Map(prev);
              msg.data.forEach((p) => next.set(p.symbol, p));
              return next;
            });
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        // will trigger onclose
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        wsRef.current = null;
        // Reconnect after 5s
        retryRef.current = setTimeout(() => {
          if (mountedRef.current) connect();
        }, 5000);
      };
    } catch {
      // WebSocket not available (SSR, etc.)
    }
  }, [enabled, symbols?.join(",")]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const getPrice = useCallback(
    (symbol: string): LivePrice | undefined => prices.get(symbol.toUpperCase()),
    [prices]
  );

  return { prices, connected, getPrice };
}
