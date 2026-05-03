import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const listingRequestsTable = pgTable("listing_requests", {
  id: text("id").primaryKey(),
  tokenAddress: text("token_address").notNull(),
  chainName: text("chain_name").notNull(),
  tokenSymbol: text("token_symbol"),
  tokenName: text("token_name"),
  submittedBy: text("submitted_by").notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected'
  verdict: text("verdict"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertListingRequestSchema = createInsertSchema(listingRequestsTable).omit({
  createdAt: true,
});
export type InsertListingRequest = z.infer<typeof insertListingRequestSchema>;
export type ListingRequest = typeof listingRequestsTable.$inferSelect;
