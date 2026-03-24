import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from 'wouter';

export type CarouselMode = 'circular-left' | 'circular-right' | 'circular-top' | 'circular-bottom' | 'linear-horizontal' | 'linear-vertical';

const CAROUSEL_KEY = 'casino-carousel-mode';

export function getCarouselMode(): CarouselMode {
  return (localStorage.getItem(CAROUSEL_KEY) as CarouselMode) || 'circular-bottom';
}

export function setCarouselMode(mode: CarouselMode) {
  localStorage.setItem(CAROUSEL_KEY, mode);
}

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onCarouselChange: (mode: CarouselMode) => void;
  currentMode: CarouselMode;
}

const modes: { key: CarouselMode; label: string; description: string; icon: string }[] = [
  { key: 'circular-left', label: 'Circular Left', description: 'Arc curving right', icon: '◖' },
  { key: 'circular-right', label: 'Circular Right', description: 'Arc curving left', icon: '◗' },
  { key: 'circular-top', label: 'Circular Top', description: 'Arc curving down', icon: '◠' },
  { key: 'circular-bottom', label: 'Circular Bottom', description: 'Arc curving up', icon: '◡' },
  { key: 'linear-horizontal', label: 'Linear Horizontal', description: 'Flat row, scroll left/right', icon: '⟷' },
  { key: 'linear-vertical', label: 'Linear Vertical', description: 'Flat column, scroll up/down', icon: '⟰' },
];

export default function SettingsPanel({ open, onClose, onCarouselChange, currentMode }: SettingsPanelProps) {
  const { user, setUser } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<'display' | 'account'>('display');

  if (!open) return null;

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    navigate('/login');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-white">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>

        <div className="flex border-b border-white/10">
          <button
            onClick={() => setActiveTab('display')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${activeTab === 'display' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-gray-400'}`}
          >
            Display
          </button>
          <button
            onClick={() => setActiveTab('account')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${activeTab === 'account' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-gray-400'}`}
          >
            Account
          </button>
        </div>

        <div className="p-5">
          {activeTab === 'display' && (
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Game Carousel Style</h3>
              <div className="grid grid-cols-2 gap-2">
                {modes.map(mode => (
                  <button
                    key={mode.key}
                    onClick={() => {
                      setCarouselMode(mode.key);
                      onCarouselChange(mode.key);
                    }}
                    className={`flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-150
                      ${currentMode === mode.key
                        ? 'bg-yellow-400/15 border border-yellow-400/40 text-yellow-400'
                        : 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10'
                      }`}
                  >
                    <span className="text-2xl w-8 text-center">{mode.icon}</span>
                    <div>
                      <div className="text-sm font-medium">{mode.label}</div>
                      <div className="text-[10px] text-gray-500">{mode.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'account' && (
            <div className="space-y-4">
              {user && (
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="text-sm text-gray-400 mb-1">Username</div>
                  <div className="text-white font-medium">{user.username}</div>
                  <div className="text-sm text-gray-400 mt-3 mb-1">Balance</div>
                  <div className="text-yellow-400 font-bold">{user.points.toLocaleString()} coins</div>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="w-full py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 font-medium text-sm transition-colors"
              >
                Log Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
