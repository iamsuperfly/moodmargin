import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { db, pool } from "@workspace/db";
import { marketsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { fetchTokenPrice, fetchTokenByAddress } from "./dexscreener";
import { logger } from "./logger";
import { randomUUID } from "crypto";

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

const clientSubscriptions = new WeakMap<WebSocket, Set<string>>();
let wss: WebSocketServer | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
const priceCache = new Map<string, PriceUpdate>();

const WS_POLL_INTERVAL_MS = 10_000;
const DB_WRITE_EVERY_N = 3; // write to markets table every 30s

let pollCount = 0;

// Ensure price_history table exists — runs once at startup.
// Uses raw SQL so no migration file is needed.
async function ensurePriceHistoryTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS price_history (
      id          TEXT PRIMARY KEY,
      symbol      TEXT NOT NULL,
      price       NUMERIC(20,10) NOT NULL,
      price_change_24h NUMERIC(10,4),
      volume_24h  NUMERIC(20,4),
      liquidity   NUMERIC(20,4),
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_price_history_symbol_time
      ON price_history (symbol, recorded_at DESC);
  `);
}

// Remove price_history rows older than 7 days to keep the table lean.
async function trimOldHistory(): Promise<void> {
  await pool.query(
    `DELETE FROM price_history WHERE recorded_at < NOW() - INTERVAL '7 days'`
  );
}

export async function initPriceStream(server: import("http").Server): Promise<void> {
  try {
    await ensurePriceHistoryTable();
    logger.info("price_history table ready");
  } catch (err) {
    logger.error({ err }, "Could not create price_history table — history recording disabled");
  }

  wss = new WebSocketServer({ server, path: "/api/ws/prices" });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    clientSubscriptions.set(ws, new Set());

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

    ws.on("error", (err) => logger.warn({ err }, "WS client error"));
    ws.on("close", () => clientSubscriptions.delete(ws));
  });

  logger.info("WebSocket price stream started at /api/ws/prices");

  pollAndBroadcast().catch((err) => logger.error({ err }, "Initial price poll failed"));
  pollInterval = setInterval(() => {
    pollAndBroadcast().catch((err) => logger.error({ err }, "Price poll failed"));
  }, WS_POLL_INTERVAL_MS);

  // Trim old history once a day
  setInterval(() => {
    trimOldHistory().catch((err) => logger.warn({ err }, "price_history trim failed"));
  }, 24 * 60 * 60 * 1000);
}

async function pollAndBroadcast(): Promise<void> {
  if (!wss) return;

  pollCount++;
  const shouldWriteDb = pollCount % DB_WRITE_EVERY_N === 0 || pollCount === 1;

  let markets: { symbol: string; tokenAddress: string | null; chainName: string | null }[] = [];
  try {
    markets = await db
      .select({ symbol: marketsTable.symbol, tokenAddress: marketsTable.tokenAddress, chainName: marketsTable.chainName })
      .from(marketsTable);
  } catch {
    return;
  }

  if (markets.length === 0) return;

  const updates: PriceUpdate[] = [];
  const dbWrites: Promise<void>[] = [];
  const historyRows: { id: string; symbol: string; price: number; priceChange24h: number; volume24h: number; liquidity: number }[] = [];

  await Promise.allSettled(
    markets.map(async ({ symbol, tokenAddress, chainName }) => {
      try {
        let priceData: { price: number; priceChange24h: number; volume24h: number; liquidity: number } | null = null;

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
        if (!priceData) priceData = await fetchTokenPrice(symbol);
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

        if (shouldWriteDb && priceData.price > 0) {
          // Write current price to markets table
          dbWrites.push(
            db.update(marketsTable)
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
          // Queue price history row
          historyRows.push({ id: randomUUID(), symbol, ...priceData });
        }
      } catch {
        // silently skip
      }
    })
  );

  // Flush markets DB writes
  if (dbWrites.length > 0) {
    Promise.allSettled(dbWrites).then(() => {
      logger.info({ count: dbWrites.length, poll: pollCount }, "DB prices refreshed");
    });
  }

  // Bulk-insert price history rows
  if (historyRows.length > 0) {
    const values = historyRows
      .map((r) => `('${r.id}','${r.symbol}',${r.price},${r.priceChange24h},${r.volume24h},${r.liquidity},NOW())`)
      .join(",");
    pool
      .query(`INSERT INTO price_history (id,symbol,price,price_change_24h,volume_24h,liquidity,recorded_at) VALUES ${values}`)
      .catch((err) => logger.warn({ err }, "price_history insert failed"));
  }

  // Broadcast to WS clients
  if (updates.length === 0 || !wss) return;
  wss.clients.forEach((ws) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const subs = clientSubscriptions.get(ws);
    const toSend = subs && subs.size > 0 ? updates.filter((u) => subs.has(u.symbol)) : updates;
    if (toSend.length > 0) {
      ws.send(JSON.stringify({ type: "prices", data: toSend }));
    }
  });
}

export function stopPriceStream(): void {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  wss?.close();
  wss = null;
}
