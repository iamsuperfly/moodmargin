import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { db } from "@workspace/db";
import { marketsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { fetchTokenPrice, fetchTokenByAddress } from "./dexscreener";
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

// DB writes are batched and happen every DB_WRITE_EVERY_N polls to avoid hammering the DB
const WS_POLL_INTERVAL_MS = 10_000;  // broadcast to WS clients every 10s
const DB_WRITE_EVERY_N = 3;          // write to DB every 30s (every 3rd poll)
let pollCount = 0;

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

  // Poll immediately on startup, then every 10s
  pollAndBroadcast().catch((err) =>
    logger.error({ err }, "Initial price poll failed")
  );
  pollInterval = setInterval(() => {
    pollAndBroadcast().catch((err) =>
      logger.error({ err }, "Price poll failed")
    );
  }, WS_POLL_INTERVAL_MS);
}

async function pollAndBroadcast(): Promise<void> {
  if (!wss) return;

  pollCount++;
  const shouldWriteDb = pollCount % DB_WRITE_EVERY_N === 0 || pollCount === 1;

  let markets: { symbol: string; tokenAddress: string | null; chainName: string | null }[] = [];
  try {
    markets = await db
      .select({
        symbol: marketsTable.symbol,
        tokenAddress: marketsTable.tokenAddress,
        chainName: marketsTable.chainName,
      })
      .from(marketsTable);
  } catch {
    return;
  }

  if (markets.length === 0) return;

  const updates: PriceUpdate[] = [];
  const dbWrites: Promise<void>[] = [];

  await Promise.allSettled(
    markets.map(async ({ symbol, tokenAddress, chainName }) => {
      try {
        let priceData: {
          price: number;
          priceChange24h: number;
          volume24h: number;
          liquidity: number;
        } | null = null;

        // Prefer address-based lookup when we have a token address — more accurate
        if (tokenAddress && chainName) {
          const pair = await fetchTokenByAddress(tokenAddress, chainName);
          if (pair?.priceUsd) {
            priceData = {
              price: parseFloat(pair.priceUsd) || 0,
              priceChange24h: pair.priceChange?.h24 ?? 0,
              volume24h: pair.volume?.h24 ?? 0,
              liquidity: pair.liquidity?.usd ?? 0,
            };
          }
        }

        // Fallback to symbol search
        if (!priceData) {
          priceData = await fetchTokenPrice(symbol);
        }

        if (!priceData) return;

        const update: PriceUpdate = {
          symbol,
          price: priceData.price,
          priceChange24h: priceData.priceChange24h,
          volume24h: priceData.volume24h,
          liquidity: priceData.liquidity,
          timestamp: Date.now(),
        };

        priceCache.set(symbol, update);
        updates.push(update);

        // Write to DB every DB_WRITE_EVERY_N polls so REST API stays fresh too
        if (shouldWriteDb && priceData.price > 0) {
          dbWrites.push(
            db
              .update(marketsTable)
              .set({
                currentPrice: priceData.price.toString(),
                priceChange24h: priceData.priceChange24h.toString(),
                volume24h: priceData.volume24h.toString(),
                liquidity: priceData.liquidity.toString(),
                priceUpdatedAt: new Date(),
              })
              .where(eq(marketsTable.symbol, symbol))
              .then(() => {})
              .catch((err) => logger.warn({ err, symbol }, "DB price write failed"))
          );
        }
      } catch {
        // silently skip failed symbol fetches
      }
    })
  );

  // Flush DB writes in parallel (non-blocking for broadcast)
  if (dbWrites.length > 0) {
    Promise.allSettled(dbWrites).then(() => {
      logger.info({ count: dbWrites.length, poll: pollCount }, "DB prices refreshed from DexScreener");
    });
  }

  if (updates.length === 0 || !wss) return;

  // Broadcast to each connected WS client only what they're subscribed to
  wss.clients.forEach((ws) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const subs = clientSubscriptions.get(ws);
    const toSend =
      subs && subs.size > 0
        ? updates.filter((u) => subs.has(u.symbol))
        : updates; // no subscription filter = send all

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
