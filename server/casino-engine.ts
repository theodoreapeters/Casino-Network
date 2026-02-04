import { db } from './db';
import { users, distributorSettings, transactions, gameRounds, games } from '../shared/schema';
import { eq } from 'drizzle-orm';

interface SlotResult {
  reels: string[][];
  winAmount: number;
  winLines: number[];
}

interface FishHitResult {
  isWin: boolean;
  winAmount: number;
  multiplier: number;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  settings?: typeof distributorSettings.$inferSelect;
}

export class CasinoEngine {
  private static symbols = ['dragon', 'coin', 'lantern', 'fan', 'fish', 'wild', 'scatter'];
  
  static async getDistributorSettings(playerId: string) {
    const [player] = await db.select().from(users).where(eq(users.id, playerId)).limit(1);
    if (!player) return null;
    
    let distributorId = player.parentId;
    if (player.role === 'player' && player.parentId) {
      const [manager] = await db.select().from(users).where(eq(users.id, player.parentId)).limit(1);
      if (manager && manager.parentId) {
        distributorId = manager.parentId;
      }
    }
    
    if (!distributorId) return null;
    
    const [settings] = await db.select().from(distributorSettings)
      .where(eq(distributorSettings.distributorId, distributorId)).limit(1);
    return settings;
  }

  static async validatePlayer(playerId: string): Promise<{ player: typeof users.$inferSelect | null; valid: boolean; error?: string }> {
    const [player] = await db.select().from(users).where(eq(users.id, playerId)).limit(1);
    if (!player) {
      return { player: null, valid: false, error: 'Player not found' };
    }
    if (player.role !== 'player') {
      return { player: null, valid: false, error: 'Only players can play games' };
    }
    if (!player.isActive) {
      return { player: null, valid: false, error: 'Account is disabled' };
    }
    return { player, valid: true };
  }

  static async validateBet(playerId: string, betAmount: number, gameId: string, gameType: 'slot' | 'fish'): Promise<ValidationResult> {
    const { player, valid, error } = await this.validatePlayer(playerId);
    if (!valid || !player) {
      return { valid: false, error };
    }

    if (player.points < betAmount) {
      return { valid: false, error: 'Insufficient points' };
    }

    const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
    if (!game) {
      return { valid: false, error: 'Game not found' };
    }
    if (game.type !== gameType) {
      return { valid: false, error: `Invalid game type. Expected ${gameType}` };
    }
    if (!game.isActive) {
      return { valid: false, error: 'Game is not active' };
    }

    const settings = await this.getDistributorSettings(playerId);
    const minBet = settings?.minBet || 1;
    const maxBet = settings?.maxBet || 1000;

    if (betAmount < minBet) {
      return { valid: false, error: `Minimum bet is ${minBet}` };
    }
    if (betAmount > maxBet) {
      return { valid: false, error: `Maximum bet is ${maxBet}` };
    }

    return { valid: true, settings: settings || undefined };
  }
  
  static async spinSlot(playerId: string, gameId: string, betAmount: number): Promise<SlotResult | { error: string }> {
    const validation = await this.validateBet(playerId, betAmount, gameId, 'slot');
    if (!validation.valid) {
      return { error: validation.error || 'Validation failed' };
    }

    const [player] = await db.select().from(users).where(eq(users.id, playerId)).limit(1);
    if (!player) return { error: 'Player not found' };
    
    const rtp = validation.settings?.slotRtp || 0.95;
    
    const reels: string[][] = [];
    for (let i = 0; i < 5; i++) {
      const reel: string[] = [];
      for (let j = 0; j < 3; j++) {
        reel.push(this.symbols[Math.floor(Math.random() * this.symbols.length)]);
      }
      reels.push(reel);
    }
    
    let winAmount = 0;
    const winLines: number[] = [];
    
    const shouldWin = Math.random() < rtp;
    if (shouldWin) {
      const matchCount = Math.floor(Math.random() * 3) + 3;
      const symbol = this.symbols[Math.floor(Math.random() * this.symbols.length)];
      for (let i = 0; i < matchCount; i++) {
        reels[i][1] = symbol;
      }
      const multipliers = [0, 0, 0, 2, 5, 10];
      winAmount = betAmount * multipliers[matchCount];
      winLines.push(1);
    }
    
    await db.update(users)
      .set({ points: player.points - betAmount + winAmount })
      .where(eq(users.id, playerId));
    
    await db.insert(transactions).values({
      userId: playerId,
      type: 'bet',
      amount: -betAmount,
      balanceBefore: player.points,
      balanceAfter: player.points - betAmount,
      gameId,
      description: 'Slot bet'
    });
    
    if (winAmount > 0) {
      await db.insert(transactions).values({
        userId: playerId,
        type: 'win',
        amount: winAmount,
        balanceBefore: player.points - betAmount,
        balanceAfter: player.points - betAmount + winAmount,
        gameId,
        description: 'Slot win'
      });
    }
    
    await db.insert(gameRounds).values({
      gameId,
      playerId,
      betAmount,
      winAmount,
      result: { reels, winLines }
    });
    
    return { reels, winAmount, winLines };
  }
  
  static async hitFish(
    playerId: string,
    gameId: string,
    betAmount: number,
    fishType: string,
    fishMultiplier: number,
    fishWeight: number
  ): Promise<FishHitResult | { error: string }> {
    const validation = await this.validateBet(playerId, betAmount, gameId, 'fish');
    if (!validation.valid) {
      return { error: validation.error || 'Validation failed' };
    }

    const [player] = await db.select().from(users).where(eq(users.id, playerId)).limit(1);
    if (!player) return { error: 'Player not found' };

    const baseWinRate = validation.settings?.fishWinRate || 0.4;
    
    const adjustedWinRate = baseWinRate * fishWeight;
    const isWin = Math.random() < adjustedWinRate;
    const winAmount = isWin ? betAmount * fishMultiplier : 0;
    
    await db.update(users)
      .set({ points: player.points - betAmount + winAmount })
      .where(eq(users.id, playerId));
    
    await db.insert(transactions).values({
      userId: playerId,
      type: 'bet',
      amount: -betAmount,
      balanceBefore: player.points,
      balanceAfter: player.points - betAmount,
      gameId,
      description: `Fish shot - ${fishType}`
    });
    
    if (winAmount > 0) {
      await db.insert(transactions).values({
        userId: playerId,
        type: 'win',
        amount: winAmount,
        balanceBefore: player.points - betAmount,
        balanceAfter: player.points - betAmount + winAmount,
        gameId,
        description: `Fish hit win - ${fishType} x${fishMultiplier}`
      });
    }
    
    return { isWin, winAmount, multiplier: fishMultiplier };
  }

  static async validateFishBet(playerId: string, betAmount: number): Promise<{ valid: boolean; error?: string; clampedBet?: number }> {
    const { player, valid, error } = await this.validatePlayer(playerId);
    if (!valid || !player) {
      return { valid: false, error };
    }

    const settings = await this.getDistributorSettings(playerId);
    const minBet = settings?.minBet || 1;
    const maxBet = Math.min(settings?.maxBet || 100, 100);

    const clampedBet = Math.max(minBet, Math.min(maxBet, betAmount));
    return { valid: true, clampedBet };
  }

  static async validateFishGame(gameId: string): Promise<{ valid: boolean; error?: string }> {
    const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
    if (!game) {
      return { valid: false, error: 'Game not found' };
    }
    if (game.type !== 'fish') {
      return { valid: false, error: 'Not a fish game' };
    }
    if (!game.isActive) {
      return { valid: false, error: 'Game is not active' };
    }
    return { valid: true };
  }
}
