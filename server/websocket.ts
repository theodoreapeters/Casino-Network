import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { CasinoEngine } from './casino-engine';
import { db } from './db';
import { users, games, distributorSettings } from '../shared/schema';
import { eq } from 'drizzle-orm';

interface Player {
  id: string;
  socket: WebSocket;
  seatIndex: number;
  cannonAngle: number;
  betAmount: number;
}

interface FishGameTable {
  id: string;
  gameId: string;
  players: Map<string, Player>;
  fish: Map<string, Fish>;
  bullets: Map<string, Bullet>;
}

interface Fish {
  id: string;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  multiplier: number;
  weight: number;
  createdAt: number;
}

interface Bullet {
  id: string;
  playerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  betAmount: number;
}

const tables = new Map<string, FishGameTable>();
const playerConnections = new Map<string, WebSocket>();
const GAME_WIDTH = 1200;
const GAME_HEIGHT = 800;
const HALF_W = GAME_WIDTH / 2;
const HALF_H = GAME_HEIGHT / 2;
const BULLET_SPEED = 10;

const CANNON_POSITIONS = [
  { x: -HALF_W + 100, y: -HALF_H + 50 },
  { x: HALF_W - 100, y: -HALF_H + 50 },
  { x: -HALF_W + 100, y: HALF_H - 50 },
  { x: HALF_W - 100, y: HALF_H - 50 }
];

const tableSequences = new Map<string, number>();

function getNextSequence(tableId: string): number {
  const current = tableSequences.get(tableId) || 0;
  const next = current + 1;
  tableSequences.set(tableId, next);
  return next;
}

const fishTypes = [
  { name: 'smallFish', multiplier: 2, weight: 0.5, speed: 3 },
  { name: 'mediumFish', multiplier: 5, weight: 0.3, speed: 2 },
  { name: 'largeFish', multiplier: 10, weight: 0.15, speed: 1.5 },
  { name: 'shark', multiplier: 25, weight: 0.04, speed: 1 },
  { name: 'whale', multiplier: 50, weight: 0.01, speed: 0.5 }
];

function createFish(): Fish {
  const typeIndex = Math.random();
  let cumWeight = 0;
  let selectedType = fishTypes[0];
  for (const ft of fishTypes) {
    cumWeight += ft.weight;
    if (typeIndex < cumWeight) {
      selectedType = ft;
      break;
    }
  }
  
  const side = Math.floor(Math.random() * 4);
  let x = 0, y = 0, vx = 0, vy = 0;
  const speed = selectedType.speed * (0.5 + Math.random());
  
  switch (side) {
    case 0: x = -HALF_W - 50; y = (Math.random() - 0.5) * GAME_HEIGHT; vx = speed; vy = (Math.random() - 0.5) * speed; break;
    case 1: x = HALF_W + 50; y = (Math.random() - 0.5) * GAME_HEIGHT; vx = -speed; vy = (Math.random() - 0.5) * speed; break;
    case 2: x = (Math.random() - 0.5) * GAME_WIDTH; y = -HALF_H - 50; vx = (Math.random() - 0.5) * speed; vy = speed; break;
    case 3: x = (Math.random() - 0.5) * GAME_WIDTH; y = HALF_H + 50; vx = (Math.random() - 0.5) * speed; vy = -speed; break;
  }
  
  return {
    id: uuidv4(),
    type: selectedType.name,
    x, y, vx, vy,
    multiplier: selectedType.multiplier,
    weight: selectedType.weight,
    createdAt: Date.now()
  };
}

function broadcast(table: FishGameTable, message: object) {
  const data = JSON.stringify(message);
  table.players.forEach(player => {
    if (player.socket.readyState === WebSocket.OPEN) {
      player.socket.send(data);
    }
  });
}

function sendTo(ws: WebSocket, message: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function getOrCreateTable(gameId: string): FishGameTable {
  for (const [id, table] of tables) {
    if (table.gameId === gameId && table.players.size < 4) {
      return table;
    }
  }
  
  const table: FishGameTable = {
    id: uuidv4(),
    gameId,
    players: new Map(),
    fish: new Map(),
    bullets: new Map()
  };
  tables.set(table.id, table);
  
  for (let i = 0; i < 10; i++) {
    const fish = createFish();
    table.fish.set(fish.id, fish);
  }
  
  return table;
}

function updateGame(table: FishGameTable) {
  table.fish.forEach((fish, fishId) => {
    fish.x += fish.vx;
    fish.y += fish.vy;
    
    if (fish.x < -HALF_W - 100 || fish.x > HALF_W + 100 || fish.y < -HALF_H - 100 || fish.y > HALF_H + 100) {
      table.fish.delete(fishId);
    }
  });
  
  while (table.fish.size < 15) {
    const fish = createFish();
    table.fish.set(fish.id, fish);
    console.log(`[Table ${table.id.slice(0,8)}] Fish spawned: ${fish.type} (x${fish.multiplier}) at (${Math.round(fish.x)}, ${Math.round(fish.y)}) vel (${fish.vx.toFixed(1)}, ${fish.vy.toFixed(1)})`);
    broadcast(table, { type: 'fishSpawn', fish });
  }
  
  table.bullets.forEach((bullet, bulletId) => {
    bullet.x += bullet.vx;
    bullet.y += bullet.vy;
    
    if (bullet.x <= -HALF_W) { bullet.x = -HALF_W; bullet.vx *= -1; }
    else if (bullet.x >= HALF_W) { bullet.x = HALF_W; bullet.vx *= -1; }
    if (bullet.y <= -HALF_H) { bullet.y = -HALF_H; bullet.vy *= -1; }
    else if (bullet.y >= HALF_H) { bullet.y = HALF_H; bullet.vy *= -1; }
    
    table.fish.forEach(async (fish, fishId) => {
      const dx = bullet.x - fish.x;
      const dy = bullet.y - fish.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const hitRadius = fish.type === 'whale' ? 80 : fish.type === 'shark' ? 50 : 30;
      
      if (distance < hitRadius) {
        table.bullets.delete(bulletId);
        
        const result = await CasinoEngine.hitFish(
          bullet.playerId,
          table.gameId,
          bullet.betAmount,
          fish.type,
          fish.multiplier,
          fish.weight
        );
        
        const player = table.players.get(bullet.playerId);
        
        if (result && 'error' in result) {
          if (player) {
            sendTo(player.socket, { type: 'error', message: result.error });
            const [updatedUser] = await db.select().from(users).where(eq(users.id, bullet.playerId)).limit(1);
            sendTo(player.socket, { type: 'pointsUpdate', points: updatedUser?.points || 0 });
          }
          return;
        }
        
        if (result && result.isWin) {
          table.fish.delete(fishId);
          broadcast(table, {
            type: 'fishKilled',
            fishId,
            playerId: bullet.playerId,
            winAmount: result.winAmount
          });
          
          if (player) {
            const [updatedUser] = await db.select().from(users).where(eq(users.id, bullet.playerId)).limit(1);
            sendTo(player.socket, { type: 'pointsUpdate', points: updatedUser?.points || 0 });
          }
        } else {
          broadcast(table, { type: 'bulletHit', bulletId, fishId, playerId: bullet.playerId });
          if (player) {
            const [updatedUser] = await db.select().from(users).where(eq(users.id, bullet.playerId)).limit(1);
            sendTo(player.socket, { type: 'pointsUpdate', points: updatedUser?.points || 0 });
          }
        }
      }
    });
    
    if (Date.now() - (bullet as any).createdAt > 10000) {
      table.bullets.delete(bulletId);
    }
  });
  
  broadcast(table, {
    type: 'gameState',
    seq: getNextSequence(table.id),
    serverTime: Date.now(),
    fish: Array.from(table.fish.values()),
    bullets: Array.from(table.bullets.values()),
    players: Array.from(table.players.entries()).map(([id, p]) => ({
      id,
      seatIndex: p.seatIndex,
      cannonAngle: p.cannonAngle,
      betAmount: p.betAmount
    }))
  });
}

export function setupWebSocket(wss: WebSocketServer) {
  setInterval(() => {
    tables.forEach(table => {
      if (table.players.size > 0) {
        updateGame(table);
      }
    });
  }, 50);
  
  setInterval(() => {
    tables.forEach(table => {
      if (table.players.size > 0) {
        const fishByType: Record<string, number> = {};
        table.fish.forEach(f => { fishByType[f.type] = (fishByType[f.type] || 0) + 1; });
        const fishSummary = Object.entries(fishByType).map(([t, c]) => `${t}:${c}`).join(' ');
        const playerList = Array.from(table.players.entries()).map(([id, p]) => `seat${p.seatIndex}(bet:${p.betAmount})`).join(', ');
        console.log(`[Table ${table.id.slice(0,8)} Status] Players: ${table.players.size}/4 [${playerList}] | Fish: ${table.fish.size} [${fishSummary}] | Bullets: ${table.bullets.size}`);
      }
    });
  }, 10000);
  
  wss.on('connection', async (ws: WebSocket, req: any) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const connId = uuidv4().slice(0, 8);
    console.log(`[WS ${connId}] Connected from ${clientIp} | Origin: ${req.headers.origin || 'none'}`);
    
    let currentPlayerId: string | null = null;
    let currentTable: FishGameTable | null = null;
    
    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        console.log(`[WS ${connId}] ← ${message.type}${currentPlayerId ? ` (player: ${currentPlayerId.slice(0,8)})` : ''}`);
        
        switch (message.type) {
          case 'login':
            const { username, password } = message;
            if (!username || !password) {
              sendTo(ws, { type: 'loginFailed', reason: 'Username and password required' });
              return;
            }
            
            const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
            if (!user || !await bcrypt.compare(password, user.password)) {
              sendTo(ws, { type: 'loginFailed', reason: 'Invalid credentials' });
              return;
            }
            if (!user.isActive) {
              sendTo(ws, { type: 'loginFailed', reason: 'Account is disabled' });
              return;
            }
            if (user.role !== 'player') {
              sendTo(ws, { type: 'loginFailed', reason: 'Only players can login via game client' });
              return;
            }
            
            currentPlayerId = user.id;
            (ws as any).authenticated = true;
            (ws as any).userId = user.id;
            playerConnections.set(currentPlayerId, ws);
            console.log(`[WS ${connId}] → loginSuccess for "${user.username}" (${user.id.slice(0,8)})`);
            sendTo(ws, { 
              type: 'loginSuccess', 
              player: { id: user.id, username: user.username, role: user.role, points: user.points } 
            });
            break;
            
          case 'auth':
            if (!currentPlayerId) {
              sendTo(ws, { type: 'authFailed', reason: 'Not logged in' });
              return;
            }
            const [player] = await db.select().from(users).where(eq(users.id, currentPlayerId)).limit(1);
            if (player) {
              sendTo(ws, { type: 'authSuccess', player: { id: player.id, username: player.username, points: player.points } });
            }
            break;
            
          case 'getGameConfig':
            if (!currentPlayerId) {
              sendTo(ws, { type: 'error', message: 'Not logged in' });
              return;
            }
            
            try {
              const [configPlayer] = await db.select().from(users).where(eq(users.id, currentPlayerId)).limit(1);
              if (!configPlayer) {
                sendTo(ws, { type: 'error', message: 'Player not found' });
                return;
              }
              
              let distributorId = configPlayer.parentId;
              if (distributorId) {
                const [parent] = await db.select().from(users).where(eq(users.id, distributorId)).limit(1);
                if (parent && parent.role === 'manager' && parent.parentId) {
                  distributorId = parent.parentId;
                }
              }
              
              const settingsResult = distributorId 
                ? await db.select().from(distributorSettings).where(eq(distributorSettings.distributorId, distributorId)).limit(1)
                : [];
              const settings = settingsResult[0];
              
              const gameList = await db.select().from(games).where(eq(games.isActive, true));
              
              sendTo(ws, {
                type: 'gameConfig',
                player: {
                  id: configPlayer.id,
                  username: configPlayer.username,
                  points: configPlayer.points
                },
                gameWorld: {
                  width: GAME_WIDTH,
                  height: GAME_HEIGHT,
                  origin: 'center',
                  xRange: [-HALF_W, HALF_W],
                  yRange: [-HALF_H, HALF_H],
                  cannonPositions: CANNON_POSITIONS,
                  bulletSpeed: BULLET_SPEED
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
                ]
              });
            } catch (error) {
              sendTo(ws, { type: 'error', message: 'Failed to load game config' });
            }
            break;
            
          case 'joinFishGame':
            if (!currentPlayerId) return;
            
            const gameValidation = await CasinoEngine.validateFishGame(message.gameId);
            if (!gameValidation.valid) {
              sendTo(ws, { type: 'error', message: gameValidation.error || 'Invalid game' });
              return;
            }
            
            currentTable = getOrCreateTable(message.gameId);
            const seatIndex = Array.from(currentTable.players.values()).map(p => p.seatIndex);
            const availableSeat = [0, 1, 2, 3].find(i => !seatIndex.includes(i)) ?? 0;
            
            currentTable.players.set(currentPlayerId, {
              id: currentPlayerId,
              socket: ws,
              seatIndex: availableSeat,
              cannonAngle: 0,
              betAmount: 1
            });
            
            sendTo(ws, {
              type: 'joinedTable',
              tableId: currentTable.id,
              seatIndex: availableSeat,
              gameWorld: {
                width: GAME_WIDTH,
                height: GAME_HEIGHT,
                origin: 'center',
                xRange: [-HALF_W, HALF_W],
                yRange: [-HALF_H, HALF_H],
                cannonPositions: CANNON_POSITIONS,
                bulletSpeed: BULLET_SPEED
              },
              fish: Array.from(currentTable.fish.values())
            });
            
            broadcast(currentTable, { type: 'playerJoined', playerId: currentPlayerId, seatIndex: availableSeat });
            break;
            
          case 'shoot':
            if (!currentPlayerId || !currentTable) return;
            const shootingPlayer = currentTable.players.get(currentPlayerId);
            if (!shootingPlayer) return;
            
            const shootGameValidation = await CasinoEngine.validateFishGame(currentTable.gameId);
            if (!shootGameValidation.valid) {
              sendTo(ws, { type: 'error', message: shootGameValidation.error || 'Game is no longer available' });
              return;
            }
            
            const shootPlayerValidation = await CasinoEngine.validatePlayer(currentPlayerId);
            if (!shootPlayerValidation.valid) {
              sendTo(ws, { type: 'error', message: shootPlayerValidation.error || 'Invalid player' });
              return;
            }
            
            const [currentUser] = await db.select().from(users).where(eq(users.id, currentPlayerId)).limit(1);
            let activeBulletCost = 0;
            currentTable.bullets.forEach(bullet => {
              if (bullet.playerId === currentPlayerId) {
                activeBulletCost += bullet.betAmount;
              }
            });
            const requiredPoints = activeBulletCost + shootingPlayer.betAmount;
            if (!currentUser || currentUser.points < requiredPoints) {
              sendTo(ws, { type: 'error', message: 'Insufficient points' });
              return;
            }
            
            const pos = CANNON_POSITIONS[shootingPlayer.seatIndex];
            const angle = message.angle;
            
            const bullet: Bullet & { createdAt: number } = {
              id: uuidv4(),
              playerId: currentPlayerId,
              x: pos.x,
              y: pos.y,
              vx: Math.cos(angle) * BULLET_SPEED,
              vy: Math.sin(angle) * BULLET_SPEED,
              betAmount: shootingPlayer.betAmount,
              createdAt: Date.now()
            };
            
            currentTable.bullets.set(bullet.id, bullet);
            broadcast(currentTable, { type: 'bulletFired', bullet, playerId: currentPlayerId });
            break;
            
          case 'setBet':
            if (!currentPlayerId || !currentTable) return;
            const betPlayer = currentTable.players.get(currentPlayerId);
            if (betPlayer) {
              const validation = await CasinoEngine.validateFishBet(currentPlayerId, message.amount);
              if (validation.valid && validation.clampedBet) {
                betPlayer.betAmount = validation.clampedBet;
                sendTo(ws, { type: 'betSet', amount: betPlayer.betAmount });
              } else {
                sendTo(ws, { type: 'error', message: validation.error || 'Invalid bet' });
              }
            }
            break;
            
          case 'updateCannon':
            if (!currentPlayerId || !currentTable) return;
            const cannonPlayer = currentTable.players.get(currentPlayerId);
            if (cannonPlayer) {
              cannonPlayer.cannonAngle = message.angle;
            }
            break;
            
          case 'leaveTable':
            if (currentPlayerId && currentTable) {
              currentTable.players.delete(currentPlayerId);
              broadcast(currentTable, { type: 'playerLeft', playerId: currentPlayerId });
              currentTable = null;
            }
            break;
        }
      } catch (error) {
        console.error(`[WS ${connId}] Message parse/handle error:`, error);
      }
    });
    
    ws.on('close', (code, reason) => {
      console.log(`[WS ${connId}] Disconnected (code: ${code}, reason: "${reason || 'none'}")${currentPlayerId ? ` player: ${currentPlayerId.slice(0,8)}` : ''}`);
      if (currentPlayerId) {
        playerConnections.delete(currentPlayerId);
        if (currentTable) {
          currentTable.players.delete(currentPlayerId);
          broadcast(currentTable, { type: 'playerLeft', playerId: currentPlayerId });
        }
      }
    });
    
    ws.on('error', (err) => {
      console.error(`[WS ${connId}] Error:`, err.message);
    });
  });
}
