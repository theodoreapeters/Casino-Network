import { useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '../../context/AuthContext';

export default function PlayerLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [, navigate] = useLocation();
  const { setUser } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setConnecting(true);

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'login', username, password }));
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'loginSuccess') {
          setUser(msg.player);
          ws.close();
          fetch('/api/auth/ws-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken: msg.sessionToken })
          }).finally(() => navigate('/lobby'));
        } else if (msg.type === 'loginFailed') {
          setError(msg.reason || 'Login failed');
          setConnecting(false);
          ws.close();
        }
      };

      ws.onerror = () => {
        setError('Connection error');
        setConnecting(false);
      };

      ws.onclose = () => {
        setConnecting(false);
      };
    } catch {
      setError('Connection error');
      setConnecting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🎮</div>
          <h1 className="text-4xl font-bold text-yellow-400 mb-2">Play Now</h1>
          <p className="text-gray-400">Sign in to start playing</p>
        </div>

        <div className="casino-card">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 focus:border-yellow-400 focus:outline-none text-white placeholder-gray-500"
                placeholder="Enter username"
                required
                disabled={connecting}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 focus:border-yellow-400 focus:outline-none text-white placeholder-gray-500"
                placeholder="Enter password"
                required
                disabled={connecting}
              />
            </div>

            <button
              type="submit"
              disabled={connecting}
              className="casino-button w-full text-black disabled:opacity-50"
            >
              {connecting ? 'Connecting...' : 'Play'}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-500 mt-6 text-xs">
          Staff? <a href="/admin/login" className="text-yellow-400/70 hover:text-yellow-400 underline">Admin Login</a>
        </p>
      </div>
    </div>
  );
}
