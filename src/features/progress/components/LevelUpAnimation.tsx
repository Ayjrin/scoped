import { useEffect } from 'react';

interface LevelUpAnimationProps {
  level: number;
  onDismiss: () => void;
}

export function LevelUpAnimation({ level, onDismiss }: LevelUpAnimationProps) {
  useEffect(() => {
    // Auto-dismiss after animation
    const timer = setTimeout(onDismiss, 1500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Level badge flash */}
      <div 
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full flex items-center justify-center"
        style={{
          background: 'var(--color-focus)',
          boxShadow: '0 0 12px var(--color-focus)',
          animation: 'sparkle 0.8s ease-out forwards',
        }}
      >
        <span className="text-xs font-bold text-white">{level}</span>
      </div>
    </div>
  );
}
