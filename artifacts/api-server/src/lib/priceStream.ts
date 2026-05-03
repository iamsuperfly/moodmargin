import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { db } from "@workspace/db";
import { marketsTable } from "@workspace/db/schema";
import { fetchTokenPrice } from "./dexscreener";
import { logger } from "./logger";

interface PriceUpdate {
  symbol: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  timestamp: number;
}

interface WsMessage {
  type: "subscribe" | "unsubscribe" | "ping";
  symbols?: string[];
}

// Tracks which symbols each client wants
const clientSubscriptions = new WeakMap<WebSocket, Set<string>>();
let wss: WebSocketServer | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

// Cache of latest prices keyed by symbol
const priceCache = new Map<string, PriceUpdate>();

export function initPriceStream(server: import("http").Server): void {
  wss = new WebSocketServer({ server, path: "/api/ws/prices" });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    clientSubscriptions.set(ws, new Set());

    // Send current cached prices immediately on connect
    const snapshot = Array.from(priceCache.values());
    if (snapshot.length > 0) {
      ws.send(JSON.stringify({ type: "snapshot", data: snapshot }));
    }

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as WsMessage;
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }
        const subs = clientSubscriptions.get(ws);
        if (!subs) return;

        if (msg.type === "subscribe" && msg.symbols) {
          msg.symbols.forEach((s) => subs.add(s.toUpperCase()));
          // Send cached data for newly subscribed symbols right away
          const updates = msg.symbols
            .map((s) => priceCache.get(s.toUpperCase()))
            .filter(Boolean) as PriceUpdate[];
          if (updates.length > 0) {
            ws.send(JSON.stringify({ type: "prices", data: updates }));
          }
        }
        if (msg.type === "unsubscribe" && msg.symbols) {
          msg.symbols.forEach((s) => subs.delete(s.toUpperCase()));
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("error", (err) => logger.warn({ err }, "WebSocket client error"));
    ws.on("close", () => clientSubscriptions.delete(ws));
  });

  logger.info("WebSocket price stream started at /api/ws/prices");

  // Start polling DexScreener every 10 seconds
  pollInterval = setInterval(pollAndBroadcast, 10_000);
  // Immediate first poll
  pollAndBroadcast().catch((err) =>
    logger.error({ err }, "Initial price poll failed")
  );
}

async function pollAndBroadcast(): Promise<void> {
  if (!wss) return;

  let markets: { symbol: string }[] = [];
  try {
    markets = await db.select({ symbol: marketsTable.symbol }).from(marketsTable);
  } catch {
    return;
  }

  const updates: PriceUpdate[] = [];

  await Promise.allSettled(
    markets.map(async ({ symbol }) => {
      try {
        const data = await fetchTokenPrice(symbol);
        if (!data) return;
        const update: PriceUpdate = {
          symbol,
          price: data.price,
          priceChange24h: data.priceChange24h,
          volume24h: data.volume24h,
          liquidity: data.liquidity,
          timestamp: Date.now(),
        };
        priceCache.set(symbol, update);
        updates.push(update);
      } catch {
        // silently skip failed symbol fetches
      }
    })
  );

  if (updates.length === 0 || !wss) return;

  // Broadcast to each connected client only what they're subscribed to
  wss.clients.forEach((ws) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const subs = clientSubscriptions.get(ws);
    const toSend =
      subs && subs.size > 0
        ? updates.filter((u) => subs.has(u.symbol))
        : updates; // no filter = send all (opt-in to all)

    if (toSend.length > 0) {
      ws.send(JSON.stringify({ type: "prices", data: toSend }));
    }
  });
}

export function stopPriceStream(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  wss?.close();
  wss = null;
}
