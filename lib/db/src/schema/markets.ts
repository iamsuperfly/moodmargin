import { pgTable, text, numeric, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const marketsTable = pgTable("markets", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull().unique(),
  name: text("name").notNull(),
  tokenAddress: text("token_address").notNull(),
  chainName: text("chain_name").notNull(),
  logoUrl: text("logo_url"),
  coingeckoId: text("coingecko_id"),
  dexPairAddress: text("dex_pair_address"),
  currentPrice: numeric("current_price", { precision: 20, scale: 10 }).default("0"),
  priceChange24h: numeric("price_change_24h", { precision: 10, scale: 4 }).default("0"),
  volume24h: numeric("volume_24h", { precision: 20, scale: 4 }).default("0"),
  liquidity: numeric("liquidity", { precision: 20, scale: 4 }).default("0"),
  marketCap: numeric("market_cap", { precision: 20, scale: 4 }).default("0"),
  verdict: text("verdict").notNull().default("UNREVIEWED"),
  maxLeverage: integer("max_leverage").notNull().default(10),
  tradingEnabled: boolean("trading_enabled").notNull().default(true),
  riskScore: integer("risk_score").default(0),
  priceUpdatedAt: timestamp("price_updated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMarketSchema = createInsertSchema(marketsTable).omit({
  createdAt: true,
});
export type InsertMarket = z.infer<typeof insertMarketSchema>;
export type Market = typeof marketsTable.$inferSelect;
