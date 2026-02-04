import express from 'express';
import session from 'express-session';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import connectPgSimple from 'connect-pg-simple';
import { setupRoutes } from './routes';
import { setupWebSocket } from './websocket';
import { initializeDatabase } from './init';

const app = express();
const httpServer = createServer(app);

const PgSession = connectPgSimple(session);

app.use(express.json());
app.use(session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'casino-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
setupWebSocket(wss);
setupRoutes(app);

const PORT = process.env.PORT || 3001;

async function start() {
  await initializeDatabase();
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch(console.error);
