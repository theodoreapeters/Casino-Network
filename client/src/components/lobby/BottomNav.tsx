interface BottomNavProps {
  onSettingsClick: () => void;
}

const navItems = [
  { key: 'bonus', label: 'Daily Bonus', icon: '🎁' },
  { key: 'leaderboard', label: 'Leaderboard', icon: '🏆' },
  { key: 'announcements', label: 'News', icon: '📢' },
];

export default function BottomNav({ onSettingsClick }: BottomNavProps) {
  return (
    <div className="h-14 flex items-center justify-around bg-black/40 border-t border-white/10 shrink-0">
      {navItems.map(item => (
        <button
          key={item.key}
          className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-gray-400 hover:text-yellow-400 transition-colors"
        >
          <span className="text-lg">{item.icon}</span>
          <span className="text-[10px] font-medium">{item.label}</span>
        </button>
      ))}
      <button
        onClick={onSettingsClick}
        className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-gray-400 hover:text-yellow-400 transition-colors"
      >
        <span className="text-lg">⚙️</span>
        <span className="text-[10px] font-medium">Settings</span>
      </button>
    </div>
  );
}
