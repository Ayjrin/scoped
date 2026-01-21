import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { restoreQuest, persistQuests } from '../slice';
import { removeXP, persistProgress } from '../../progress/slice';
import type { Quest } from '../slice';

function formatDay(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function groupByDay(quests: Quest[]): Map<string, Quest[]> {
  const groups = new Map<string, Quest[]>();
  
  // Sort by completedAt descending (most recent first)
  const sorted = [...quests].sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  
  for (const quest of sorted) {
    const day = formatDay(quest.completedAt || quest.createdAt);
    const existing = groups.get(day) || [];
    existing.push(quest);
    groups.set(day, existing);
  }
  
  return groups;
}

export function CompletedQuests() {
  const dispatch = useAppDispatch();
  const [isExpanded, setIsExpanded] = useState(false);
  const quests = useAppSelector((state) => state.quests.items);
  const progress = useAppSelector((state) => state.progress);
  const completedQuests = quests.filter((q) => q.status === 'done' && q.parentId === null);

  if (completedQuests.length === 0) {
    return null;
  }

  const handleRestore = (questId: string) => {
    const quest = quests.find((q) => q.id === questId);
    if (!quest) return;

    const isSubquest = quest.parentId !== null;
    
    // Subtract XP that was earned from this quest
    dispatch(removeXP({ isSubquest }));
    dispatch(restoreQuest(questId));
    
    // Persist quest changes
    const updatedQuests = quests.map((q) => {
      if (q.id === questId) {
        const { completedAt, ...rest } = q;
        return { ...rest, status: 'queued' as const };
      }
      return q;
    });
    dispatch(persistQuests(updatedQuests));

    // Persist progress changes
    const levelMultiplier = Math.pow(0.95, progress.level - 1);
    const baseXP = isSubquest ? 10 : 20;
    const scaledXP = Math.round(baseXP * levelMultiplier);
    
    let newXP = progress.currentXP - scaledXP;
    let newLevel = progress.level;
    
    if (newXP < 0 && newLevel > 1) {
      newLevel -= 1;
      newXP = 100 + newXP;
    }
    if (newXP < 0) newXP = 0;

    dispatch(persistProgress({
      currentXP: newXP,
      level: newLevel,
      totalXPEarned: Math.max(0, progress.totalXPEarned - scaledXP),
    }));
  };

  const groupedQuests = groupByDay(completedQuests);

  return (
    <div className="px-3 pt-1 pb-2 border-t border-[var(--color-border)]">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header w-full"
      >
        <span className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">
          Completed
        </span>
        <svg
          className={`section-chevron w-4 h-4 text-[var(--color-muted)] ${isExpanded ? 'expanded' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Content */}
      <div className={`collapse-transition ${isExpanded ? 'expanded' : 'collapsed'}`}>
        <div className="mt-2 space-y-2 max-h-32 overflow-y-auto">
          {Array.from(groupedQuests.entries()).map(([day, dayQuests]) => (
            <div key={day} className="day-group">
              <div className="day-group-header">{day}</div>
              <div className="space-y-1">
                {dayQuests.map((quest) => (
                  <div
                    key={quest.id}
                    className="completed-quest-item group flex items-center gap-2 py-1 px-2 rounded hover:bg-[var(--color-surface)] transition-colors"
                  >
                    <svg className="w-3 h-3 text-[var(--color-break)] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-xs text-[var(--color-muted)] line-through opacity-60 truncate flex-1">
                      {quest.title}
                    </span>
                    
                    {/* Restore button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRestore(quest.id);
                      }}
                      className="restore-btn p-1 rounded hover:bg-[var(--color-focus)]/20 text-[var(--color-muted)] hover:text-[var(--color-focus)] transition-all"
                      title="Restore to quest log"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
