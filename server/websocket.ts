import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { CasinoEngine } from './casino-engine';
import { db } from './db';
import { users } from '../shared/schema';
import { eq } from 'drizzle-orm';

interface Player {
  id: string;
  odcket: WebSocket;
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
    case 0: x = -50; y = Math.random() * GAME_HEIGHT; vx = speed; vy = (Math.random() - 0.5) * speed; break;
    case 1: x = GAME_WIDTH + 50; y = Math.random() * GAME_HEIGHT; vx = -speed; vy = (Math.random() - 0.5) * speed; break;
    case 2: x = Math.random() * GAME_WIDTH; y = -50; vx = (Math.random() - 0.5) * speed; vy = speed; break;
    case 3: x = Math.random() * GAME_WIDTH; y = GAME_HEIGHT + 50; vx = (Math.random() - 0.5) * speed; vy = -speed; break;
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
    if (player.odcket.readyState === WebSocket.OPEN) {
      player.odcket.send(data);
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
    
    if (fish.x < -100 || fish.x > GAME_WIDTH + 100 || fish.y < -100 || fish.y > GAME_HEIGHT + 100) {
      table.fish.delete(fishId);
    }
  });
  
  while (table.fish.size < 15) {
    const fish = createFish();
    table.fish.set(fish.id, fish);
    broadcast(table, { type: 'fishSpawn', fish });
  }
  
  table.bullets.forEach((bullet, bulletId) => {
    bullet.x += bullet.vx;
    bullet.y += bullet.vy;
    
    if (bullet.x <= 0 || bullet.x >= GAME_WIDTH) bullet.vx *= -1;
    if (bullet.y <= 0 || bullet.y >= GAME_HEIGHT) bullet.vy *= -1;
    
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
        
        if (result?.isWin) {
          table.fish.delete(fishId);
          broadcast(table, {
            type: 'fishKilled',
            fishId,
            playerId: bullet.playerId,
            winAmount: result.winAmount
          });
          
          const player = table.players.get(bullet.playerId);
          if (player) {
            const [updatedUser] = await db.select().from(users).where(eq(users.id, bullet.playerId)).limit(1);
            sendTo(player.odcket, { type: 'pointsUpdate', points: updatedUser?.points || 0 });
          }
        } else {
          broadcast(table, { type: 'bulletHit', bulletId, fishId, playerId: bullet.playerId });
        }
      }
    });
    
    if (Date.now() - (bullet as any).createdAt > 10000) {
      table.bullets.delete(bulletId);
    }
  });
  
  broadcast(table, {
    type: 'gameState',
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
  
  wss.on('connection', (ws: WebSocket) => {
    let currentPlayerId: string | null = null;
    let currentTable: FishGameTable | null = null;
    
    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'auth':
            const [player] = await db.select().from(users).where(eq(users.id, message.playerId)).limit(1);
            if (player && player.role === 'player') {
              currentPlayerId = player.id;
              playerConnections.set(player.id, ws);
              sendTo(ws, { type: 'authSuccess', player: { id: player.id, username: player.username, points: player.points } });
            } else {
              sendTo(ws, { type: 'authFailed' });
            }
            break;
            
          case 'joinFishGame':
            if (!currentPlayerId) return;
            currentTable = getOrCreateTable(message.gameId);
            const seatIndex = Array.from(currentTable.players.values()).map(p => p.seatIndex);
            const availableSeat = [0, 1, 2, 3].find(i => !seatIndex.includes(i)) ?? 0;
            
            currentTable.players.set(currentPlayerId, {
              id: currentPlayerId,
              odcket: ws,
              seatIndex: availableSeat,
              cannonAngle: 0,
              betAmount: 1
            });
            
            sendTo(ws, {
              type: 'joinedTable',
              tableId: currentTable.id,
              seatIndex: availableSeat,
              fish: Array.from(currentTable.fish.values())
            });
            
            broadcast(currentTable, { type: 'playerJoined', playerId: currentPlayerId, seatIndex: availableSeat });
            break;
            
          case 'shoot':
            if (!currentPlayerId || !currentTable) return;
            const shootingPlayer = currentTable.players.get(currentPlayerId);
            if (!shootingPlayer) return;
            
            const [currentUser] = await db.select().from(users).where(eq(users.id, currentPlayerId)).limit(1);
            if (!currentUser || currentUser.points < shootingPlayer.betAmount) {
              sendTo(ws, { type: 'error', message: 'Insufficient points' });
              return;
            }
            
            const cannonPositions = [
              { x: 100, y: GAME_HEIGHT - 50 },
              { x: GAME_WIDTH - 100, y: GAME_HEIGHT - 50 },
              { x: 100, y: 50 },
              { x: GAME_WIDTH - 100, y: 50 }
            ];
            const pos = cannonPositions[shootingPlayer.seatIndex];
            const angle = message.angle;
            const speed = 10;
            
            const bullet: Bullet & { createdAt: number } = {
              id: uuidv4(),
              playerId: currentPlayerId,
              x: pos.x,
              y: pos.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
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
              betPlayer.betAmount = Math.max(1, Math.min(100, message.amount));
              sendTo(ws, { type: 'betSet', amount: betPlayer.betAmount });
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
        console.error('WebSocket message error:', error);
      }
    });
    
    ws.on('close', () => {
      if (currentPlayerId) {
        playerConnections.delete(currentPlayerId);
        if (currentTable) {
          currentTable.players.delete(currentPlayerId);
          broadcast(currentTable, { type: 'playerLeft', playerId: currentPlayerId });
        }
      }
    });
  });
}
