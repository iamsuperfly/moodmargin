import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  serial,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// markets
// ---------------------------------------------------------------------------
export const marketsTable = pgTable("markets", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull().unique(),
  name: text("name").notNull(),
  tokenAddress: text("token_address").notNull().unique(),
  chainName: text("chain_name").notNull(),
  logoUrl: text("logo_url"),
  coingeckoId: text("coingecko_id"),
  dexPairAddress: text("dex_pair_address"),
  currentPrice: text("current_price"),
  priceChange24h: text("price_change_24h"),
  volume24h: text("volume_24h"),
  liquidity: text("liquidity"),
  marketCap: text("market_cap"),
  verdict: text("verdict").notNull().default("UNREVIEWED"),
  maxLeverage: integer("max_leverage").notNull().default(5),
  tradingEnabled: boolean("trading_enabled").notNull().default(true),
  riskScore: integer("risk_score"),
  priceUpdatedAt: timestamp("price_updated_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMarketSchema = createInsertSchema(marketsTable).omit({
  createdAt: true,
});
export type InsertMarket = z.infer<typeof insertMarketSchema>;
export type Market = typeof marketsTable.$inferSelect;

// ---------------------------------------------------------------------------
// wallets
// ---------------------------------------------------------------------------
export const walletsTable = pgTable("wallets", {
  walletAddress: text("wallet_address").primaryKey(),
  mmUsdBalance: text("mm_usd_balance").notNull().default("5000"),
  totalRealizedPnl: text("total_realized_pnl").notNull().default("0"),
  totalTrades: integer("total_trades").notNull().default(0),
  openPositionsCount: integer("open_positions_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
});

export const insertWalletSchema = createInsertSchema(walletsTable).omit({
  createdAt: true,
  lastSeenAt: true,
});
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Wallet = typeof walletsTable.$inferSelect;

// ---------------------------------------------------------------------------
// positions
// ---------------------------------------------------------------------------
export const positionsTable = pgTable("positions", {
  id: text("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  marketSymbol: text("market_symbol").notNull(),
  marketName: text("market_name").notNull(),
  direction: text("direction").notNull(),
  leverage: integer("leverage").notNull(),
  collateral: text("collateral").notNull(),
  size: text("size").notNull(),
  entryPrice: text("entry_price").notNull(),
  currentPrice: text("current_price"),
  liquidationPrice: text("liquidation_price"),
  unrealizedPnl: text("unrealized_pnl").default("0"),
  realizedPnl: text("realized_pnl").default("0"),
  status: text("status").notNull().default("open"),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
});

export const insertPositionSchema = createInsertSchema(positionsTable).omit({
  openedAt: true,
});
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type Position = typeof positionsTable.$inferSelect;

// ---------------------------------------------------------------------------
// faucet_claims
// ---------------------------------------------------------------------------
export const faucetClaimsTable = pgTable("faucet_claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  walletAddress: text("wallet_address").notNull(),
  amount: text("amount").notNull(),
  claimedAt: timestamp("claimed_at").notNull().defaultNow(),
});

export const insertFaucetClaimSchema = createInsertSchema(faucetClaimsTable).omit({
  id: true,
  claimedAt: true,
});
export type InsertFaucetClaim = z.infer<typeof insertFaucetClaimSchema>;
export type FaucetClaim = typeof faucetClaimsTable.$inferSelect;

// ---------------------------------------------------------------------------
// listing_requests
// ---------------------------------------------------------------------------
export const listingRequestsTable = pgTable("listing_requests", {
  id: text("id").primaryKey(),
  tokenAddress: text("token_address").notNull(),
  chainName: text("chain_name").notNull(),
  tokenSymbol: text("token_symbol"),
  tokenName: text("token_name"),
  submittedBy: text("submitted_by").notNull(),
  status: text("status").notNull().default("pending"),
  verdict: text("verdict"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertListingRequestSchema = createInsertSchema(listingRequestsTable).omit({
  createdAt: true,
});
export type InsertListingRequest = z.infer<typeof insertListingRequestSchema>;
export type ListingRequest = typeof listingRequestsTable.$inferSelect;

// ---------------------------------------------------------------------------
// price_history  (queried via raw SQL in /markets/:symbol/history route)
// ---------------------------------------------------------------------------
export const priceHistoryTable = pgTable("price_history", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  price: text("price").notNull(),
  priceChange24h: text("price_change_24h"),
  volume24h: text("volume_24h"),
  liquidity: text("liquidity"),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

export const insertPriceHistorySchema = createInsertSchema(priceHistoryTable).omit({
  id: true,
  recordedAt: true,
});
export type InsertPriceHistory = z.infer<typeof insertPriceHistorySchema>;
export type PriceHistory = typeof priceHistoryTable.$inferSelect;
