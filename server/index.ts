import express from 'express';
import session from 'express-session';
import cors from 'cors';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import connectPgSimple from 'connect-pg-simple';
import { setupRoutes } from './routes';
import { setupWebSocket } from './websocket';
import { initializeDatabase } from './init';

const app = express();
const httpServer = createServer(app);

const PgSession = connectPgSimple(session);

const sessionMiddleware = session({
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
});

const allowedOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:5000', 'http://localhost:3001'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(sessionMiddleware);

const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (request, socket, head) => {
  if (request.url === '/ws') {
    const res = new ServerResponse(request);
    res.assignSocket(socket as any);
    
    sessionMiddleware(request as any, res as any, () => {
      const session = (request as any).session;
      
      if (session && session.userId && session.role === 'player') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          (ws as any).userId = session.userId;
          (ws as any).authenticated = true;
          wss.emit('connection', ws, request);
        });
      } else {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
      }
    });
  } else {
    socket.destroy();
  }
});

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
