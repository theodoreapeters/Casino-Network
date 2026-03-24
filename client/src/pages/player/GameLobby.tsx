import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '../../context/AuthContext';
import TopBar from '../../components/lobby/TopBar';
import SideNav, { GameFilter } from '../../components/lobby/SideNav';
import BottomNav from '../../components/lobby/BottomNav';
import SettingsPanel, { CarouselMode, getCarouselMode } from '../../components/lobby/SettingsPanel';
import LinearCarousel from '../../components/carousel/LinearCarousel';
import CircularCarousel from '../../components/carousel/CircularCarousel';

interface Game {
  id: string;
  name: string;
  type: string;
  theme: string;
}

export default function GameLobby() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [games, setGames] = useState<Game[]>([]);
  const [filter, setFilter] = useState<GameFilter>('all');
  const [carouselMode, setCarouselMode] = useState<CarouselMode>(getCarouselMode());
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetch('/api/games')
      .then(res => res.json())
      .then(setGames);
  }, [user]);

  if (!user) return null;

  const filteredGames = filter === 'all' ? games : games.filter(g => g.type === filter);

  const handleGameSelect = (gameId: string, gameType: string) => {
    navigate(`/games/${gameType}/${gameId}`);
  };

  const renderCarousel = () => {
    if (filteredGames.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-gray-500">
          No games found
        </div>
      );
    }

    switch (carouselMode) {
      case 'linear-horizontal':
        return <LinearCarousel games={filteredGames} orientation="horizontal" onGameSelect={handleGameSelect} />;
      case 'linear-vertical':
        return <LinearCarousel games={filteredGames} orientation="vertical" onGameSelect={handleGameSelect} />;
      case 'circular-left':
        return <CircularCarousel games={filteredGames} arc="left" onGameSelect={handleGameSelect} />;
      case 'circular-right':
        return <CircularCarousel games={filteredGames} arc="right" onGameSelect={handleGameSelect} />;
      case 'circular-top':
        return <CircularCarousel games={filteredGames} arc="top" onGameSelect={handleGameSelect} />;
      case 'circular-bottom':
        return <CircularCarousel games={filteredGames} arc="bottom" onGameSelect={handleGameSelect} />;
      default:
        return <CircularCarousel games={filteredGames} arc="bottom" onGameSelect={handleGameSelect} />;
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TopBar onSettingsClick={() => setSettingsOpen(true)} />

      <div className="flex flex-1 min-h-0">
        <SideNav activeFilter={filter} onFilterChange={setFilter} />

        <main className="flex-1 relative">
          {renderCarousel()}
        </main>
      </div>

      <BottomNav onSettingsClick={() => setSettingsOpen(true)} />

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onCarouselChange={setCarouselMode}
        currentMode={carouselMode}
      />
    </div>
  );
}
