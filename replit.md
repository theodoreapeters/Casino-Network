# Casino Platform

A multiplayer online casino platform with a hierarchical user management system (Distributors → Managers → Players) and real-time multiplayer games.

## Overview

This platform features:
- **Admin Portal**: Web dashboard for distributors and managers to manage users, adjust win rates, and view reports
- **Game Server**: Real-time WebSocket server for multiplayer game communication
- **Game Client**: HTML5 Canvas-based games including slot machines and fish shooter games

## Architecture

### Tech Stack
- **Backend**: Node.js + Express + WebSocket (ws)
- **Database**: PostgreSQL with Drizzle ORM
- **Frontend**: React + Vite + TailwindCSS
- **Real-time**: WebSocket for multiplayer fish shooter games

### User Hierarchy
1. **Distributors**: Top-level operators who can create managers, set game win rates (RTP), and manage points
2. **Managers**: Mid-level operators who recruit players and manage player points (recharge/redeem)
3. **Players**: End users who play games

### Game Types

#### Slot Machines
- Theme-based slot games (Chinese Fortune, Ocean Treasure)
- Configurable RTP (Return to Player) per distributor
- 5 reels, 3 rows, multiple paylines

#### Fish Shooter Games
- 4-player multiplayer tables
- Real-time WebSocket communication
- Multiple fish types with different multipliers and catch probabilities
- Adjustable shot cost (1-100 points)
- Bullets ricochet off screen edges
- Weighted probability system for win determination

## Project Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── pages/         # Page components
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── GameLobby.tsx
│   │   │   ├── SlotGame.tsx
│   │   │   └── FishGame.tsx
│   │   ├── context/       # React contexts
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── index.html
├── server/                 # Express backend
│   ├── index.ts           # Server entry
│   ├── routes.ts          # API routes
│   ├── websocket.ts       # WebSocket game server
│   ├── casino-engine.ts   # Win/loss calculation engine
│   ├── init.ts            # Database initialization
│   └── db.ts              # Database connection
├── shared/
│   └── schema.ts          # Drizzle database schema
├── package.json
├── vite.config.ts
└── drizzle.config.ts
```

## Default Credentials

- **Distributor**: admin / admin123

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### User Management
- `GET /api/users` - List managed users
- `POST /api/users` - Create user
- `POST /api/users/:id/points` - Recharge/redeem points

### Games
- `GET /api/games` - List available games
- `POST /api/games/spin` - Slot machine spin

### Settings (Distributor only)
- `GET /api/settings` - Get win rate settings
- `PUT /api/settings` - Update win rate settings

### Reports
- `GET /api/reports/overview` - Dashboard statistics

## WebSocket Protocol

### Connection
Connect to `/ws` path

### Messages
- `auth` - Authenticate player
- `joinFishGame` - Join a fish game table
- `shoot` - Fire cannon
- `setBet` - Set shot cost
- `updateCannon` - Update cannon angle
- `leaveTable` - Leave game table

## Casino Engine

The casino engine uses weighted probability for win determination:

### Slot Games
- RTP (Return to Player) configurable by distributor (default 95%)
- Symbol matching determines wins

### Fish Games
- Base win rate configurable by distributor (default 40%)
- Fish weight affects actual win probability
- Higher multiplier fish have lower catch rates

## Cocos Creator 3 Integration

For professional-quality games, you can build games in Cocos Creator 3 and integrate them with this platform.

### Setup
1. Build your game in Cocos Creator 3 for Web (Mobile or Desktop)
2. Upload the build to `public/cocos-games/`
3. Access at `/cocos-games/index.html`

### Integration Points
- **REST API**: `/api/game-config` provides fish types, slot themes, multipliers, and player info
- **WebSocket**: `/ws` for real-time fish game communication
- **Authentication**: Session-based, shares cookies with main site

### Documentation
See `docs/COCOS_INTEGRATION.md` for:
- Full API documentation
- WebSocket message protocol
- TypeScript client code for Cocos (WebSocketClient, HttpClient, NetworkManager)
- Deployment instructions

### CORS Configuration
Set `CORS_ORIGINS` environment variable for allowed origins (comma-separated). Default allows localhost:5000 and localhost:3001.

## Development

```bash
npm run dev    # Start development server
npm run build  # Build for production
```
