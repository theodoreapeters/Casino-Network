import { useRef, useState, useEffect, useCallback } from 'react';
import GameTile from '../lobby/GameTile';

interface Game {
  id: string;
  name: string;
  type: string;
  theme: string;
}

interface CircularCarouselProps {
  games: Game[];
  arc: 'left' | 'right' | 'top' | 'bottom';
  onGameSelect: (gameId: string, gameType: string) => void;
  tileSize?: number;
}

export default function CircularCarousel({ games, arc, onGameSelect, tileSize = 170 }: CircularCarouselProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [angle, setAngle] = useState(0);
  const isDragging = useRef(false);
  const dragStart = useRef(0);
  const angleStart = useRef(0);
  const velocity = useRef(0);
  const lastPos = useRef(0);
  const lastTime = useRef(0);
  const animFrame = useRef(0);

  const isVertical = arc === 'left' || arc === 'right';
  const visibleArc = Math.PI * 0.8;
  const anglePerItem = games.length > 0 ? (Math.PI * 2) / games.length : 1;

  useEffect(() => {
    const animate = () => {
      if (!isDragging.current && Math.abs(velocity.current) > 0.001) {
        setAngle(prev => prev + velocity.current);
        velocity.current *= 0.95;
        animFrame.current = requestAnimationFrame(animate);
      }
    };
    animFrame.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrame.current);
  }, []);

  const getEventPos = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e) {
      return isVertical ? e.touches[0].clientY : e.touches[0].clientX;
    }
    return isVertical ? e.clientY : e.clientX;
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = true;
    velocity.current = 0;
    dragStart.current = getEventPos(e);
    angleStart.current = angle;
    lastPos.current = getEventPos(e);
    lastTime.current = Date.now();
    cancelAnimationFrame(animFrame.current);
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const pos = getEventPos(e);
    const delta = pos - dragStart.current;
    const sensitivity = 0.003;
    const now = Date.now();
    const dt = now - lastTime.current;
    if (dt > 0) {
      velocity.current = ((pos - lastPos.current) * sensitivity) / dt * 16;
    }
    lastPos.current = pos;
    lastTime.current = now;
    setAngle(angleStart.current + delta * sensitivity);
  };

  const handleEnd = () => {
    isDragging.current = false;
    const animate = () => {
      if (!isDragging.current && Math.abs(velocity.current) > 0.001) {
        setAngle(prev => prev + velocity.current);
        velocity.current *= 0.95;
        animFrame.current = requestAnimationFrame(animate);
      }
    };
    animFrame.current = requestAnimationFrame(animate);
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = isVertical ? e.deltaY : (e.deltaX || e.deltaY);
    setAngle(prev => prev - delta * 0.002);
  }, [isVertical]);

  if (games.length === 0) {
    return <div className="flex items-center justify-center h-full text-gray-500">No games available</div>;
  }

  const container = containerRef.current;
  const cw = container?.offsetWidth || 600;
  const ch = container?.offsetHeight || 500;

  const radius = isVertical ? ch * 0.55 : cw * 0.55;

  const tiles: { gameIndex: number; x: number; y: number; scale: number; z: number; opacity: number; itemAngle: number }[] = [];

  for (let i = 0; i < games.length; i++) {
    const itemAngle = angle + i * anglePerItem;
    const normalizedAngle = ((itemAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    let centerAngle: number;
    let inRange: boolean;

    switch (arc) {
      case 'left':
        centerAngle = Math.PI;
        break;
      case 'right':
        centerAngle = 0;
        break;
      case 'top':
        centerAngle = -Math.PI / 2;
        break;
      case 'bottom':
        centerAngle = Math.PI / 2;
        break;
    }

    let diff = normalizedAngle - ((centerAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;

    inRange = Math.abs(diff) <= visibleArc / 2 + 0.3;
    if (!inRange) continue;

    let x: number, y: number;

    switch (arc) {
      case 'left':
        x = cw * 0.15 + Math.cos(itemAngle) * radius * 0.3;
        y = ch / 2 + Math.sin(itemAngle) * radius * 0.8;
        break;
      case 'right':
        x = cw * 0.85 + Math.cos(itemAngle) * radius * 0.3;
        y = ch / 2 + Math.sin(itemAngle) * radius * 0.8;
        break;
      case 'top':
        x = cw / 2 + Math.cos(itemAngle) * radius * 0.8;
        y = ch * 0.15 + Math.sin(itemAngle) * radius * 0.3;
        break;
      case 'bottom':
        x = cw / 2 + Math.cos(itemAngle) * radius * 0.8;
        y = ch * 0.85 + Math.sin(itemAngle) * radius * 0.3;
        break;
    }

    const distFromCenter = Math.abs(diff);
    const maxDist = visibleArc / 2;
    const normalizedDist = Math.min(distFromCenter / maxDist, 1);
    const scale = 1.0 - normalizedDist * 0.4;
    const opacity = 1.0 - normalizedDist * 0.6;

    let z: number;
    switch (arc) {
      case 'left': z = -Math.abs(Math.sin(itemAngle)); break;
      case 'right': z = Math.cos(itemAngle); break;
      case 'top': z = -Math.abs(Math.cos(itemAngle)); break;
      case 'bottom': z = Math.sin(itemAngle); break;
    }

    tiles.push({ gameIndex: i, x, y, scale, z, opacity, itemAngle });
  }

  tiles.sort((a, b) => a.z - b.z);

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
      {tiles.map(({ gameIndex, x, y, scale, opacity }, idx) => {
        const game = games[gameIndex];
        return (
          <GameTile
            key={`${gameIndex}-${idx}`}
            game={game}
            onClick={() => onGameSelect(game.id, game.type)}
            size={tileSize}
            style={{
              position: 'absolute',
              left: x - tileSize / 2,
              top: y - (tileSize + 40) / 2,
              transform: `scale(${scale})`,
              opacity,
              transition: isDragging.current ? 'none' : 'transform 0.1s ease-out, opacity 0.1s ease-out',
              zIndex: Math.round((1 + scale) * 100),
            }}
          />
        );
      })}
    </div>
  );
}
