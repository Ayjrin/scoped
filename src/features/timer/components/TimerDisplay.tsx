import { useCallback, useEffect, useState, useRef } from 'react';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { toggle, tick, reset, setFocusDuration, setBreakDuration } from '../slice';
import { startCompleting, completeQuest, persistQuests } from '../../quests/slice';
import { addXP, persistProgress } from '../../progress/slice';
import { useInterval } from '../../../shared/hooks/useInterval';

interface TimerDisplayProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const EXPANDED_SIZE = { width: 320, height: 520 };
const COLLAPSED_SIZE = { width: 320, height: 210 }; // Fits timer + current quest + toggle with room

const PRESET_DURATIONS = [
  { label: '5 min', value: 5 },
  { label: '10 min', value: 10 },
  { label: '15 min', value: 15 },
  { label: '20 min', value: 20 },
  { label: '25 min', value: 25 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '60 min', value: 60 },
];

function formatTime(seconds: number): string {
  const isNegative = seconds < 0;
  const absSeconds = Math.abs(seconds);
  const mins = Math.floor(absSeconds / 60);
  const secs = absSeconds % 60;
  const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return isNegative ? `-${timeStr}` : timeStr;
}

export function TimerDisplay({ isCollapsed, onToggleCollapse }: TimerDisplayProps) {
  const dispatch = useAppDispatch();
  const { mode, remaining, isRunning, focusDuration, breakDuration } = useAppSelector((state) => state.timer);
  const quests = useAppSelector((state) => state.quests.items);
  const progress = useAppSelector((state) => state.progress);
  const completingIds = useAppSelector((state) => state.quests.completingIds);
  
  const activeQuest = quests.find((q) => q.status === 'active');
  const isQuestCompleting = activeQuest ? completingIds.includes(activeQuest.id) : false;
  
  // Check if active quest can be completed
  const childQuests = activeQuest ? quests.filter((q) => q.parentId === activeQuest.id) : [];
  const hasIncompleteChildren = childQuests.some((q) => q.status !== 'done');
  const isSubquest = activeQuest?.parentId !== null;
  const canCompleteQuest = activeQuest && (!hasIncompleteChildren || isSubquest);

  // Find parent quest if this is a subquest
  const parentQuest = isSubquest && activeQuest
    ? quests.find((q) => q.id === activeQuest.parentId)
    : null;

  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('');
  const [isQuestChecked, setIsQuestChecked] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset checked state when active quest changes
  useEffect(() => {
    setIsQuestChecked(false);
  }, [activeQuest?.id]);

  const handleTick = useCallback(() => {
    dispatch(tick());
  }, [dispatch]);

  useInterval(handleTick, isRunning ? 1000 : null);

  const handleCompleteQuest = () => {
    if (!activeQuest || !canCompleteQuest) return;

    setIsQuestChecked(true);
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

  const handleClick = () => {
    if (showDurationPicker) return;
    dispatch(toggle());
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    dispatch(reset());
  };

  const handleTimeDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isRunning && (mode === 'idle' || mode === 'focus')) {
      setShowDurationPicker(true);
      setCustomMinutes(String(Math.floor(focusDuration / 60)));
    } else if (!isRunning && mode === 'break') {
      setShowDurationPicker(true);
      setCustomMinutes(String(Math.floor(breakDuration / 60)));
    }
  };

  const handleSelectDuration = (minutes: number) => {
    if (mode === 'break') {
      dispatch(setBreakDuration(minutes));
    } else {
      dispatch(setFocusDuration(minutes));
    }
    setShowDurationPicker(false);
  };

  const handleCustomSubmit = () => {
    const minutes = parseInt(customMinutes, 10);
    if (!isNaN(minutes) && minutes > 0 && minutes <= 180) {
      handleSelectDuration(minutes);
    }
    setShowDurationPicker(false);
  };

  const handleCustomKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCustomSubmit();
    } else if (e.key === 'Escape') {
      setShowDurationPicker(false);
    }
  };

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowDurationPicker(false);
      }
    };
    if (showDurationPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      inputRef.current?.focus();
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDurationPicker]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.code === 'Space') {
        e.preventDefault();
        dispatch(toggle());
      }
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyR') {
        e.preventDefault();
        dispatch(reset());
      }
    },
    [dispatch]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Resize window on collapse/expand
  const handleToggleCollapse = async () => {
    try {
      const appWindow = getCurrentWindow();
      const size = isCollapsed ? EXPANDED_SIZE : COLLAPSED_SIZE;
      await appWindow.setSize(new LogicalSize(size.width, size.height));
    } catch (error) {
      console.error('Failed to resize window:', error);
    }
    onToggleCollapse();
  };

  const modeColors = {
    idle: 'text-[var(--color-muted-strong)]',
    focus: 'text-[var(--color-focus)]',
    break: 'text-[var(--color-break)]',
  };

  const modeBgColors = {
    idle: 'bg-[var(--color-muted)]/8',
    focus: 'bg-[var(--color-focus)]/8',
    break: 'bg-[var(--color-break)]/8',
  };

  const isOverrun = remaining < 0;
  const canEditDuration = !isRunning;

  return (
    <div className={`flex flex-col items-center px-4 ${isCollapsed ? 'py-2' : 'py-3'} relative`}>
      {/* Timer Display - Clickable - fixed size */}
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={`
          group relative w-full rounded-[var(--radius-md)] transition-all duration-200
          ${modeBgColors[mode]}
          flex items-center justify-center
          h-[72px]
          hover:scale-[1.01]
          active:scale-[0.99]
          focus:outline-none
        `}
        title="Click to start/pause, right-click to reset"
      >
        {/* Time Display - vertically centered */}
        <div
          onDoubleClick={handleTimeDoubleClick}
          className={`
            font-mono font-semibold tracking-tight leading-none
            ${modeColors[mode]}
            ${isOverrun ? 'animate-pulse' : ''}
            text-5xl
            transition-all duration-200
            ${canEditDuration ? 'cursor-pointer hover:opacity-80' : ''}
          `}
          title={canEditDuration ? 'Double-click to set duration' : undefined}
        >
          {formatTime(remaining)}
        </div>
      </button>

      {/* Duration Picker Dropdown */}
      {showDurationPicker && (
        <div
          ref={pickerRef}
          className="absolute top-[85px] z-50 bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-lg p-2 min-w-[180px]"
        >
          <div className="text-[10px] text-[var(--color-muted-strong)] uppercase tracking-wider mb-2 px-2">
            {mode === 'break' ? 'Break Duration' : 'Focus Duration'}
          </div>
          
          {/* Preset durations */}
          <div className="grid grid-cols-2 gap-1 mb-2">
            {PRESET_DURATIONS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => handleSelectDuration(preset.value)}
                className={`
                  px-3 py-1.5 text-xs rounded-[var(--radius-sm)] transition-colors
                  ${(mode === 'break' ? breakDuration : focusDuration) === preset.value * 60
                    ? 'bg-[var(--color-focus)] text-white'
                    : 'hover:bg-[var(--color-surface)] text-[var(--color-text-secondary)]'
                  }
                `}
              >
                {preset.label}
              </button>
            ))}
          </div>
          
          {/* Custom input */}
          <div className="flex items-center gap-2 px-2 pt-2 border-t border-[var(--color-border)]">
            <input
              ref={inputRef}
              type="number"
              min="1"
              max="180"
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              onKeyDown={handleCustomKeyDown}
              placeholder="Custom"
              className="w-16 px-2 py-1 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-xs)] text-[var(--color-text)] outline-none focus:border-[var(--color-focus)]"
            />
            <span className="text-xs text-[var(--color-muted)]">min</span>
            <button
              onClick={handleCustomSubmit}
              className="ml-auto px-2 py-1 text-xs bg-[var(--color-focus)] text-white rounded-[var(--radius-xs)] hover:opacity-90 transition-opacity"
            >
              Set
            </button>
          </div>
        </div>
      )}

      {/* Compact Current Quest (collapsed view only) */}
      {isCollapsed && (
        <div className="w-full mt-3 bg-[var(--color-surface)] rounded-[var(--radius-sm)] p-2">
          {activeQuest ? (
            <>
              {/* Show parent context if this is a subquest */}
              {parentQuest && (
                <div className="text-[9px] text-[var(--color-muted)] mb-1 truncate">
                  Part of: <span className="text-[var(--color-text-secondary)]">{parentQuest.title}</span>
                </div>
              )}
              <div className={`flex items-center gap-2 ${isQuestCompleting ? 'quest-completing quest-completed-fade' : ''}`}>
                <button
                  onClick={handleCompleteQuest}
                  disabled={isQuestCompleting || !canCompleteQuest}
                  className={`quest-checkbox shrink-0 ${isQuestChecked ? 'checked' : ''} ${!canCompleteQuest ? 'disabled' : ''}`}
                  title={canCompleteQuest ? 'Mark complete' : 'Complete all sub-quests first'}
                >
                  <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
                <span className="text-sm text-[var(--color-text)] truncate flex-1">
                  {activeQuest.title}
                </span>
              </div>
            </>
          ) : (
            <span className="text-xs text-[var(--color-muted)] italic">
              No active quest
            </span>
          )}
        </div>
      )}

      {/* Collapse/Expand Toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleToggleCollapse();
        }}
        className="mt-2 p-1.5 rounded-full hover:bg-[var(--color-surface)] transition-colors"
        title={isCollapsed ? 'Expand' : 'Collapse'}
      >
        <svg
          className={`w-4 h-4 text-[var(--color-muted-strong)] transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>
  );
}
