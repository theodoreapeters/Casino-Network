import { useState, useEffect, useCallback } from 'react';
import { useLocation, useParams } from 'wouter';
import { useAuth } from '../context/AuthContext';

const symbolEmojis: Record<string, string> = {
  dragon: '🐉',
  coin: '🪙',
  lantern: '🏮',
  fan: '🎐',
  fish: '🐟',
  wild: '⭐',
  scatter: '💎',
  pearl: '🦪',
  treasure: '💰',
  mermaid: '🧜‍♀️',
  shell: '🐚',
  anchor: '⚓'
};

interface SpinResult {
  reels: string[][];
  winAmount: number;
  winLines: number[];
}

export default function SlotGame() {
  const { user, setUser } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const [reels, setReels] = useState<string[][]>([
    ['dragon', 'coin', 'lantern'],
    ['fan', 'fish', 'wild'],
    ['scatter', 'dragon', 'coin'],
    ['lantern', 'fan', 'fish'],
    ['wild', 'scatter', 'dragon']
  ]);
  const [spinning, setSpinning] = useState(false);
  const [bet, setBet] = useState(10);
  const [lastWin, setLastWin] = useState(0);
  const [points, setPoints] = useState(user?.points || 0);

  useEffect(() => {
    if (!user) navigate('/login');
    setPoints(user?.points || 0);
  }, [user]);

  const spin = useCallback(async () => {
    if (spinning || points < bet) return;
    
    setSpinning(true);
    setLastWin(0);
    
    const spinInterval = setInterval(() => {
      setReels(prev => prev.map(reel => {
        const symbols = Object.keys(symbolEmojis);
        return reel.map(() => symbols[Math.floor(Math.random() * symbols.length)]);
      }));
    }, 100);
    
    try {
      const res = await fetch('/api/games/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: params.id, betAmount: bet })
      });
      
      if (res.ok) {
        const result: SpinResult = await res.json();
        
        setTimeout(() => {
          clearInterval(spinInterval);
          setReels(result.reels);
          setLastWin(result.winAmount);
          setPoints(prev => prev - bet + result.winAmount);
          setSpinning(false);
          
          fetch('/api/auth/me')
            .then(r => r.json())
            .then(data => setUser(data));
        }, 1500);
      } else {
        clearInterval(spinInterval);
        setSpinning(false);
      }
    } catch {
      clearInterval(spinInterval);
      setSpinning(false);
    }
  }, [spinning, points, bet, params.id, setUser]);

  return (
    <div className="min-h-screen p-6 flex flex-col items-center">
      <header className="w-full flex justify-between items-center mb-8">
        <button onClick={() => navigate('/games')} className="px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20">
          ← Back to Lobby
        </button>
        <div className="text-2xl font-bold text-yellow-400">
          {points.toLocaleString()} pts
        </div>
      </header>

      <div className="casino-card p-8 max-w-4xl w-full">
        <h1 className="text-3xl font-bold text-yellow-400 text-center mb-8">Lucky Fortune Slots</h1>
        
        <div className="bg-gradient-to-b from-purple-900 to-purple-800 rounded-xl p-6 mb-6 border-4 border-yellow-400">
          <div className="flex justify-center gap-2">
            {reels.map((reel, reelIndex) => (
              <div key={reelIndex} className="bg-black/30 rounded-lg p-2">
                <div className="flex flex-col gap-2">
                  {reel.map((symbol, rowIndex) => (
                    <div
                      key={rowIndex}
                      className={`w-20 h-20 bg-gradient-to-b from-white/20 to-white/10 rounded-lg flex items-center justify-center text-4xl
                        ${spinning ? 'animate-pulse' : ''}`}
                    >
                      {symbolEmojis[symbol] || '❓'}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {lastWin > 0 && (
          <div className="text-center mb-6 animate-bounce">
            <span className="text-4xl font-bold text-yellow-400">WIN: {lastWin.toLocaleString()} pts!</span>
          </div>
        )}

        <div className="flex items-center justify-center gap-8 mb-6">
          <div className="flex items-center gap-4">
            <span className="text-gray-300">Bet:</span>
            <button
              onClick={() => setBet(Math.max(1, bet - 10))}
              className="w-10 h-10 bg-yellow-400/20 rounded-full text-yellow-400 text-xl hover:bg-yellow-400/40"
              disabled={spinning}
            >
              -
            </button>
            <span className="text-2xl font-bold text-yellow-400 w-20 text-center">{bet}</span>
            <button
              onClick={() => setBet(Math.min(1000, bet + 10))}
              className="w-10 h-10 bg-yellow-400/20 rounded-full text-yellow-400 text-xl hover:bg-yellow-400/40"
              disabled={spinning}
            >
              +
            </button>
          </div>
        </div>

        <button
          onClick={spin}
          disabled={spinning || points < bet}
          className={`casino-button w-full text-black text-2xl py-4 ${
            spinning ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {spinning ? 'SPINNING...' : 'SPIN'}
        </button>
      </div>
    </div>
  );
}
