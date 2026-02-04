import { useState, useEffect } from 'react';
import { Route, Switch } from 'wouter';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import GameLobby from './pages/GameLobby';
import SlotGame from './pages/SlotGame';
import FishGame from './pages/FishGame';
import { AuthContext, User } from './context/AuthContext';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        setUser(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl text-yellow-400">Loading...</div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <div className="min-h-screen">
        <Switch>
          <Route path="/login" component={Login} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/games" component={GameLobby} />
          <Route path="/games/slot/:id" component={SlotGame} />
          <Route path="/games/fish/:id" component={FishGame} />
          <Route path="/">
            {user ? (user.role === 'player' ? <GameLobby /> : <Dashboard />) : <Login />}
          </Route>
        </Switch>
      </div>
    </AuthContext.Provider>
  );
}
