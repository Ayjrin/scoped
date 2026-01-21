import { useState, useRef, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { updateQuest, startCompleting, completeQuest, persistQuests } from '../slice';
import { addXP, persistProgress } from '../../progress/slice';

export function CurrentQuest() {
  const dispatch = useAppDispatch();
  const quests = useAppSelector((state) => state.quests.items);
  const progress = useAppSelector((state) => state.progress);
  const completingIds = useAppSelector((state) => state.quests.completingIds);
  
  const activeQuest = quests.find((q) => q.status === 'active');
  const isCompleting = activeQuest ? completingIds.includes(activeQuest.id) : false;

  // Check if active quest has incomplete children
  const childQuests = activeQuest ? quests.filter((q) => q.parentId === activeQuest.id) : [];
  const hasIncompleteChildren = childQuests.some((q) => q.status !== 'done');
  const isSubquest = activeQuest?.parentId !== null;
  const canComplete = !hasIncompleteChildren || isSubquest;

  // Find parent quest if this is a subquest
  const parentQuest = isSubquest && activeQuest
    ? quests.find((q) => q.id === activeQuest.parentId)
    : null;

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isChecked, setIsChecked] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Reset checked state when active quest changes
  useEffect(() => {
    setIsChecked(false);
  }, [activeQuest?.id]);

  const handleStartEdit = () => {
    if (activeQuest) {
      setEditValue(activeQuest.title);
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    if (activeQuest && editValue.trim()) {
      dispatch(updateQuest({ id: activeQuest.id, title: editValue.trim() }));
      dispatch(persistQuests(quests.map((q) =>
        q.id === activeQuest.id ? { ...q, title: editValue.trim() } : q
      )));
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  const handleComplete = () => {
    if (!activeQuest || !canComplete) return;

    setIsChecked(true);
    dispatch(startCompleting(activeQuest.id));

    // Calculate XP with level scaling
    const levelMultiplier = Math.pow(0.95, progress.level - 1);
    const baseXP = isSubquest ? 10 : 20;
    const scaledXP = Math.round(baseXP * levelMultiplier);

    // After animation, complete the quest and add XP
    setTimeout(() => {
      dispatch(completeQuest(activeQuest.id));
      dispatch(addXP({ isSubquest: isSubquest || false }));

      // Persist both
      const updatedQuests = quests.map((q) => {
        if (q.id === activeQuest.id) {
          return { ...q, status: 'done' as const, completedAt: Date.now() };
        }
        // Also complete children if completing parent
        if (!isSubquest && q.parentId === activeQuest.id) {
          return { ...q, status: 'done' as const, completedAt: Date.now() };
        }
        return q;
      });
      dispatch(persistQuests(updatedQuests));
      
      const newXP = (progress.currentXP + scaledXP) % 100;
      const leveledUp = progress.currentXP + scaledXP >= 100;
      dispatch(persistProgress({
        currentXP: newXP,
        level: leveledUp ? progress.level + 1 : progress.level,
        totalXPEarned: progress.totalXPEarned + scaledXP,
      }));
    }, 500);
  };

  if (!activeQuest) {
    return (
      <div className="current-quest-section">
        <div className="current-quest-label">Current Quest</div>
        <div className="text-xs text-[var(--color-muted)]/70 italic">
          Double-click a quest to set as current
        </div>
      </div>
    );
  }

  return (
    <div className="current-quest-section">
      <div className="current-quest-label">Current Quest</div>

      {/* Show parent context if this is a subquest */}
      {parentQuest && (
        <div className="text-[10px] text-[var(--color-muted)] mb-1 truncate">
          Part of: <span className="text-[var(--color-text-secondary)]">{parentQuest.title}</span>
        </div>
      )}

      <div className={`flex items-center gap-3 ${isCompleting ? 'quest-completing quest-completed-fade' : ''}`}>
        {/* Complete checkbox */}
        <button
          onClick={handleComplete}
          disabled={isCompleting || !canComplete}
          className={`quest-checkbox ${isChecked ? 'checked' : ''} ${!canComplete ? 'disabled' : ''}`}
          title={canComplete ? 'Mark complete' : 'Complete all sub-quests first'}
        >
          <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>

        {/* Quest title */}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-b border-[var(--color-focus)] text-[var(--color-text)] text-sm outline-none py-0.5"
          />
        ) : (
          <button
            onClick={handleStartEdit}
            className="flex-1 text-left text-sm text-[var(--color-text)] hover:text-[var(--color-focus)] transition-colors"
          >
            {activeQuest.title}
          </button>
        )}
      </div>
    </div>
  );
}
