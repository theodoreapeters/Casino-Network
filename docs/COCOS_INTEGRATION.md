# Cocos Creator 3 Integration Guide

This guide explains how to integrate your Cocos Creator 3 games with the casino platform backend.

## Overview

The casino platform provides:
- REST API for authentication and game configuration
- WebSocket server for real-time multiplayer fish games
- Static hosting for your Cocos WebGL builds

## Important: Hosting Requirements

**Your Cocos game must be hosted on the same domain as the server** to share session cookies. The recommended approach is to upload your Cocos WebGL build to the `public/cocos-games/` folder on this server.

If you need to host games on a different domain:
1. Set the `CORS_ORIGINS` environment variable with allowed origins (comma-separated)
2. Configure session cookies with `SameSite=None` and `Secure=true` (requires HTTPS)
3. Both the game and server must use HTTPS

## Server-Side Authority

**The server is the authoritative source for all game outcomes.** The fish types, multipliers, and slot themes returned by `/api/game-config` are for display purposes only. All win calculations happen server-side in the casino engine. Your Cocos client should never calculate wins locally—only display results returned by the server.

## Server Endpoints

### Base URL
```
Development: http://localhost:3001
Production: Your deployed domain
```

### Authentication

#### Login
```
POST /api/auth/login
Content-Type: application/json

{
  "username": "player1",
  "password": "password123"
}

Response:
{
  "id": "uuid",
  "username": "player1",
  "role": "player",
  "points": 10000
}
```

#### Get Current User
```
GET /api/auth/me

Response:
{
  "id": "uuid",
  "username": "player1",
  "role": "player",
  "points": 10000
}
```

### Game Configuration

#### Get Game Config (requires authentication)
```
GET /api/game-config

Response:
{
  "player": {
    "id": "uuid",
    "username": "player1",
    "points": 10000
  },
  "settings": {
    "minBet": 1,
    "maxBet": 1000
  },
  "games": [...],
  "fishTypes": [
    { "name": "smallFish", "multiplier": 2, "displayName": "Small Fish" },
    { "name": "mediumFish", "multiplier": 5, "displayName": "Medium Fish" },
    { "name": "largeFish", "multiplier": 10, "displayName": "Large Fish" },
    { "name": "shark", "multiplier": 25, "displayName": "Shark" },
    { "name": "whale", "multiplier": 50, "displayName": "Whale" }
  ],
  "slotThemes": [...],
  "websocket": {
    "path": "/ws",
    "protocol": "json",
    "messageTypes": [...]
  }
}
```

### Slot Machine Spin
```
POST /api/games/spin
Content-Type: application/json

{
  "gameId": "game-uuid",
  "betAmount": 10
}

Response:
{
  "reels": [["🐉", "🏮", "🧧"], ["💰", "🎋", "🔔"], ...],
  "winAmount": 50,
  "winLines": [...],
  "newBalance": 10040
}
```

## WebSocket Protocol

### Connection
Connect to: `ws://your-server:3001/ws`

Authentication is automatic via session cookies. The server validates your session when you connect.

### Message Format
All messages are JSON objects with a `type` field.

### Client → Server Messages

#### Join Fish Game
```json
{
  "type": "joinFishGame",
  "gameId": "fish-game-uuid"
}
```

#### Set Bet Amount
```json
{
  "type": "setBet",
  "amount": 10
}
```

#### Update Cannon Angle
```json
{
  "type": "updateCannon",
  "angle": 45
}
```

#### Shoot
```json
{
  "type": "shoot"
}
```

#### Leave Table
```json
{
  "type": "leaveTable"
}
```

### Server → Client Messages

#### Authentication Success
```json
{
  "type": "authSuccess",
  "player": {
    "id": "uuid",
    "username": "player1",
    "points": 10000
  }
}
```

#### Table State (on join)
```json
{
  "type": "tableState",
  "tableId": "table-uuid",
  "seatIndex": 0,
  "players": [...],
  "fish": [...],
  "bullets": [...]
}
```

#### Game State Update (every tick, 20 Hz / 50ms interval)
```json
{
  "type": "gameState",
  "seq": 12345,
  "serverTime": 1707012345678,
  "fish": [
    {
      "id": "fish-uuid",
      "type": "smallFish",
      "x": 100,
      "y": 200,
      "vx": 2.5,
      "vy": 0.5
    }
  ],
  "bullets": [
    {
      "id": "bullet-uuid",
      "playerId": "player-uuid",
      "x": 150,
      "y": 300,
      "vx": 10,
      "vy": -5
    }
  ],
  "players": [
    {
      "id": "player-uuid",
      "seatIndex": 0,
      "cannonAngle": 45,
      "betAmount": 10
    }
  ]
}
```

#### Fish Caught
```json
{
  "type": "fishCaught",
  "fishId": "fish-uuid",
  "playerId": "player-uuid",
  "multiplier": 5,
  "winAmount": 50,
  "newBalance": 10050
}
```

#### Player Joined
```json
{
  "type": "playerJoined",
  "player": {
    "id": "uuid",
    "seatIndex": 1
  }
}
```

#### Player Left
```json
{
  "type": "playerLeft",
  "playerId": "uuid"
}
```

#### Error
```json
{
  "type": "error",
  "message": "Insufficient points"
}
```

## Protocol Details for Client Implementation

### Tick Rate and Timing
- **Server tick rate**: 20 Hz (50ms interval)
- **gameState frequency**: Sent every tick (20 times per second)
- **Fish/bullet positions**: Absolute coordinates (not relative/delta)

### Sequence Numbers (`seq`)
Every `gameState` message includes a monotonically increasing sequence number per table. Use this to:
- Drop stale packets that arrive out of order
- Simplify reconnection logic

**Client handling:**
```typescript
private lastSeq: number = 0;

handleGameState(msg: any) {
  if (msg.seq <= this.lastSeq) {
    return; // Drop stale packet
  }
  this.lastSeq = msg.seq;
  // Process game state...
}
```

### Server Timestamp (`serverTime`)
Each `gameState` includes `serverTime` (Unix timestamp in milliseconds). Use this for:
- Estimating one-way delay
- Time-based interpolation between snapshots
- Smoothing jitter
- Recovering gracefully after browser stalls

**Important: Server-Client Time Offset**

`serverTime` and `Date.now()` are on different clocks. You must calculate an offset to align them:

```typescript
private serverTimeOffset: number = 0;

handleGameState(msg: GameState) {
  // Calculate offset on each packet (smoothed in production)
  this.serverTimeOffset = Date.now() - msg.serverTime;
  // ... rest of handling
}

getEstimatedServerTime(): number {
  return Date.now() - this.serverTimeOffset;
}
```

**Interpolation strategy:**

Since the server sends absolute positions at 20 Hz and the client renders at ~60 FPS, you'll want to interpolate between the two most recent snapshots. Use `serverTime` with the offset to compute the interpolation factor.

```typescript
private prevState: GameState | null = null;
private currState: GameState | null = null;
private serverTimeOffset: number = 0;

handleGameState(msg: GameState) {
  if (msg.seq <= (this.currState?.seq || 0)) return;
  
  // Update time offset
  this.serverTimeOffset = Date.now() - msg.serverTime;
  
  this.prevState = this.currState;
  this.currState = msg;
}

interpolate(): InterpolatedState {
  if (!this.prevState || !this.currState) return this.currState;
  
  // Use estimated server time, not raw client time
  const estimatedServerNow = Date.now() - this.serverTimeOffset;
  
  const duration = this.currState.serverTime - this.prevState.serverTime;
  const elapsed = estimatedServerNow - this.prevState.serverTime;
  const t = Math.min(1, Math.max(0, elapsed / duration));
  
  // Lerp positions between prevState and currState using t
  return lerpStates(this.prevState, this.currState, t);
}
```

Without this offset, interpolation will jitter under latency, and browser stalls will cause visible snapping.

### Client-Side Prediction
**Not strictly required** for this architecture because:
- Server is authoritative for all outcomes
- Positions are absolute, not delta-compressed

**Note on TCP ordering:** Although WebSocket runs over TCP (which guarantees delivery order), clients should still use `seq` to guard against delayed or stale packets. Network jitter and browser processing delays can cause packets to be handled out of order at the application layer.

However, for smoother visuals you may want to:
- Extrapolate fish positions using their velocity (`vx`, `vy`) between ticks
- Show bullet firing immediately on input, then reconcile with server state

### Architecture Note: Where Logic Belongs

The sample `WebSocketClient.ts` provided below is a **transport layer** only. Packet ordering (`seq` handling), interpolation state buffering, and game state management should be implemented in your **game layer** (e.g., `GameManager.ts` or a dedicated `FishGameState.ts`), not in the WebSocket wrapper.

```
WebSocketClient.ts  → Transport (connect, send, receive raw messages)
GameManager.ts      → Game logic (seq tracking, interpolation, state management)
```

This separation keeps the transport reusable and testable.

## Cocos Creator 3 Setup

### Project Structure
```
assets/
├── scripts/
│   ├── network/
│   │   ├── HttpClient.ts
│   │   └── WebSocketClient.ts
│   ├── managers/
│   │   ├── GameManager.ts
│   │   └── NetworkManager.ts
│   └── games/
│       ├── fish/
│       └── slot/
├── scenes/
├── prefabs/
└── resources/
```

### TypeScript WebSocket Wrapper

Create `assets/scripts/network/WebSocketClient.ts`:

```typescript
import { _decorator, Component } from 'cc';

export interface GameMessage {
    type: string;
    [key: string]: any;
}

export class WebSocketClient {
    private ws: WebSocket | null = null;
    private serverUrl: string;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 2000;
    
    private messageHandlers: Map<string, ((data: any) => void)[]> = new Map();
    private onConnectCallback: (() => void) | null = null;
    private onDisconnectCallback: (() => void) | null = null;

    constructor(serverUrl: string) {
        this.serverUrl = serverUrl;
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.serverUrl);
                
                this.ws.onopen = () => {
                    console.log('WebSocket connected');
                    this.reconnectAttempts = 0;
                    if (this.onConnectCallback) {
                        this.onConnectCallback();
                    }
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    try {
                        const message: GameMessage = JSON.parse(event.data);
                        this.handleMessage(message);
                    } catch (e) {
                        console.error('Failed to parse message:', e);
                    }
                };

                this.ws.onclose = () => {
                    console.log('WebSocket disconnected');
                    if (this.onDisconnectCallback) {
                        this.onDisconnectCallback();
                    }
                    this.attemptReconnect();
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    reject(error);
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    private handleMessage(message: GameMessage) {
        const handlers = this.messageHandlers.get(message.type);
        if (handlers) {
            handlers.forEach(handler => handler(message));
        }
        
        const allHandlers = this.messageHandlers.get('*');
        if (allHandlers) {
            allHandlers.forEach(handler => handler(message));
        }
    }

    on(type: string, handler: (data: any) => void) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, []);
        }
        this.messageHandlers.get(type)!.push(handler);
    }

    off(type: string, handler: (data: any) => void) {
        const handlers = this.messageHandlers.get(type);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    send(message: GameMessage) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.warn('WebSocket not connected, message not sent:', message);
        }
    }

    joinFishGame(gameId: string) {
        this.send({ type: 'joinFishGame', gameId });
    }

    shoot() {
        this.send({ type: 'shoot' });
    }

    setBet(amount: number) {
        this.send({ type: 'setBet', amount });
    }

    updateCannon(angle: number) {
        this.send({ type: 'updateCannon', angle });
    }

    leaveTable() {
        this.send({ type: 'leaveTable' });
    }

    onConnect(callback: () => void) {
        this.onConnectCallback = callback;
    }

    onDisconnect(callback: () => void) {
        this.onDisconnectCallback = callback;
    }

    private attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Reconnecting... attempt ${this.reconnectAttempts}`);
            setTimeout(() => {
                this.connect().catch(console.error);
            }, this.reconnectDelay);
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    get isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }
}
```

### HTTP Client

Create `assets/scripts/network/HttpClient.ts`:

```typescript
export interface LoginResponse {
    id: string;
    username: string;
    role: string;
    points: number;
}

export interface GameConfig {
    player: {
        id: string;
        username: string;
        points: number;
    };
    settings: {
        minBet: number;
        maxBet: number;
    };
    games: any[];
    fishTypes: any[];
    slotThemes: any[];
}

export interface SpinResult {
    reels: string[][];
    winAmount: number;
    winLines: any[];
    newBalance: number;
}

export class HttpClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.error || 'Request failed');
        }

        return response.json();
    }

    async login(username: string, password: string): Promise<LoginResponse> {
        return this.request<LoginResponse>('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
    }

    async logout(): Promise<void> {
        await this.request('/api/auth/logout', { method: 'POST' });
    }

    async getCurrentUser(): Promise<LoginResponse> {
        return this.request<LoginResponse>('/api/auth/me');
    }

    async getGameConfig(): Promise<GameConfig> {
        return this.request<GameConfig>('/api/game-config');
    }

    async spinSlot(gameId: string, betAmount: number): Promise<SpinResult> {
        return this.request<SpinResult>('/api/games/spin', {
            method: 'POST',
            body: JSON.stringify({ gameId, betAmount }),
        });
    }
}
```

### Network Manager

Create `assets/scripts/managers/NetworkManager.ts`:

```typescript
import { _decorator, Component, director } from 'cc';
import { HttpClient, LoginResponse, GameConfig } from '../network/HttpClient';
import { WebSocketClient } from '../network/WebSocketClient';

const { ccclass, property } = _decorator;

@ccclass('NetworkManager')
export class NetworkManager extends Component {
    private static _instance: NetworkManager;
    
    @property
    serverUrl: string = 'http://localhost:3001';
    
    private httpClient: HttpClient;
    private wsClient: WebSocketClient;
    private currentUser: LoginResponse | null = null;
    private gameConfig: GameConfig | null = null;

    static get instance(): NetworkManager {
        return NetworkManager._instance;
    }

    onLoad() {
        if (NetworkManager._instance) {
            this.destroy();
            return;
        }
        NetworkManager._instance = this;
        director.addPersistNode(this.node);
        
        this.httpClient = new HttpClient(this.serverUrl);
        this.wsClient = new WebSocketClient(this.serverUrl.replace('http', 'ws') + '/ws');
    }

    async login(username: string, password: string): Promise<LoginResponse> {
        this.currentUser = await this.httpClient.login(username, password);
        return this.currentUser;
    }

    async loadGameConfig(): Promise<GameConfig> {
        this.gameConfig = await this.httpClient.getGameConfig();
        return this.gameConfig;
    }

    async connectWebSocket(): Promise<void> {
        await this.wsClient.connect();
    }

    get http(): HttpClient {
        return this.httpClient;
    }

    get ws(): WebSocketClient {
        return this.wsClient;
    }

    get user(): LoginResponse | null {
        return this.currentUser;
    }

    get config(): GameConfig | null {
        return this.gameConfig;
    }
}
```

## Deploying Your Cocos Game

1. In Cocos Creator 3, go to **Project → Build**
2. Select **Web Mobile** or **Web Desktop** platform
3. Configure build settings
4. Click **Build**
5. Upload the contents of `build/web-mobile/` (or `web-desktop`) to the `public/cocos-games/` folder on the server
6. Access your game at `/cocos-games/index.html`

## Game Dimensions

The fish game uses these dimensions:
- Width: 1200px
- Height: 800px

Design your Cocos game canvas to match these dimensions for proper fish/bullet positioning.

## Testing

1. Start the server: `npm run dev`
2. Login as a player through the web interface
3. Open your Cocos game in the same browser (shares session cookies)
4. The WebSocket connection will automatically authenticate

## Security Notes

- Session cookies are HTTP-only and managed by the server
- WebSocket connections require valid session authentication
- All game outcomes are determined server-side
- The client should only display results, never calculate wins
