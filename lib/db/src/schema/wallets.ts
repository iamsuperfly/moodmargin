import { pgTable, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const walletsTable = pgTable("wallets", {
  walletAddress: text("wallet_address").primaryKey(),
  mmUsdBalance: numeric("mm_usd_balance", { precision: 18, scale: 4 }).notNull().default("5000"),
  totalRealizedPnl: numeric("total_realized_pnl", { precision: 18, scale: 4 }).notNull().default("0"),
  totalTrades: integer("total_trades").notNull().default(0),
  openPositionsCount: integer("open_positions_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
});

export const insertWalletSchema = createInsertSchema(walletsTable).omit({
  createdAt: true,
  lastSeenAt: true,
});
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Wallet = typeof walletsTable.$inferSelect;
