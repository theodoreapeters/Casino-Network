interface GameTileProps {
  game: {
    id: string;
    name: string;
    type: string;
    theme: string;
  };
  onClick: () => void;
  size?: number;
  style?: React.CSSProperties;
}

const typeColors: Record<string, { from: string; to: string; badge: string }> = {
  fish: { from: 'from-blue-600', to: 'to-cyan-400', badge: 'bg-cyan-500' },
  slot: { from: 'from-purple-600', to: 'to-pink-500', badge: 'bg-purple-500' },
};

const typeIcons: Record<string, string> = {
  fish: '🐠',
  slot: '🎰',
};

export default function GameTile({ game, onClick, size = 180, style }: GameTileProps) {
  const colors = typeColors[game.type] || typeColors.slot;
  const icon = typeIcons[game.type] || '🎮';

  return (
    <div
      onClick={onClick}
      style={{ width: size, height: size + 40, ...style }}
      className="cursor-pointer group shrink-0"
    >
      <div className="h-full rounded-xl overflow-hidden bg-white/5 border border-white/10 hover:border-yellow-400/50 transition-all duration-200 group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-yellow-400/10 flex flex-col">
        <div className={`flex-1 bg-gradient-to-br ${colors.from} ${colors.to} flex items-center justify-center relative`}>
          <span className="text-5xl drop-shadow-lg">{icon}</span>
          <span className={`absolute top-2 right-2 ${colors.badge} text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase`}>
            {game.type}
          </span>
        </div>
        <div className="px-3 py-2.5">
          <h3 className="text-sm font-bold text-white truncate">{game.name}</h3>
          <p className="text-[11px] text-gray-400 capitalize truncate">{game.theme} Theme</p>
        </div>
      </div>
    </div>
  );
}
