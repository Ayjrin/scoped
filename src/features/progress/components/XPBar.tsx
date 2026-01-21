import { useAppSelector, useAppDispatch } from '../../../app/hooks';
import { clearLevelUp } from '../slice';
import { LevelUpAnimation } from './LevelUpAnimation';

export function XPBar() {
  const dispatch = useAppDispatch();
  const { currentXP, level, showLevelUp } = useAppSelector((state) => state.progress);
  const percentage = (currentXP / 100) * 100;
  const isCloseToLevelUp = currentXP >= 80;

  const handleDismissLevelUp = () => {
    dispatch(clearLevelUp());
  };

  return (
    <div className="relative flex items-center gap-2 px-3 pt-1 pb-3">
      {/* Current Level */}
      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)]">
        <span className="text-[9px] font-semibold text-[var(--color-xp)]">{level}</span>
      </div>

      {/* XP Bar */}
      <div className="flex-1 xp-bar-container relative">
        <div
          className={`xp-bar-fill ${isCloseToLevelUp ? 'xp-bar-glow' : ''}`}
          style={{ width: `${percentage}%` }}
        />
        
        {/* Level Up Animation */}
        {showLevelUp && (
          <LevelUpAnimation level={level} onDismiss={handleDismissLevelUp} />
        )}
      </div>

      {/* Next Level */}
      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)]">
        <span className="text-[9px] font-medium text-[var(--color-muted-strong)]">{level + 1}</span>
      </div>
    </div>
  );
}
