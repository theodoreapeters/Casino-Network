import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useParams } from 'wouter';
import { useAuth } from '../context/AuthContext';

interface Fish {
  id: string;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  multiplier: number;
}

interface Bullet {
  id: string;
  playerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Player {
  id: string;
  seatIndex: number;
  cannonAngle: number;
  betAmount: number;
}

const fishEmojis: Record<string, string> = {
  smallFish: '🐟',
  mediumFish: '🐠',
  largeFish: '🐡',
  shark: '🦈',
  whale: '🐋'
};

const fishSizes: Record<string, number> = {
  smallFish: 30,
  mediumFish: 45,
  largeFish: 60,
  shark: 80,
  whale: 120
};

const GAME_WIDTH = 1200;
const GAME_HEIGHT = 800;

export default function FishGame() {
  const { user, setUser } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [seatIndex, setSeatIndex] = useState<number | null>(null);
  const [bet, setBet] = useState(1);
  const [points, setPoints] = useState(user?.points || 0);
  const [lastWin, setLastWin] = useState<{ amount: number; time: number } | null>(null);
  
  const fishRef = useRef<Map<string, Fish>>(new Map());
  const bulletsRef = useRef<Map<string, Bullet>>(new Map());
  const playersRef = useRef<Map<string, Player>>(new Map());
  const mouseAngleRef = useRef(0);
  const animationRef = useRef<number>(0);

  const cannonPositions = [
    { x: 100, y: GAME_HEIGHT - 50 },
    { x: GAME_WIDTH - 100, y: GAME_HEIGHT - 50 },
    { x: 100, y: 50 },
    { x: GAME_WIDTH - 100, y: 50 }
  ];

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    setPoints(user.points);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', playerId: user.id }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'authSuccess':
          setConnected(true);
          ws.send(JSON.stringify({ type: 'joinFishGame', gameId: params.id }));
          break;
          
        case 'joinedTable':
          setSeatIndex(message.seatIndex);
          fishRef.current.clear();
          message.fish.forEach((f: Fish) => fishRef.current.set(f.id, f));
          break;
          
        case 'gameState':
          fishRef.current.clear();
          message.fish.forEach((f: Fish) => fishRef.current.set(f.id, f));
          bulletsRef.current.clear();
          message.bullets.forEach((b: Bullet) => bulletsRef.current.set(b.id, b));
          playersRef.current.clear();
          message.players.forEach((p: Player) => playersRef.current.set(p.id, p));
          break;
          
        case 'fishSpawn':
          fishRef.current.set(message.fish.id, message.fish);
          break;
          
        case 'fishKilled':
          fishRef.current.delete(message.fishId);
          if (message.playerId === user.id) {
            setLastWin({ amount: message.winAmount, time: Date.now() });
          }
          break;
          
        case 'bulletFired':
          bulletsRef.current.set(message.bullet.id, message.bullet);
          break;
          
        case 'pointsUpdate':
          setPoints(message.points);
          setUser({ ...user, points: message.points });
          break;
          
        case 'betSet':
          setBet(message.amount);
          break;
      }
    };

    ws.onclose = () => setConnected(false);

    return () => {
      ws.close();
    };
  }, [user, params.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      
      const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
      gradient.addColorStop(0, '#0077be');
      gradient.addColorStop(1, '#001f3f');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      fishRef.current.forEach(fish => {
        const size = fishSizes[fish.type] || 30;
        ctx.save();
        ctx.translate(fish.x, fish.y);
        if (fish.vx < 0) ctx.scale(-1, 1);
        ctx.font = `${size}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(fishEmojis[fish.type] || '🐟', 0, 0);
        
        ctx.font = '12px Arial';
        ctx.fillStyle = '#FFD700';
        ctx.fillText(`x${fish.multiplier}`, fish.vx < 0 ? -size/2 : size/2, -size/2);
        ctx.restore();
      });

      bulletsRef.current.forEach(bullet => {
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#FFD700';
        ctx.fill();
        ctx.strokeStyle = '#FFA500';
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      cannonPositions.forEach((pos, index) => {
        const player = Array.from(playersRef.current.values()).find(p => p.seatIndex === index);
        const isMe = seatIndex === index;
        
        ctx.save();
        ctx.translate(pos.x, pos.y);
        
        const angle = isMe ? mouseAngleRef.current : (player?.cannonAngle || 0);
        ctx.rotate(angle);
        
        ctx.fillStyle = isMe ? '#FFD700' : (player ? '#4CAF50' : '#666');
        ctx.beginPath();
        ctx.moveTo(-15, 10);
        ctx.lineTo(-15, -10);
        ctx.lineTo(40, -5);
        ctx.lineTo(40, 5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.restore();
        
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 25, 0, Math.PI * 2);
        ctx.fillStyle = isMe ? '#FFD700' : (player ? '#4CAF50' : '#666');
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        if (isMe) {
          ctx.font = 'bold 14px Arial';
          ctx.fillStyle = '#000';
          ctx.textAlign = 'center';
          ctx.fillText(`${bet}`, pos.x, pos.y + 45);
        }
      });

      if (lastWin && Date.now() - lastWin.time < 2000) {
        ctx.font = 'bold 48px Arial';
        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'center';
        ctx.fillText(`WIN: ${lastWin.amount}!`, GAME_WIDTH / 2, GAME_HEIGHT / 2);
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [seatIndex, bet, lastWin]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (seatIndex === null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    
    const pos = cannonPositions[seatIndex];
    const angle = Math.atan2(mouseY - pos.y, mouseX - pos.x);
    mouseAngleRef.current = angle;
    
    wsRef.current?.send(JSON.stringify({ type: 'updateCannon', angle }));
  }, [seatIndex]);

  const handleClick = useCallback(() => {
    if (!connected || seatIndex === null) return;
    wsRef.current?.send(JSON.stringify({ type: 'shoot', angle: mouseAngleRef.current }));
  }, [connected, seatIndex]);

  const adjustBet = (delta: number) => {
    const newBet = Math.max(1, Math.min(100, bet + delta));
    setBet(newBet);
    wsRef.current?.send(JSON.stringify({ type: 'setBet', amount: newBet }));
  };

  return (
    <div className="min-h-screen p-4 flex flex-col items-center bg-gray-900">
      <header className="w-full max-w-6xl flex justify-between items-center mb-4">
        <button onClick={() => {
          wsRef.current?.send(JSON.stringify({ type: 'leaveTable' }));
          navigate('/games');
        }} className="px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 text-white">
          ← Back to Lobby
        </button>
        <div className="flex items-center gap-6">
          <span className={`px-3 py-1 rounded ${connected ? 'bg-green-500' : 'bg-red-500'}`}>
            {connected ? 'Connected' : 'Connecting...'}
          </span>
          <span className="text-2xl font-bold text-yellow-400">{points.toLocaleString()} pts</span>
        </div>
      </header>

      <div className="casino-card p-4">
        <h1 className="text-2xl font-bold text-yellow-400 text-center mb-4">Ocean Hunter</h1>
        
        <canvas
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          className="game-canvas cursor-crosshair max-w-full"
          style={{ maxWidth: '100%', height: 'auto' }}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
        />

        <div className="flex items-center justify-center gap-8 mt-4">
          <div className="flex items-center gap-4">
            <span className="text-gray-300">Shot Cost:</span>
            <button
              onClick={() => adjustBet(-1)}
              className="w-10 h-10 bg-yellow-400/20 rounded-full text-yellow-400 text-xl hover:bg-yellow-400/40"
            >
              -
            </button>
            <span className="text-2xl font-bold text-yellow-400 w-16 text-center">{bet}</span>
            <button
              onClick={() => adjustBet(1)}
              className="w-10 h-10 bg-yellow-400/20 rounded-full text-yellow-400 text-xl hover:bg-yellow-400/40"
            >
              +
            </button>
          </div>
          
          <div className="text-gray-400 text-sm">
            Click to shoot | Move mouse to aim
          </div>
        </div>
      </div>

      <div className="mt-4 text-gray-400 text-center max-w-2xl">
        <p>🐟 x2 | 🐠 x5 | 🐡 x10 | 🦈 x25 | 🐋 x50</p>
        <p className="text-sm mt-2">Higher multiplier fish are harder to catch!</p>
      </div>
    </div>
  );
}
