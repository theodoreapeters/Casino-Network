import { pgTable, text, integer, boolean, timestamp, real, uuid, jsonb } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  role: text('role').notNull(), // 'distributor', 'manager', 'player'
  parentId: uuid('parent_id'), // manager's distributor or player's manager
  points: integer('points').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const distributorSettings = pgTable('distributor_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  distributorId: uuid('distributor_id').notNull().references(() => users.id),
  slotRtp: real('slot_rtp').notNull().default(0.95), // Return to Player percentage
  fishWinRate: real('fish_win_rate').notNull().default(0.4), // Base win rate for fish games
  minBet: integer('min_bet').notNull().default(1),
  maxBet: integer('max_bet').notNull().default(1000),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const games = pgTable('games', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'slot', 'fish'
  theme: text('theme').notNull(),
  config: jsonb('config').notNull(), // Game-specific configuration
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: text('type').notNull(), // 'recharge', 'redeem', 'bet', 'win'
  amount: integer('amount').notNull(),
  balanceBefore: integer('balance_before').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  gameId: uuid('game_id'),
  description: text('description'),
  performedBy: uuid('performed_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const gameRounds = pgTable('game_rounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').notNull().references(() => games.id),
  playerId: uuid('player_id').notNull().references(() => users.id),
  betAmount: integer('bet_amount').notNull(),
  winAmount: integer('win_amount').notNull().default(0),
  result: jsonb('result'), // Game-specific result data
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const fishGameTables = pgTable('fish_game_tables', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').notNull().references(() => games.id),
  seats: jsonb('seats').notNull().default([null, null, null, null]), // 4 seats
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type DistributorSettings = typeof distributorSettings.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type GameRound = typeof gameRounds.$inferSelect;
export type FishGameTable = typeof fishGameTables.$inferSelect;
