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
  
  static async spinSlot(playerId: string, gameId: string, betAmount: number): Promise<SlotResult | null> {
    const [player] = await db.select().from(users).where(eq(users.id, playerId)).limit(1);
    if (!player || player.points < betAmount) return null;
    
    const settings = await this.getDistributorSettings(playerId);
    const rtp = settings?.slotRtp || 0.95;
    
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
  ): Promise<FishHitResult | null> {
    const [player] = await db.select().from(users).where(eq(users.id, playerId)).limit(1);
    if (!player || player.points < betAmount) return null;
    
    const settings = await this.getDistributorSettings(playerId);
    const baseWinRate = settings?.fishWinRate || 0.4;
    
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
}
