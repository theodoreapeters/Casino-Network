# Fish Game Client Implementation Guide

Complete reference for building a Cocos Creator 3 client that communicates with the fish game server. This document covers every WebSocket message, every field, all server-side rules, and all client-side behaviors the game client must implement.

---

## Table of Contents

1. [Connection & Authentication](#1-connection--authentication)
2. [Lobby & Game Config](#2-lobby--game-config)
3. [Joining a Table](#3-joining-a-table)
4. [Game Loop](#4-game-loop)
5. [Shooting](#5-shooting)
6. [Bet Management](#6-bet-management)
7. [Fish & Bullet Physics](#7-fish--bullet-physics)
8. [Scoring & Points](#8-scoring--points)
9. [Leaving & Disconnection](#9-leaving--disconnection)
10. [Error Handling](#10-error-handling)
11. [Complete Message Reference](#11-complete-message-reference)
12. [Client Implementation Rules](#12-client-implementation-rules)
13. [Suggested Scene Flow](#13-suggested-scene-flow)

---

## 1. Connection & Authentication

### Server URL

Connect via WebSocket to the server's `/ws` path.

- Development: `wss://<replit-domain>/ws`
- Production: `wss://your-production-domain/ws`

### Connection Flow

1. Client opens a WebSocket connection to the server
2. Connection is established but player is NOT authenticated yet
3. Client sends a `login` message with credentials
4. Server responds with `loginSuccess` or `loginFailed`

### Client → Server: `login`

Send this when the player clicks the login button. The WebSocket connection should be opened at this point (or immediately before).

```json
{
  "type": "login",
  "username": "player1",
  "password": "password123"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | yes | Must be `"login"` |
| `username` | string | yes | Player's username |
| `password` | string | yes | Player's password (plain text, server hashes) |

### Server → Client: `loginSuccess`

```json
{
  "type": "loginSuccess",
  "player": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "player1",
    "role": "player",
    "points": 10000
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `player.id` | string (UUID) | Unique player identifier |
| `player.username` | string | Display name |
| `player.role` | string | Always `"player"` for game clients |
| `player.points` | number | Current point balance |

### Server → Client: `loginFailed`

```json
{
  "type": "loginFailed",
  "reason": "Invalid credentials"
}
```

| Possible `reason` values | Meaning |
|--------------------------|---------|
| `"Username and password required"` | Missing username or password field |
| `"Invalid credentials"` | Wrong username or password |
| `"Account is disabled"` | Account has been deactivated by admin |
| `"Only players can login via game client"` | Tried to login as distributor or manager |

### Re-Authentication: `auth` (legacy, for reconnection)

If the player has already logged in and the WebSocket reconnects, you can use the `auth` message to re-verify the session. However, this only works if the server still has the connection context. In practice, a full `login` is more reliable after disconnection.

#### Client → Server: `auth`

```json
{
  "type": "auth"
}
```

No fields needed — the server uses the existing connection context.

#### Server → Client: `authSuccess`

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

#### Server → Client: `authFailed`

```json
{
  "type": "authFailed",
  "reason": "Not logged in"
}
```

In most cases, prefer sending a fresh `login` message after reconnection instead of `auth`.

### Client Rules for Authentication

- Only attempt to send any other message AFTER receiving `loginSuccess`
- Store `player.id`, `player.username`, and `player.points` locally for UI display
- On `loginFailed`, show the `reason` string to the user and allow retry
- If the WebSocket connection drops at any point, the player must reconnect and re-login (there is no session persistence)

---

## 2. Lobby & Game Config

After successful login, request the game configuration to populate the lobby.

### Client → Server: `getGameConfig`

```json
{
  "type": "getGameConfig"
}
```

No additional fields. Must be sent after `loginSuccess`.

### Server → Client: `gameConfig`

```json
{
  "type": "gameConfig",
  "player": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "player1",
    "points": 10000
  },
  "gameWorld": {
    "width": 1200,
    "height": 800,
    "origin": "center",
    "xRange": [-600, 600],
    "yRange": [-400, 400],
    "cannonPositions": [
      { "x": -500, "y": -350 },
      { "x": 500, "y": -350 },
      { "x": -500, "y": 350 },
      { "x": 500, "y": 350 }
    ],
    "bulletSpeed": 10
  },
  "settings": {
    "minBet": 1,
    "maxBet": 100
  },
  "games": [
    {
      "id": "game-uuid-here",
      "name": "Ocean Hunter",
      "type": "fish",
      "isActive": true,
      "minBet": 1,
      "maxBet": 100,
      "description": "Multiplayer fish shooting game"
    }
  ],
  "fishTypes": [
    { "name": "smallFish", "multiplier": 2, "displayName": "Small Fish", "description": "Common fish, easy to catch" },
    { "name": "mediumFish", "multiplier": 5, "displayName": "Medium Fish", "description": "Moderate reward" },
    { "name": "largeFish", "multiplier": 10, "displayName": "Large Fish", "description": "Good catch!" },
    { "name": "shark", "multiplier": 25, "displayName": "Shark", "description": "Rare and valuable" },
    { "name": "whale", "multiplier": 50, "displayName": "Whale", "description": "The big prize!" }
  ],
  "slotThemes": [...]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `player` | object | Fresh player data (id, username, points) |
| `gameWorld` | object | Game world dimensions and coordinate system (see `gameWorld` object table above) |
| `settings.minBet` | number | Minimum allowed bet amount (default 1) |
| `settings.maxBet` | number | Maximum allowed bet from distributor settings (default 1000). Note: for fish games, the server independently clamps bets to a max of 100 via `setBet` validation, regardless of this value. Use `min(maxBet, 100)` for your fish game bet UI. |
| `games` | array | List of active games, filter by `type: "fish"` for fish games |
| `fishTypes` | array | All fish types with display info and multipliers |
| `slotThemes` | array | Slot game themes (ignore for fish game client) |

### Client Rules for Lobby

- Filter `games` array to only show entries where `type === "fish"` and `isActive === true`
- Use the `game.id` (UUID) from this response when sending `joinFishGame`
- Display `fishTypes` info to the player (multiplier values, descriptions)
- Use `settings.minBet` and `settings.maxBet` to set the bet slider/selector range
- Display `player.points` as the current balance

---

## 3. Joining a Table

### Client → Server: `joinFishGame`

```json
{
  "type": "joinFishGame",
  "gameId": "game-uuid-from-gameConfig"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | yes | Must be `"joinFishGame"` |
| `gameId` | string (UUID) | yes | The `id` of a fish game from the `gameConfig` response |

### Server → Client: `joinedTable`

Sent only to the player who just joined.

```json
{
  "type": "joinedTable",
  "tableId": "table-uuid",
  "seatIndex": 0,
  "gameWorld": {
    "width": 1200,
    "height": 800,
    "origin": "center",
    "xRange": [-600, 600],
    "yRange": [-400, 400],
    "cannonPositions": [
      { "x": -500, "y": -350 },
      { "x": 500, "y": -350 },
      { "x": -500, "y": 350 },
      { "x": 500, "y": 350 }
    ],
    "bulletSpeed": 10
  },
  "fish": [
    {
      "id": "fish-uuid",
      "type": "smallFish",
      "x": -249.5,
      "y": 100.2,
      "vx": 2.1,
      "vy": -0.5,
      "multiplier": 2,
      "weight": 0.5,
      "createdAt": 1706900000000
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `tableId` | string (UUID) | The table you were placed on |
| `seatIndex` | number (0-3) | Your assigned seat position |
| `gameWorld` | object | Game world dimensions and coordinate info (see below) |
| `fish` | array | All fish currently alive on the table |

#### `gameWorld` object

| Field | Type | Description |
|-------|------|-------------|
| `width` | number | Game world width in pixels (1200) |
| `height` | number | Game world height in pixels (800) |
| `origin` | string | Always `"center"` — (0,0) is center of screen |
| `xRange` | [number, number] | Min/max X coordinates [-600, 600] |
| `yRange` | [number, number] | Min/max Y coordinates [-400, 400] |
| `cannonPositions` | array | Array of {x, y} for each seat index (0-3) |
| `bulletSpeed` | number | Bullet speed in pixels per tick (10) |

### Server → All Players: `playerJoined`

Broadcast to everyone on the table (including the joining player).

```json
{
  "type": "playerJoined",
  "playerId": "player-uuid",
  "seatIndex": 1
}
```

### Server Rules for Table Assignment

- Maximum 4 players per table (seats 0, 1, 2, 3)
- Server first tries to find an existing table for the same `gameId` with fewer than 4 players
- If no open table exists, a new table is created with 10 initial fish
- Seat index is assigned automatically to the first available seat
- If the `gameId` is invalid, not a fish game, or inactive, the server sends an `error` message instead

### Client Rules for Joining

- Store `tableId` and `seatIndex` locally
- Render all fish from the `fish` array immediately at their current positions
- Each fish has velocity (`vx`, `vy`) — start animating them immediately
- Position your cannon based on `seatIndex` (see Section 7 for positions)
- Listen for `playerJoined` messages to show other players' cannons
- Default bet amount starts at 1

---

## 4. Game Loop

Once joined, the server sends authoritative game state at 20Hz (every 50ms).

### Server → All Players: `gameState`

This is the primary synchronization message. Sent every 50ms to all players on the table.

```json
{
  "type": "gameState",
  "seq": 42,
  "serverTime": 1706900001234,
  "fish": [
    {
      "id": "fish-uuid",
      "type": "smallFish",
      "x": -199.7,
      "y": 110.1,
      "vx": 2.1,
      "vy": -0.5,
      "multiplier": 2,
      "weight": 0.5,
      "createdAt": 1706900000000
    }
  ],
  "bullets": [
    {
      "id": "bullet-uuid",
      "playerId": "player-uuid",
      "x": -450.0,
      "y": -200.0,
      "vx": 5.0,
      "vy": -8.66,
      "betAmount": 5
    }
  ],
  "players": [
    {
      "id": "player-uuid",
      "seatIndex": 0,
      "cannonAngle": 1.2,
      "betAmount": 5
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `seq` | number | Monotonically increasing sequence number per table |
| `serverTime` | number | Server timestamp in milliseconds (Unix epoch) |
| `fish` | array | All live fish with current positions and velocities |
| `bullets` | array | All active bullets with current positions and velocities |
| `players` | array | All players with cannon state |

### Server → All Players: `fishSpawn`

Sent when a new fish is added to maintain minimum fish count.

```json
{
  "type": "fishSpawn",
  "fish": {
    "id": "new-fish-uuid",
    "type": "mediumFish",
    "x": -650,
    "y": 0,
    "vx": 2.0,
    "vy": 0.3,
    "multiplier": 5,
    "weight": 0.3,
    "createdAt": 1706900002000
  }
}
```

### Client Rules for Game Loop

- **The server is authoritative.** The `gameState` message represents ground truth. The client must reconcile its local state with the server state.
- Use `seq` to discard out-of-order messages. If a received `seq` is lower than the last processed `seq`, drop the message.
- Between `gameState` ticks, the client should interpolate fish and bullet positions locally using their velocities for smooth rendering.
- On each `gameState`, snap entities to their server-authoritative positions (or blend smoothly toward them).
- When a `fishSpawn` message arrives, add the fish to your local fish list and start rendering it.
- The server maintains a minimum of 15 fish on the table at all times. When fish are killed or swim off-screen, new ones spawn.

---

## 5. Shooting

### Client → Server: `shoot`

```json
{
  "type": "shoot",
  "angle": 1.5708
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | yes | Must be `"shoot"` |
| `angle` | number | yes | Cannon angle in radians |

### Server → All Players: `bulletFired`

Broadcast to everyone on the table when any player shoots.

```json
{
  "type": "bulletFired",
  "bullet": {
    "id": "bullet-uuid",
    "playerId": "player-uuid",
    "x": -500,
    "y": -350,
    "vx": 0.0,
    "vy": -10.0,
    "betAmount": 5
  },
  "playerId": "player-uuid"
}
```

### Server → All Players: `fishKilled`

Broadcast when a bullet successfully kills a fish.

```json
{
  "type": "fishKilled",
  "fishId": "killed-fish-uuid",
  "playerId": "player-uuid-who-killed-it",
  "winAmount": 50
}
```

### Server → All Players: `bulletHit`

Broadcast when a bullet hits a fish but does NOT kill it (the fish survives).

```json
{
  "type": "bulletHit",
  "bulletId": "bullet-uuid",
  "fishId": "fish-uuid",
  "playerId": "player-uuid"
}
```

### Server Rules for Shooting

- The bullet spawns at the cannon position determined by the player's `seatIndex`
- Bullet speed is fixed at 10 units per tick
- Bullet velocity is calculated as: `vx = cos(angle) * 10`, `vy = sin(angle) * 10`
- Before creating the bullet, the server validates three things in order:
  1. The game is still active (`validateFishGame`)
  2. The player account is valid and active (`validatePlayer`)
  3. The player has enough points to cover **all active (in-flight) bullets plus this new shot**
- The points check uses **reserved points**: `requiredPoints = (sum of all player's active bullet bet amounts) + currentBetAmount`. This prevents a player from firing more bullets than their balance can cover, even if no bullets have collided yet.
- If any validation fails, the server sends an `error` message and the bullet is NOT created
- **Points are NOT deducted when the bullet is fired.** Points are deducted later when the bullet collides with a fish (hit or kill). If the bullet expires without hitting anything, no points are deducted. The reservation is purely an in-memory check — no database writes occur until collision.
- Bullets expire after 10 seconds if they don't hit anything
- Collision detection happens server-side — the client should NOT determine hits

### Cannon Positions by Seat Index

```
Seat 0: { x: -500, y: -350 }  — bottom-left
Seat 1: { x:  500, y: -350 }  — bottom-right
Seat 2: { x: -500, y:  350 }  — top-left
Seat 3: { x:  500, y:  350 }  — top-right
```

Note: Origin is center-screen (0,0). X ranges from -600 to 600, Y from -400 to 400. Seats 0 and 1 are at the bottom (negative Y), seats 2 and 3 at the top (positive Y).

### Client Rules for Shooting

- When the player taps/clicks, calculate the angle from their cannon position to the tap point
- Send the `shoot` message with this angle in radians
- Do NOT spawn the bullet locally until you receive the `bulletFired` message from the server (or optionally do predictive spawning and reconcile with the server response)
- On `fishKilled`: remove the fish from the scene, play a death animation, show the `winAmount` as floating text
- On `bulletHit`: remove the bullet, play a hit-but-no-kill effect on the fish (e.g., flash, small shake)
- On `bulletFired`: render the bullet for all players (use `playerId` to identify whose bullet it is for coloring/effects)
- Angle convention: 0 radians = pointing right, PI/2 = pointing up (standard math convention). Adjust for your coordinate system.

---

## 6. Bet Management

### Client → Server: `setBet`

```json
{
  "type": "setBet",
  "amount": 10
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | yes | Must be `"setBet"` |
| `amount` | number | yes | Desired bet amount |

### Server → Client: `betSet`

Sent only to the requesting player.

```json
{
  "type": "betSet",
  "amount": 10
}
```

### Server Rules for Bets

- The server clamps the bet to the allowed range: `max(minBet, min(maxBet, requestedAmount))`
- `minBet` defaults to 1 (from distributor settings)
- `maxBet` is the lesser of the distributor's configured max bet or 100 — fish game bets are hard-capped at 100 regardless of distributor settings
- The `betSet` response contains the actual clamped value the server accepted — always use this value, not the value you sent
- Each bullet that hits a fish costs the player's current bet amount (see Section 8 for timing details)
- The server validates the player is active before accepting a bet change

### Client Rules for Bets

- Provide UI for the player to adjust their bet (buttons, slider, etc.)
- Constrain the UI to the `minBet`/`maxBet` range from `gameConfig.settings`
- After sending `setBet`, update the displayed bet only after receiving `betSet` confirmation
- The bet amount is per shot, not per round — every tap costs this amount
- Default bet when joining a table is 1

---

## 7. Fish & Bullet Physics

The server runs all physics. The client should mirror these rules for smooth local prediction between `gameState` ticks.

### Game World Dimensions

```
Width:  1200 pixels
Height: 800 pixels
Origin: center of screen (0, 0)
X range: -600 to 600
Y range: -400 to 400
```

### Fish Types

| Type | Multiplier | Spawn Weight | Base Speed | Hit Radius |
|------|-----------|-------------|------------|------------|
| `smallFish` | 2x | 50% | 3.0 | 30px |
| `mediumFish` | 5x | 30% | 2.0 | 30px |
| `largeFish` | 10x | 15% | 1.5 | 30px |
| `shark` | 25x | 4% | 1.0 | 50px |
| `whale` | 50x | 1% | 0.5 | 80px |

- **Spawn Weight**: Probability of this type being chosen when a new fish spawns
- **Base Speed**: Multiplied by a random factor between 0.5 and 1.5 for variety
- **Hit Radius**: Distance in pixels from fish center for collision detection
- **Multiplier**: Win payout = `betAmount * multiplier`

### Fish Spawning Rules

- Fish spawn from one of the four edges of the screen, starting just outside the visible area (at -50px offset)
- They swim in a mostly straight line with slight random vertical/horizontal drift
- Fish are removed when they travel more than 100px beyond any screen edge
- The server maintains a minimum of 15 fish at all times — new fish spawn to replenish
- Spawn probability is weighted: small fish appear most often, whales are extremely rare

### Fish Movement (per tick, every 50ms)

```
fish.x += fish.vx
fish.y += fish.vy
```

Fish move in a straight line. No turning, no acceleration. They simply drift across the screen.

### Bullet Movement (per tick, every 50ms)

```
bullet.x += bullet.vx
bullet.y += bullet.vy

// Ricochet off walls (with position clamping to prevent edge-sticking)
if (bullet.x <= -600) { bullet.x = -600; bullet.vx *= -1; }
else if (bullet.x >= 600) { bullet.x = 600; bullet.vx *= -1; }
if (bullet.y <= -400) { bullet.y = -400; bullet.vy *= -1; }
else if (bullet.y >= 400) { bullet.y = 400; bullet.vy *= -1; }
```

Bullets bounce off all four edges of the screen (at ±600 x, ±400 y). The position is clamped to the boundary on bounce to prevent the bullet overshooting and getting stuck. Bullets keep bouncing until they hit a fish or expire after 10 seconds.

### Collision Detection (server-side only)

```
distance = sqrt((bullet.x - fish.x)^2 + (bullet.y - fish.y)^2)
hit = distance < hitRadius
```

- The client should NOT determine kill outcomes
- The client may use this formula for local visual effects (e.g., showing a near-miss spark) but must wait for `fishKilled` or `bulletHit` from the server to confirm the actual result

### Client Rendering Rules

- Render fish with appropriate sprites based on `fish.type`
- Scale fish sprites to visually match their hit radius (larger sprites for shark/whale)
- Between server ticks, predict fish/bullet positions locally: `position += velocity * deltaTime`
- When `gameState` arrives, smoothly correct any prediction drift (lerp toward server position over 2-3 frames)
- Render other players' bullets in a different color based on their `seatIndex` or `playerId`

---

## 8. Scoring & Points

### Server → Client: `pointsUpdate`

Sent to the individual player after any action that changes their balance (shooting, killing a fish, errors).

```json
{
  "type": "pointsUpdate",
  "points": 9500
}
```

| Field | Type | Description |
|-------|------|-------------|
| `points` | number | The player's new total point balance |

### Win Probability Rules (server-side, for reference)

- The server has a configurable base win rate (default 40%) set by the distributor
- Actual win probability for each hit: `baseWinRate * fishWeight`
  - Small fish (weight 0.5): 20% chance to kill
  - Medium fish (weight 0.3): 12% chance to kill
  - Large fish (weight 0.15): 6% chance to kill
  - Shark (weight 0.04): 1.6% chance to kill
  - Whale (weight 0.01): 0.4% chance to kill
- **Cost timing**: Points are deducted when a bullet collides with a fish (the bet cost is subtracted). If a bullet bounces around and expires without hitting any fish, no points are deducted. However, the server reserves points for all active in-flight bullets when checking whether a new shot is allowed (see Section 5).
- **Win payout**: On a successful kill, the player receives `betAmount * fishMultiplier` points (net gain = `betAmount * fishMultiplier - betAmount`)
- **Miss payout**: On a hit that doesn't kill, the player loses `betAmount` points (net loss = `betAmount`)
- The server sends a `pointsUpdate` message after every collision to give the client the player's new balance

### Client Rules for Points

- Always display the latest `points` value from `pointsUpdate` messages
- When `fishKilled` is received with your `playerId`, show a win animation with `winAmount`
- When `fishKilled` is received with another player's `playerId`, show their kill visually but don't update your balance
- If points reach 0 or you receive an `"Insufficient points"` error, disable the shoot button and prompt the player to recharge

---

## 9. Leaving & Disconnection

### Client → Server: `leaveTable`

```json
{
  "type": "leaveTable"
}
```

No additional fields needed. The server uses the connection context to identify the player and table.

### Server → All Players: `playerLeft`

```json
{
  "type": "playerLeft",
  "playerId": "player-uuid"
}
```

### Client → Server: `updateCannon`

Send this periodically to sync cannon angle with the server for other players to see.

```json
{
  "type": "updateCannon",
  "angle": 1.2
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | yes | Must be `"updateCannon"` |
| `angle` | number | yes | Current cannon angle in radians |

### Server & Client Rules for Leaving

- On `leaveTable`: server removes the player from the table and broadcasts `playerLeft`
- On WebSocket disconnect (connection drop): server automatically removes the player and broadcasts `playerLeft`
- After leaving, the player's WebSocket remains connected and authenticated — they can join another table or the same game again
- After disconnect, the player must reconnect and re-login from scratch

### Client Rules for Cannon Updates

- Send `updateCannon` when the player moves their cannon (finger drag, mouse move)
- Throttle to avoid flooding — send at most every 100ms (10Hz), not on every frame
- Other players' cannon angles come through `gameState.players[].cannonAngle`
- Render other players' cannons pointing at the angle from `gameState`

---

## 10. Error Handling

### Server → Client: `error`

```json
{
  "type": "error",
  "message": "Insufficient points"
}
```

### Possible Error Messages

| Error Message | When It Occurs | Client Action |
|--------------|----------------|---------------|
| `"Not logged in"` | Sent message before login | Redirect to login screen |
| `"Player not found"` | Player deleted or DB issue | Redirect to login screen |
| `"Insufficient points"` | Tried to shoot with 0 points | Disable shoot, show recharge prompt |
| `"Game not found"` | Invalid gameId | Return to lobby |
| `"Not a fish game"` | Tried to join a non-fish game | Return to lobby |
| `"Game is not active"` | Game was disabled by admin | Return to lobby, refresh game list |
| `"Game is no longer available"` | Game disabled mid-play | Show message, return to lobby |
| `"Only players can play games"` | Non-player account | Should not happen if login is correct |
| `"Account is disabled"` | Account deactivated mid-session | Force logout, show message |
| `"Invalid player"` | Account issue during play | Return to lobby |
| `"Failed to load game config"` | Server error loading config | Retry `getGameConfig` after delay |

### Client Rules for Errors

- Always listen for `error` messages on the WebSocket
- Display errors to the player in a non-intrusive way (toast notification or status bar)
- For critical errors (not logged in, account disabled, game not found), navigate the player away from the game scene
- Never silently ignore errors

---

## 11. Complete Message Reference

### Client → Server Messages

| Message Type | When to Send | Required Fields |
|-------------|-------------|-----------------|
| `login` | Login screen, on button click | `username`, `password` |
| `auth` | After reconnection (legacy, optional) | (none) |
| `getGameConfig` | After `loginSuccess` | (none) |
| `joinFishGame` | Lobby, when player selects a game | `gameId` |
| `shoot` | In-game, on tap/click | `angle` (radians) |
| `setBet` | In-game, when player changes bet | `amount` (number) |
| `updateCannon` | In-game, on cannon move (throttled) | `angle` (radians) |
| `leaveTable` | In-game, when player exits | (none) |

### Server → Client Messages

| Message Type | When Received | Key Fields |
|-------------|--------------|------------|
| `loginSuccess` | After valid `login` | `player` (id, username, role, points) |
| `loginFailed` | After invalid `login` | `reason` |
| `authSuccess` | After valid `auth` | `player` (id, username, points) |
| `authFailed` | After invalid `auth` | `reason` |
| `gameConfig` | After `getGameConfig` | `player`, `settings`, `games`, `fishTypes` |
| `joinedTable` | After joining a table | `tableId`, `seatIndex`, `fish[]` |
| `gameState` | Every 50ms during play | `seq`, `serverTime`, `fish[]`, `bullets[]`, `players[]` |
| `fishSpawn` | When new fish appears | `fish` (single fish object) |
| `bulletFired` | When any player shoots | `bullet`, `playerId` |
| `fishKilled` | When a fish is killed | `fishId`, `playerId`, `winAmount` |
| `bulletHit` | When bullet hits but doesn't kill | `bulletId`, `fishId`, `playerId` |
| `pointsUpdate` | After balance change (collision) | `points` |
| `betSet` | After bet change confirmed | `amount` |
| `playerJoined` | When another player joins | `playerId`, `seatIndex` |
| `playerLeft` | When a player leaves | `playerId` |
| `error` | On any server error | `message` |

---

## 12. Client Implementation Rules

### Must-Have Behaviors

1. **Server is authoritative.** Never determine kill outcomes client-side. Always wait for `fishKilled` or `bulletHit`.
2. **Handle all messages.** Register handlers for every server → client message type listed above.
3. **Sequence checking.** Track the last `seq` from `gameState`. Drop messages with a lower `seq`.
4. **Reconcile state.** On each `gameState`, update local fish/bullet positions to match server values.
5. **Interpolate between ticks.** Predict positions between 50ms ticks for smooth 60fps rendering.
6. **Throttle outgoing messages.** `updateCannon`: max 10Hz. `shoot`: enforce a minimum cooldown (e.g., 200ms) to prevent spam.
7. **Handle disconnection.** If the WebSocket closes unexpectedly, show a reconnection UI and re-login on reconnect.
8. **Respect bet limits.** Clamp the bet UI to `minBet`/`maxBet` from `gameConfig.settings`.
9. **Show all players.** Render cannons for all 4 possible seats. Show/hide based on `playerJoined`/`playerLeft` and `gameState.players`.
10. **Clean up dead entities.** Remove fish on `fishKilled`. Remove bullets on `bulletHit` or when they disappear from `gameState`.

### Recommended Behaviors

1. **Predictive bullet spawning.** Optionally spawn the bullet locally on shoot for instant feedback, then reconcile with `bulletFired`.
2. **Sound effects.** Play sounds on: shoot, fish kill, bullet ricochet (wall hit), player join/leave, error.
3. **Win celebration.** On `fishKilled` with your `playerId`, show coin/particle effects proportional to `winAmount`.
4. **Fish animations.** Animate fish sprites (swimming motion) based on their `type`. Larger fish should animate more slowly.
5. **Kill feed.** Show a small log of recent kills with player name and win amount.
6. **Points animation.** Animate the points counter smoothly instead of jumping to new values.
7. **Cannon rotation.** Smoothly rotate the cannon toward the touch/aim point. Send `updateCannon` only after the angle settles.
8. **Auto-fire mode.** Optionally support holding down to auto-fire at a set rate (e.g., 5 shots/second max).

### Things NOT to Implement

1. **Fish AI or pathfinding.** Fish move in straight lines only. The server handles all movement.
2. **Client-side hit detection for scoring.** Visual effects are fine, but never award points client-side.
3. **Client-side point deduction on shoot.** Points are NOT deducted when a bullet is fired. They are deducted on collision. Wait for `pointsUpdate` from the server to update the balance.
4. **Fish spawn logic.** Never create fish locally. Only add fish from `fishSpawn` or `gameState`.
5. **Table matchmaking UI.** The server handles table assignment automatically. Just send `joinFishGame` with the `gameId`.

---

## 13. Suggested Scene Flow

```
┌─────────────┐
│  Splash /   │
│  Loading    │
└──────┬──────┘
       │
       ▼
┌─────────────┐     login          ┌─────────────┐
│   Login     │ ──────────────────►│   Server    │
│   Scene     │                    │             │
│             │ ◄──────────────────│             │
│             │   loginSuccess     │             │
└──────┬──────┘   or loginFailed   └─────────────┘
       │
       │ on loginSuccess
       ▼
┌─────────────┐   getGameConfig    ┌─────────────┐
│   Lobby     │ ──────────────────►│   Server    │
│   Scene     │                    │             │
│             │ ◄──────────────────│             │
│             │    gameConfig      │             │
└──────┬──────┘                    └─────────────┘
       │
       │ player taps a fish game
       ▼
┌─────────────┐   joinFishGame     ┌─────────────┐
│  Fish Game  │ ──────────────────►│   Server    │
│   Scene     │                    │             │
│             │ ◄──────────────────│             │
│             │   joinedTable      │             │
│             │                    │             │
│             │ ◄─── gameState ────│  (20Hz)     │
│             │ ◄─── fishSpawn ────│             │
│             │ ◄─── fishKilled ───│             │
│             │ ◄─── bulletFired ──│             │
│             │ ◄─── bulletHit ────│             │
│             │ ◄─── pointsUpdate─│             │
│             │ ◄─── playerJoined─│             │
│             │ ◄─── playerLeft ──│             │
│             │                    │             │
│             │ ── shoot ─────────►│             │
│             │ ── setBet ────────►│             │
│             │ ── updateCannon ──►│             │
│             │ ── leaveTable ────►│             │
└──────┬──────┘                    └─────────────┘
       │
       │ leaveTable or disconnect
       ▼
┌─────────────┐
│   Lobby     │  (or Login on disconnect)
│   Scene     │
└─────────────┘
```

### WebSocket Lifecycle

```
Login Scene:
  1. Open WebSocket connection
  2. Send "login"
  3. Wait for "loginSuccess" or "loginFailed"

Lobby Scene:
  4. Send "getGameConfig"
  5. Wait for "gameConfig"
  6. Display game list

Fish Game Scene:
  7. Send "joinFishGame"
  8. Wait for "joinedTable"
  9. Start game loop (process gameState at 20Hz)
  10. Player interacts: shoot, setBet, updateCannon
  11. Handle: fishKilled, bulletHit, bulletFired, fishSpawn, pointsUpdate, playerJoined, playerLeft
  12. Send "leaveTable" when exiting

Back to Lobby:
  13. WebSocket stays open
  14. Can join another game immediately

On Disconnect:
  15. Show reconnection UI
  16. Re-open WebSocket
  17. Re-send "login"
  18. Resume from Lobby
```

---

## Appendix: Data Type Reference

### Fish Object

```typescript
interface Fish {
  id: string;          // UUID - unique identifier
  type: string;        // "smallFish" | "mediumFish" | "largeFish" | "shark" | "whale"
  x: number;           // X position in game world (0-1200)
  y: number;           // Y position in game world (0-800)
  vx: number;          // X velocity (pixels per tick)
  vy: number;          // Y velocity (pixels per tick)
  multiplier: number;  // Win multiplier (2, 5, 10, 25, or 50)
  weight: number;      // Spawn/catch weight (0.01 to 0.5)
  createdAt: number;   // Unix timestamp in milliseconds
}
```

### Bullet Object

```typescript
interface Bullet {
  id: string;          // UUID - unique identifier
  playerId: string;    // UUID - who fired this bullet
  x: number;           // X position in game world (0-1200)
  y: number;           // Y position in game world (0-800)
  vx: number;          // X velocity (pixels per tick)
  vy: number;          // Y velocity (pixels per tick)
  betAmount: number;   // Cost of this bullet
}
```

### Player Object (in gameState)

```typescript
interface GameStatePlayer {
  id: string;          // UUID - player identifier
  seatIndex: number;   // 0-3 seat position
  cannonAngle: number; // Current cannon angle in radians
  betAmount: number;   // Current bet amount per shot
}
```

### Game World Constants

```typescript
const GAME_WIDTH = 1200;
const GAME_HEIGHT = 800;
const HALF_W = 600;             // origin is center (0,0)
const HALF_H = 400;             // x: -600..600, y: -400..400
const BULLET_SPEED = 10;        // pixels per tick
const TICK_RATE = 50;           // milliseconds (20Hz)
const MIN_FISH_COUNT = 15;      // server maintains at least this many
const MAX_PLAYERS_PER_TABLE = 4;
const BULLET_LIFETIME = 10000;  // milliseconds before expiry
const CANNON_POSITIONS = [
  { x: -500, y: -350 },  // seat 0: bottom-left
  { x:  500, y: -350 },  // seat 1: bottom-right
  { x: -500, y:  350 },  // seat 2: top-left
  { x:  500, y:  350 },  // seat 3: top-right
];
```
