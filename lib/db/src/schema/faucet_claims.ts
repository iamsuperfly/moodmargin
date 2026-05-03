import { pgTable, text, numeric, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const faucetClaimsTable = pgTable("faucet_claims", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull().default("1000"),
  claimedAt: timestamp("claimed_at").defaultNow().notNull(),
});

export const insertFaucetClaimSchema = createInsertSchema(faucetClaimsTable).omit({
  id: true,
  claimedAt: true,
});
export type InsertFaucetClaim = z.infer<typeof insertFaucetClaimSchema>;
export type FaucetClaim = typeof faucetClaimsTable.$inferSelect;
