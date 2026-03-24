import express, { Express, Request, Response, NextFunction } from 'express';
import { db } from './db';
import { users, distributorSettings, transactions, games, gameRounds } from '../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import path from 'path';
import { CasinoEngine } from './casino-engine';
import { validateSessionToken } from './websocket';

declare module 'express-session' {
  interface SessionData {
    userId: string;
    role: string;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.role || !roles.includes(req.session.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

export function setupRoutes(app: Express) {
  app.post('/api/auth/ws-session', async (req, res) => {
    const { sessionToken } = req.body;
    if (!sessionToken) return res.status(400).json({ error: 'Missing token' });
    const userId = validateSessionToken(sessionToken);
    if (!userId) return res.status(403).json({ error: 'Invalid or expired token' });
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || user.role !== 'player') return res.status(403).json({ error: 'Invalid' });
      req.session.userId = user.id;
      req.session.role = user.role;
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Failed' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
      const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
      if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      if (!user.isActive) {
        return res.status(403).json({ error: 'Account is disabled' });
      }
      req.session.userId = user.id;
      req.session.role = user.role;
      res.json({ id: user.id, username: user.username, role: user.role, points: user.points });
    } catch (error) {
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId!)).limit(1);
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json({ id: user.id, username: user.username, role: user.role, points: user.points });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get user' });
    }
  });

  app.get('/api/users', requireAuth, requireRole('distributor', 'manager'), async (req, res) => {
    try {
      const role = req.session.role;
      let userList;
      if (role === 'distributor') {
        userList = await db.select().from(users).where(eq(users.parentId, req.session.userId!));
      } else {
        userList = await db.select().from(users)
          .where(and(eq(users.parentId, req.session.userId!), eq(users.role, 'player')));
      }
      res.json(userList.map(u => ({ id: u.id, username: u.username, role: u.role, points: u.points, isActive: u.isActive })));
    } catch (error) {
      res.status(500).json({ error: 'Failed to get users' });
    }
  });

  app.post('/api/users', requireAuth, requireRole('distributor', 'manager'), async (req, res) => {
    const { username, password, role: newUserRole } = req.body;
    const creatorRole = req.session.role;
    
    if (creatorRole === 'manager' && newUserRole !== 'player') {
      return res.status(403).json({ error: 'Managers can only create players' });
    }
    if (creatorRole === 'distributor' && !['manager', 'player'].includes(newUserRole)) {
      return res.status(403).json({ error: 'Invalid role' });
    }
    
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const [newUser] = await db.insert(users).values({
        username,
        password: hashedPassword,
        role: newUserRole,
        parentId: req.session.userId!
      }).returning();
      res.json({ id: newUser.id, username: newUser.username, role: newUser.role, points: newUser.points });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  app.post('/api/users/:id/points', requireAuth, requireRole('distributor', 'manager'), async (req, res) => {
    const { id } = req.params;
    const { amount, type } = req.body;
    
    try {
      const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!targetUser) return res.status(404).json({ error: 'User not found' });
      
      const [currentUser] = await db.select().from(users).where(eq(users.id, req.session.userId!)).limit(1);
      
      if (type === 'recharge') {
        if (currentUser.points < amount) {
          return res.status(400).json({ error: 'Insufficient points' });
        }
        await db.update(users).set({ points: currentUser.points - amount }).where(eq(users.id, currentUser.id));
        await db.update(users).set({ points: targetUser.points + amount }).where(eq(users.id, id));
        await db.insert(transactions).values({
          userId: id,
          type: 'recharge',
          amount,
          balanceBefore: targetUser.points,
          balanceAfter: targetUser.points + amount,
          performedBy: req.session.userId!,
          description: `Recharge by ${currentUser.username}`
        });
      } else if (type === 'redeem') {
        if (targetUser.points < amount) {
          return res.status(400).json({ error: 'Target has insufficient points' });
        }
        await db.update(users).set({ points: targetUser.points - amount }).where(eq(users.id, id));
        await db.update(users).set({ points: currentUser.points + amount }).where(eq(users.id, currentUser.id));
        await db.insert(transactions).values({
          userId: id,
          type: 'redeem',
          amount: -amount,
          balanceBefore: targetUser.points,
          balanceAfter: targetUser.points - amount,
          performedBy: req.session.userId!,
          description: `Redeem by ${currentUser.username}`
        });
      }
      
      const [updatedUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      res.json({ id: updatedUser.id, points: updatedUser.points });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update points' });
    }
  });

  app.get('/api/settings', requireAuth, requireRole('distributor'), async (req, res) => {
    try {
      const [settings] = await db.select().from(distributorSettings)
        .where(eq(distributorSettings.distributorId, req.session.userId!)).limit(1);
      res.json(settings || {});
    } catch (error) {
      res.status(500).json({ error: 'Failed to get settings' });
    }
  });

  app.put('/api/settings', requireAuth, requireRole('distributor'), async (req, res) => {
    const { slotRtp, fishWinRate, minBet, maxBet } = req.body;
    try {
      await db.update(distributorSettings)
        .set({ slotRtp, fishWinRate, minBet, maxBet, updatedAt: new Date() })
        .where(eq(distributorSettings.distributorId, req.session.userId!));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  app.get('/api/games', requireAuth, async (req, res) => {
    try {
      const gameList = await db.select().from(games).where(eq(games.isActive, true));
      res.json(gameList);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get games' });
    }
  });

  app.post('/api/games/spin', requireAuth, requireRole('player'), async (req, res) => {
    const { gameId, betAmount } = req.body;
    try {
      const result = await CasinoEngine.spinSlot(req.session.userId!, gameId, betAmount);
      if ('error' in result) {
        return res.status(400).json({ error: result.error });
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Spin failed' });
    }
  });

  app.get('/api/transactions', requireAuth, async (req, res) => {
    try {
      const txList = await db.select().from(transactions)
        .where(eq(transactions.userId, req.session.userId!))
        .orderBy(desc(transactions.createdAt))
        .limit(100);
      res.json(txList);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get transactions' });
    }
  });

  app.get('/api/reports/overview', requireAuth, requireRole('distributor', 'manager'), async (req, res) => {
    try {
      const userList = await db.select().from(users).where(eq(users.parentId, req.session.userId!));
      const totalPlayers = userList.filter(u => u.role === 'player').length;
      const totalManagers = userList.filter(u => u.role === 'manager').length;
      const totalPoints = userList.reduce((sum, u) => sum + u.points, 0);
      
      res.json({
        totalPlayers,
        totalManagers,
        totalPointsInCirculation: totalPoints,
        userCount: userList.length
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get report' });
    }
  });

  app.get('/api/game-config', requireAuth, requireRole('player'), async (req, res) => {
    try {
      const [player] = await db.select().from(users).where(eq(users.id, req.session.userId!)).limit(1);
      if (!player) return res.status(404).json({ error: 'Player not found' });

      let distributorId = player.parentId;
      if (distributorId) {
        const [parent] = await db.select().from(users).where(eq(users.id, distributorId)).limit(1);
        if (parent && parent.role === 'manager' && parent.parentId) {
          distributorId = parent.parentId;
        }
      }

      const [settings] = distributorId 
        ? await db.select().from(distributorSettings).where(eq(distributorSettings.distributorId, distributorId)).limit(1)
        : [];

      const gameList = await db.select().from(games).where(eq(games.isActive, true));

      res.json({
        player: {
          id: player.id,
          username: player.username,
          points: player.points
        },
        settings: {
          minBet: settings?.minBet || 1,
          maxBet: settings?.maxBet || 1000
        },
        games: gameList,
        fishTypes: [
          { name: 'smallFish', multiplier: 2, displayName: 'Small Fish', description: 'Common fish, easy to catch' },
          { name: 'mediumFish', multiplier: 5, displayName: 'Medium Fish', description: 'Moderate reward' },
          { name: 'largeFish', multiplier: 10, displayName: 'Large Fish', description: 'Good catch!' },
          { name: 'shark', multiplier: 25, displayName: 'Shark', description: 'Rare and valuable' },
          { name: 'whale', multiplier: 50, displayName: 'Whale', description: 'The big prize!' }
        ],
        slotThemes: [
          {
            id: 'chinese-fortune',
            name: 'Chinese Fortune',
            symbols: ['🐉', '🏮', '🧧', '💰', '🎋', '🔔', '⭐'],
            description: 'Traditional Chinese luck theme'
          },
          {
            id: 'ocean-treasure',
            name: 'Ocean Treasure',
            symbols: ['🐠', '🐙', '🦈', '🐚', '💎', '⚓', '🔱'],
            description: 'Deep sea adventure theme'
          }
        ],
        websocket: {
          path: '/ws',
          protocol: 'json',
          messageTypes: ['auth', 'joinFishGame', 'shoot', 'setBet', 'updateCannon', 'leaveTable']
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get game config' });
    }
  });

  app.use('/cocos-games', express.static(path.join(process.cwd(), 'public/cocos-games')));

  app.use(express.static(path.join(process.cwd(), 'dist/public')));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      res.sendFile(path.join(process.cwd(), 'dist/public/index.html'));
    }
  });
}
