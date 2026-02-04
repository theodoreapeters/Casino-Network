import { useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '../context/AuthContext';

export default function Login() {
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

    if (wsRef.current) {
      wsRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'login', username, password }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'loginSuccess':
          setUser(message.player);
          navigate('/games');
          break;
        case 'loginFailed':
          setError(message.reason || 'Login failed');
          setConnecting(false);
          ws.close();
          break;
      }
    };

    ws.onerror = () => {
      setError('Connection error');
      setConnecting(false);
    };

    ws.onclose = () => {
      setConnecting(false);
    };
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="casino-card w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-yellow-400 mb-2">Casino Platform</h1>
          <p className="text-gray-300">Sign in to continue</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 focus:border-yellow-400 focus:outline-none"
              required
              disabled={connecting}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 focus:border-yellow-400 focus:outline-none"
              required
              disabled={connecting}
            />
          </div>
          
          <button type="submit" className="casino-button w-full text-black" disabled={connecting}>
            {connecting ? 'Connecting...' : 'Sign In'}
          </button>
        </form>
        
        <p className="text-center text-gray-400 mt-6 text-sm">
          Demo: admin / admin123
        </p>
      </div>
    </div>
  );
}
