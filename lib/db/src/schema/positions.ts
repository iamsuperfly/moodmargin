import { pgTable, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const positionsTable = pgTable("positions", {
  id: text("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  marketSymbol: text("market_symbol").notNull(),
  marketName: text("market_name").notNull().default(""),
  direction: text("direction").notNull(), // 'long' | 'short'
  leverage: integer("leverage").notNull(),
  collateral: numeric("collateral", { precision: 18, scale: 4 }).notNull(),
  size: numeric("size", { precision: 18, scale: 4 }).notNull(),
  entryPrice: numeric("entry_price", { precision: 20, scale: 10 }).notNull(),
  currentPrice: numeric("current_price", { precision: 20, scale: 10 }),
  liquidationPrice: numeric("liquidation_price", { precision: 20, scale: 10 }),
  unrealizedPnl: numeric("unrealized_pnl", { precision: 18, scale: 4 }).default("0"),
  realizedPnl: numeric("realized_pnl", { precision: 18, scale: 4 }).default("0"),
  status: text("status").notNull().default("open"), // 'open' | 'closed'
  openedAt: timestamp("opened_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
});

export const insertPositionSchema = createInsertSchema(positionsTable).omit({
  openedAt: true,
  closedAt: true,
});
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type Position = typeof positionsTable.$inferSelect;
