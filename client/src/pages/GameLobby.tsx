import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '../context/AuthContext';

interface Game {
  id: string;
  name: string;
  type: string;
  theme: string;
}

export default function GameLobby() {
  const { user, setUser } = useAuth();
  const [, navigate] = useLocation();
  const [games, setGames] = useState<Game[]>([]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetch('/api/games')
      .then(res => res.json())
      .then(setGames);
  }, [user]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    navigate('/login');
  };

  if (!user) return null;

  const slotGames = games.filter(g => g.type === 'slot');
  const fishGames = games.filter(g => g.type === 'fish');

  return (
    <div className="min-h-screen p-6">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-yellow-400">Game Lobby</h1>
          <p className="text-gray-300">Welcome, {user.username}</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-yellow-400 font-bold text-xl">{user.points.toLocaleString()} pts</span>
          <button onClick={handleLogout} className="px-4 py-2 bg-red-500/20 rounded-lg hover:bg-red-500/40">
            Logout
          </button>
        </div>
      </header>

      <section className="mb-12">
        <h2 className="text-2xl font-bold text-yellow-400 mb-6">Slot Machines</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {slotGames.map(game => (
            <div
              key={game.id}
              onClick={() => navigate(`/games/slot/${game.id}`)}
              className="casino-card cursor-pointer hover:scale-105 transition-transform"
            >
              <div className="h-40 bg-gradient-to-br from-purple-600 to-pink-500 rounded-lg mb-4 flex items-center justify-center">
                <span className="text-6xl">🎰</span>
              </div>
              <h3 className="text-xl font-bold">{game.name}</h3>
              <p className="text-gray-400 capitalize">{game.theme} Theme</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-yellow-400 mb-6">Fish Shooter Games</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {fishGames.map(game => (
            <div
              key={game.id}
              onClick={() => navigate(`/games/fish/${game.id}`)}
              className="casino-card cursor-pointer hover:scale-105 transition-transform"
            >
              <div className="h-40 bg-gradient-to-br from-blue-600 to-cyan-400 rounded-lg mb-4 flex items-center justify-center">
                <span className="text-6xl">🐠</span>
              </div>
              <h3 className="text-xl font-bold">{game.name}</h3>
              <p className="text-gray-400 capitalize">{game.theme} Theme - Multiplayer</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
