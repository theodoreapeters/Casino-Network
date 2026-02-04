import { db } from './db';
import { users, games, distributorSettings } from '../shared/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

export async function initializeDatabase() {
  try {
    const existingAdmin = await db.select().from(users).where(eq(users.username, 'admin')).limit(1);
    
    if (existingAdmin.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const [admin] = await db.insert(users).values({
        username: 'admin',
        password: hashedPassword,
        role: 'distributor',
        points: 1000000
      }).returning();
      
      await db.insert(distributorSettings).values({
        distributorId: admin.id,
        slotRtp: 0.95,
        fishWinRate: 0.4,
        minBet: 1,
        maxBet: 1000
      });
      
      console.log('Admin distributor created: admin / admin123');
    }
    
    const existingGames = await db.select().from(games).limit(1);
    if (existingGames.length === 0) {
      await db.insert(games).values([
        {
          name: 'Lucky Fortune',
          type: 'slot',
          theme: 'chinese',
          config: {
            symbols: ['dragon', 'coin', 'lantern', 'fan', 'fish'],
            reels: 5,
            rows: 3,
            paylines: 20
          }
        },
        {
          name: 'Ocean Treasure',
          type: 'slot',
          theme: 'underwater',
          config: {
            symbols: ['pearl', 'treasure', 'mermaid', 'shell', 'anchor'],
            reels: 5,
            rows: 3,
            paylines: 25
          }
        },
        {
          name: 'Ocean Hunter',
          type: 'fish',
          theme: 'ocean',
          config: {
            fishTypes: [
              { name: 'smallFish', multiplier: 2, weight: 0.5 },
              { name: 'mediumFish', multiplier: 5, weight: 0.3 },
              { name: 'largeFish', multiplier: 10, weight: 0.15 },
              { name: 'shark', multiplier: 25, weight: 0.04 },
              { name: 'whale', multiplier: 50, weight: 0.01 }
            ],
            minBet: 1,
            maxBet: 100
          }
        }
      ]);
      console.log('Default games created');
    }
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}
