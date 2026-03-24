import { useRef, useState, useEffect, useCallback } from 'react';
import GameTile from '../lobby/GameTile';

interface Game {
  id: string;
  name: string;
  type: string;
  theme: string;
}

interface LinearCarouselProps {
  games: Game[];
  orientation: 'horizontal' | 'vertical';
  onGameSelect: (gameId: string, gameType: string) => void;
  tileSize?: number;
}

export default function LinearCarousel({ games, orientation, onGameSelect, tileSize = 180 }: LinearCarouselProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollPos, setScrollPos] = useState(0);
  const isDragging = useRef(false);
  const dragStart = useRef(0);
  const scrollStart = useRef(0);
  const velocity = useRef(0);
  const lastPos = useRef(0);
  const lastTime = useRef(0);
  const animFrame = useRef(0);

  const gap = 16;
  const itemSize = orientation === 'horizontal' ? tileSize + gap : tileSize + 40 + gap;
  const totalSize = games.length * itemSize;

  const normalizeScroll = useCallback((pos: number) => {
    if (totalSize === 0) return 0;
    return ((pos % totalSize) + totalSize) % totalSize;
  }, [totalSize]);

  useEffect(() => {
    const animate = () => {
      if (!isDragging.current && Math.abs(velocity.current) > 0.5) {
        setScrollPos(prev => {
          const next = prev + velocity.current;
          velocity.current *= 0.95;
          return normalizeScroll(next);
        });
        animFrame.current = requestAnimationFrame(animate);
      }
    };
    animFrame.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrame.current);
  }, [normalizeScroll]);

  const getEventPos = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e) {
      return orientation === 'horizontal' ? e.touches[0].clientX : e.touches[0].clientY;
    }
    return orientation === 'horizontal' ? e.clientX : e.clientY;
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = true;
    velocity.current = 0;
    dragStart.current = getEventPos(e);
    scrollStart.current = scrollPos;
    lastPos.current = getEventPos(e);
    lastTime.current = Date.now();
    cancelAnimationFrame(animFrame.current);
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const pos = getEventPos(e);
    const delta = dragStart.current - pos;
    const now = Date.now();
    const dt = now - lastTime.current;
    if (dt > 0) {
      velocity.current = (lastPos.current - pos) / dt * 16;
    }
    lastPos.current = pos;
    lastTime.current = now;
    setScrollPos(normalizeScroll(scrollStart.current + delta));
  };

  const handleEnd = () => {
    isDragging.current = false;
    const animate = () => {
      if (!isDragging.current && Math.abs(velocity.current) > 0.5) {
        setScrollPos(prev => {
          const next = prev + velocity.current;
          velocity.current *= 0.95;
          return normalizeScroll(next);
        });
        animFrame.current = requestAnimationFrame(animate);
      }
    };
    animFrame.current = requestAnimationFrame(animate);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = orientation === 'horizontal' ? e.deltaX || e.deltaY : e.deltaY;
    setScrollPos(prev => normalizeScroll(prev + delta));
  };

  if (games.length === 0) {
    return <div className="flex items-center justify-center h-full text-gray-500">No games available</div>;
  }

  const containerSize = containerRef.current
    ? (orientation === 'horizontal' ? containerRef.current.offsetWidth : containerRef.current.offsetHeight)
    : 800;
  const visibleCount = Math.ceil(containerSize / itemSize) + 2;
  const startIndex = Math.floor(scrollPos / itemSize);
  const offset = -(scrollPos % itemSize);

  const tiles = [];
  for (let i = 0; i < visibleCount; i++) {
    const gameIndex = ((startIndex + i) % games.length + games.length) % games.length;
    const game = games[gameIndex];
    const position = offset + i * itemSize;

    const tileStyle: React.CSSProperties = orientation === 'horizontal'
      ? { position: 'absolute', left: position, top: '50%', transform: 'translateY(-50%)' }
      : { position: 'absolute', top: position, left: '50%', transform: 'translateX(-50%)' };

    tiles.push(
      <GameTile
        key={`${gameIndex}-${i}`}
        game={game}
        onClick={() => onGameSelect(game.id, game.type)}
        size={tileSize}
        style={tileStyle}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none cursor-grab active:cursor-grabbing"
      onMouseDown={handleStart}
      onMouseMove={handleMove}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={handleStart}
      onTouchMove={handleMove}
      onTouchEnd={handleEnd}
      onWheel={handleWheel}
    >
      {tiles}
    </div>
  );
}
