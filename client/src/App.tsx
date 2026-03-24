import { useState, useEffect } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import PlayerLogin from './pages/player/PlayerLogin';
import AdminLogin from './pages/admin/AdminLogin';
import Dashboard from './pages/Dashboard';
import GameLobby from './pages/player/GameLobby';
import SlotGame from './pages/SlotGame';
import FishGame from './pages/FishGame';
import { AuthContext, User } from './context/AuthContext';

function HomeRedirect({ user }: { user: User | null }) {
  const [, navigate] = useLocation();
  useEffect(() => {
    if (user) {
      navigate(user.role === 'player' ? '/lobby' : '/dashboard');
    } else {
      navigate('/login');
    }
  }, [user, navigate]);
  return null;
}

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
          <Route path="/login" component={PlayerLogin} />
          <Route path="/admin/login" component={AdminLogin} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/lobby" component={GameLobby} />
          <Route path="/games/slot/:id" component={SlotGame} />
          <Route path="/games/fish/:id" component={FishGame} />
          <Route path="/">
            <HomeRedirect user={user} />
          </Route>
        </Switch>
      </div>
    </AuthContext.Provider>
  );
}
