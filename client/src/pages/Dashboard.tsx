import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '../context/AuthContext';

interface ManagedUser {
  id: string;
  username: string;
  role: string;
  points: number;
  isActive: boolean;
}

interface Settings {
  slotRtp: number;
  fishWinRate: number;
  minBet: number;
  maxBet: number;
}

interface Report {
  totalPlayers: number;
  totalManagers: number;
  totalPointsInCirculation: number;
  userCount: number;
}

export default function Dashboard() {
  const { user, setUser } = useAuth();
  const [, navigate] = useLocation();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showPointsModal, setShowPointsModal] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'player' });
  const [pointsAction, setPointsAction] = useState({ amount: 0, type: 'recharge' });

  useEffect(() => {
    if (!user || user.role === 'player') {
      navigate('/');
      return;
    }
    loadData();
  }, [user]);

  const loadData = async () => {
    const [usersRes, reportRes] = await Promise.all([
      fetch('/api/users'),
      fetch('/api/reports/overview')
    ]);
    if (usersRes.ok) setUsers(await usersRes.json());
    if (reportRes.ok) setReport(await reportRes.json());
    
    if (user?.role === 'distributor') {
      const settingsRes = await fetch('/api/settings');
      if (settingsRes.ok) setSettings(await settingsRes.json());
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    navigate('/login');
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser)
    });
    if (res.ok) {
      setShowAddUser(false);
      setNewUser({ username: '', password: '', role: 'player' });
      loadData();
    }
  };

  const handlePoints = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPointsModal) return;
    const res = await fetch(`/api/users/${showPointsModal}/points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pointsAction)
    });
    if (res.ok) {
      setShowPointsModal(null);
      setPointsAction({ amount: 0, type: 'recharge' });
      loadData();
      const meRes = await fetch('/api/auth/me');
      if (meRes.ok) setUser(await meRes.json());
    }
  };

  const handleSettingsUpdate = async () => {
    if (!settings) return;
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
  };

  if (!user) return null;

  return (
    <div className="min-h-screen p-6">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-yellow-400">Dashboard</h1>
          <p className="text-gray-300">Welcome, {user.username} ({user.role})</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-yellow-400 font-bold">{user.points.toLocaleString()} pts</span>
          <button onClick={handleLogout} className="px-4 py-2 bg-red-500/20 rounded-lg hover:bg-red-500/40">
            Logout
          </button>
        </div>
      </header>

      {report && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="casino-card text-center">
            <div className="text-3xl font-bold text-yellow-400">{report.totalPlayers}</div>
            <div className="text-gray-300">Players</div>
          </div>
          {user.role === 'distributor' && (
            <div className="casino-card text-center">
              <div className="text-3xl font-bold text-yellow-400">{report.totalManagers}</div>
              <div className="text-gray-300">Managers</div>
            </div>
          )}
          <div className="casino-card text-center">
            <div className="text-3xl font-bold text-yellow-400">{report.totalPointsInCirculation.toLocaleString()}</div>
            <div className="text-gray-300">Points in Circulation</div>
          </div>
          <div className="casino-card text-center">
            <div className="text-3xl font-bold text-yellow-400">{report.userCount}</div>
            <div className="text-gray-300">Total Users</div>
          </div>
        </div>
      )}

      {user.role === 'distributor' && settings && (
        <div className="casino-card mb-8">
          <h2 className="text-xl font-bold mb-4 text-yellow-400">Game Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm mb-2">Slot RTP (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={settings.slotRtp}
                onChange={e => setSettings({ ...settings, slotRtp: parseFloat(e.target.value) })}
                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20"
              />
            </div>
            <div>
              <label className="block text-sm mb-2">Fish Win Rate</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={settings.fishWinRate}
                onChange={e => setSettings({ ...settings, fishWinRate: parseFloat(e.target.value) })}
                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20"
              />
            </div>
            <div>
              <label className="block text-sm mb-2">Min Bet</label>
              <input
                type="number"
                value={settings.minBet}
                onChange={e => setSettings({ ...settings, minBet: parseInt(e.target.value) })}
                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20"
              />
            </div>
            <div>
              <label className="block text-sm mb-2">Max Bet</label>
              <input
                type="number"
                value={settings.maxBet}
                onChange={e => setSettings({ ...settings, maxBet: parseInt(e.target.value) })}
                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20"
              />
            </div>
          </div>
          <button onClick={handleSettingsUpdate} className="casino-button mt-4 text-black">
            Save Settings
          </button>
        </div>
      )}

      <div className="casino-card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-yellow-400">
            {user.role === 'distributor' ? 'Managers & Players' : 'Players'}
          </h2>
          <button onClick={() => setShowAddUser(true)} className="casino-button text-black">
            Add {user.role === 'distributor' ? 'User' : 'Player'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/20">
                <th className="text-left py-3">Username</th>
                <th className="text-left py-3">Role</th>
                <th className="text-right py-3">Points</th>
                <th className="text-center py-3">Status</th>
                <th className="text-right py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-white/10">
                  <td className="py-3">{u.username}</td>
                  <td className="py-3 capitalize">{u.role}</td>
                  <td className="py-3 text-right text-yellow-400">{u.points.toLocaleString()}</td>
                  <td className="py-3 text-center">
                    <span className={`px-2 py-1 rounded text-xs ${u.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => setShowPointsModal(u.id)}
                      className="px-3 py-1 bg-yellow-400/20 rounded text-yellow-400 hover:bg-yellow-400/40"
                    >
                      Points
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAddUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <div className="casino-card w-full max-w-md">
            <h3 className="text-xl font-bold mb-4 text-yellow-400">Add New User</h3>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-sm mb-2">Username</label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20"
                  required
                />
              </div>
              <div>
                <label className="block text-sm mb-2">Password</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20"
                  required
                />
              </div>
              {user.role === 'distributor' && (
                <div>
                  <label className="block text-sm mb-2">Role</label>
                  <select
                    value={newUser.role}
                    onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20"
                  >
                    <option value="manager">Manager</option>
                    <option value="player">Player</option>
                  </select>
                </div>
              )}
              <div className="flex gap-2">
                <button type="submit" className="casino-button flex-1 text-black">Create</button>
                <button type="button" onClick={() => setShowAddUser(false)} className="flex-1 px-4 py-2 bg-white/10 rounded-lg">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPointsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <div className="casino-card w-full max-w-md">
            <h3 className="text-xl font-bold mb-4 text-yellow-400">Manage Points</h3>
            <form onSubmit={handlePoints} className="space-y-4">
              <div>
                <label className="block text-sm mb-2">Action</label>
                <select
                  value={pointsAction.type}
                  onChange={e => setPointsAction({ ...pointsAction, type: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20"
                >
                  <option value="recharge">Recharge (Add Points)</option>
                  <option value="redeem">Redeem (Remove Points)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-2">Amount</label>
                <input
                  type="number"
                  min="1"
                  value={pointsAction.amount}
                  onChange={e => setPointsAction({ ...pointsAction, amount: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20"
                  required
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="casino-button flex-1 text-black">Confirm</button>
                <button type="button" onClick={() => setShowPointsModal(null)} className="flex-1 px-4 py-2 bg-white/10 rounded-lg">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
