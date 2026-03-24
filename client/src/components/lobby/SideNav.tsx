export type GameFilter = 'all' | 'fish' | 'slot';

interface SideNavProps {
  activeFilter: GameFilter;
  onFilterChange: (filter: GameFilter) => void;
}

const filters: { key: GameFilter; label: string; icon: string }[] = [
  { key: 'all', label: 'All Games', icon: '🎯' },
  { key: 'fish', label: 'Fishing', icon: '🐠' },
  { key: 'slot', label: 'Slots', icon: '🎰' },
];

export default function SideNav({ activeFilter, onFilterChange }: SideNavProps) {
  return (
    <div className="w-16 sm:w-48 bg-black/30 border-r border-white/10 flex flex-col py-4 shrink-0">
      <div className="px-3 mb-4 hidden sm:block">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Game Type</span>
      </div>
      <nav className="flex flex-col gap-1 px-2">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => onFilterChange(f.key)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150
              ${activeFilter === f.key
                ? 'bg-yellow-400/15 text-yellow-400 border border-yellow-400/30'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5 border border-transparent'
              }`}
          >
            <span className="text-lg">{f.icon}</span>
            <span className="hidden sm:block">{f.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
