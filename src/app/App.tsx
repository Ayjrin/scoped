import { useEffect, useState, useCallback, useRef } from 'react';
import { TimerDisplay } from '../features/timer/components/TimerDisplay';
import { CurrentQuest } from '../features/quests/components/CurrentQuest';
import { QuestLog } from '../features/quests/components/QuestLog';
import { CompletedQuests } from '../features/quests/components/CompletedQuests';
import { XPBar } from '../features/progress/components/XPBar';
import { TitleBar } from '../shared/components/TitleBar';
import { useAppDispatch, useAppSelector } from './hooks';
import { fetchQuests, startCompleting, completeQuest, undoCompleteQuest, persistQuests, moveQuestUpHierarchy, moveQuestDownHierarchy } from '../features/quests/slice';
import { fetchProgress, addXP, removeXP, persistProgress } from '../features/progress/slice';
import { saveQuests } from '../shared/lib/storage';
import { saveProgress } from '../shared/lib/progressStorage';

const MIN_SCALE = 0.8;
const MAX_SCALE = 1.4;
const SCALE_STEP = 0.1;

function App() {
  const dispatch = useAppDispatch();
  const quests = useAppSelector((state) => state.quests.items);
  const lastCompletedAction = useAppSelector((state) => state.quests.lastCompletedAction);
  const progress = useAppSelector((state) => state.progress);

  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('scoped_collapsed');
    return saved === 'true';
  });

  const [fontScale, setFontScale] = useState(() => {
    const saved = localStorage.getItem('scoped_font_scale');
    return saved ? parseFloat(saved) : 1;
  });

  // Refs to track latest state for save-on-close (avoids stale closure)
  const questsRef = useRef(quests);
  const progressRef = useRef(progress);
  
  useEffect(() => {
    questsRef.current = quests;
  }, [quests]);
  
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // Load quests and progress on mount
  useEffect(() => {
    dispatch(fetchQuests());
    dispatch(fetchProgress());
  }, [dispatch]);

  // Save on close - listen for Tauri window close event and browser beforeunload
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    // Setup Tauri close listener
    const setupTauriListener = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const appWindow = getCurrentWindow();
        
        unlisten = await appWindow.onCloseRequested(async (event) => {
          // Prevent the default close to handle async save first
          event.preventDefault();
          
          console.log('[Save] Window close requested, saving data...');
          
          try {
            // Save current state before closing
            await Promise.all([
              saveQuests(questsRef.current),
              saveProgress({
                currentXP: progressRef.current.currentXP,
                level: progressRef.current.level,
                totalXPEarned: progressRef.current.totalXPEarned,
              }),
            ]);
            console.log('[Save] Data saved successfully on close');
          } catch (error) {
            console.error('[Save] Failed to save on close:', error);
          }
          
          // Now destroy the window
          await appWindow.destroy();
        });
      } catch (error) {
        console.log('[Save] Not running in Tauri, using browser fallback');
      }
    };

    setupTauriListener();

    // Browser fallback (for dev mode or if Tauri listener fails)
    const handleBeforeUnload = () => {
      // Synchronous save for browser - use localStorage as fallback
      try {
        localStorage.setItem('scoped_quests', JSON.stringify(questsRef.current));
        localStorage.setItem('scoped_progress', JSON.stringify({
          currentXP: progressRef.current.currentXP,
          level: progressRef.current.level,
          totalXPEarned: progressRef.current.totalXPEarned,
        }));
        console.log('[Save] Browser fallback save completed');
      } catch (error) {
        console.error('[Save] Browser fallback save failed:', error);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (unlisten) {
        unlisten();
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Get active quest for keyboard shortcut
  const activeQuest = quests.find((q) => q.status === 'active');
  const childQuests = activeQuest ? quests.filter((q) => q.parentId === activeQuest.id) : [];
  const hasIncompleteChildren = childQuests.some((q) => q.status !== 'done');
  const isSubquest = activeQuest?.parentId !== null;
  const canCompleteActive = activeQuest && (!hasIncompleteChildren || isSubquest);

  // Handle completing the current quest via keyboard
  const handleCompleteCurrentQuest = useCallback(() => {
    if (!activeQuest || !canCompleteActive) return;

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
  }, [dispatch, activeQuest, canCompleteActive, isSubquest, progress, quests]);

  // Handle undo last quest completion
  const handleUndoCompletion = useCallback(() => {
    if (!lastCompletedAction) return;

    const { questId, wasSubquest, childIds } = lastCompletedAction;

    // Remove XP
    dispatch(removeXP({ isSubquest: wasSubquest }));
    
    // Undo the quest completion
    dispatch(undoCompleteQuest());

    // Persist the changes
    const updatedQuests = quests.map((q) => {
      if (q.id === questId) {
        const { completedAt, ...rest } = q;
        return { ...rest, status: lastCompletedAction.previousStatus };
      }
      if (childIds.includes(q.id)) {
        const { completedAt, ...rest } = q;
        return { ...rest, status: 'queued' as const };
      }
      return q;
    });
    dispatch(persistQuests(updatedQuests));

    // Persist progress
    const levelMultiplier = Math.pow(0.95, progress.level - 1);
    const baseXP = wasSubquest ? 10 : 20;
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
  }, [dispatch, lastCompletedAction, quests, progress]);

  // Persist collapse state (window resize is handled by TimerDisplay)
  useEffect(() => {
    localStorage.setItem('scoped_collapsed', String(isCollapsed));
  }, [isCollapsed]);

  // Persist and apply font scale
  useEffect(() => {
    localStorage.setItem('scoped_font_scale', String(fontScale));
    document.documentElement.style.fontSize = `${fontScale * 16}px`;
  }, [fontScale]);

  // Keyboard shortcuts for zoom and quest actions
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in an input
    const target = e.target as HTMLElement;
    const isInputActive = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    if (e.ctrlKey || e.metaKey) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setFontScale((prev) => Math.min(MAX_SCALE, prev + SCALE_STEP));
      } else if (e.key === '-') {
        e.preventDefault();
        setFontScale((prev) => Math.max(MIN_SCALE, prev - SCALE_STEP));
      } else if (e.key === '0') {
        e.preventDefault();
        setFontScale(1);
      } else if (e.key === 'n' && !isInputActive) {
        // Ctrl+N: Add quest (dispatch custom event)
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('trigger-add-quest'));
      } else if (e.key === 'd' && !isInputActive) {
        // Ctrl+D: Complete current quest
        e.preventDefault();
        handleCompleteCurrentQuest();
      } else if (e.key === 'z' && !isInputActive) {
        // Ctrl+Z: Undo last quest completion
        e.preventDefault();
        handleUndoCompletion();
      } else if (e.code === 'BracketLeft' && !isInputActive && activeQuest) {
        // Ctrl+[: Move active quest UP in hierarchy (subquest → top-level)
        e.preventDefault();
        // Only move if quest has a parent (is a subquest)
        if (activeQuest.parentId !== null) {
          dispatch(moveQuestUpHierarchy(activeQuest.id));
          // Persist with updated parentId
          const parent = quests.find((p) => p.id === activeQuest.parentId);
          const updatedQuests = quests.map((q) => {
            if (q.id === activeQuest.id) {
              return { ...q, parentId: parent?.parentId ?? null };
            }
            return q;
          });
          dispatch(persistQuests(updatedQuests));
        }
      } else if (e.code === 'BracketRight' && !isInputActive && activeQuest) {
        // Ctrl+]: Move active quest DOWN in hierarchy (→ subquest of previous sibling)
        e.preventDefault();
        // Find the previous sibling to become the new parent
        const siblings = quests
          .filter((q) => q.parentId === activeQuest.parentId && q.id !== activeQuest.id && q.status !== 'done')
          .sort((a, b) => a.order - b.order);
        const questIndex = quests.findIndex((q) => q.id === activeQuest.id);
        const previousSibling = siblings
          .filter((s) => quests.findIndex((q) => q.id === s.id) < questIndex)
          .pop();
        
        if (previousSibling) {
          dispatch(moveQuestDownHierarchy(activeQuest.id));
          // Persist with updated parentId
          const updatedQuests = quests.map((q) => {
            if (q.id === activeQuest.id) {
              return { ...q, parentId: previousSibling.id };
            }
            return q;
          });
          dispatch(persistQuests(updatedQuests));
        }
      }
    }
  }, [handleCompleteCurrentQuest, handleUndoCompletion, activeQuest, quests, dispatch]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className={`flex flex-col ${isCollapsed ? 'h-auto' : 'h-full'}`}>
      {/* Custom Title Bar */}
      <TitleBar />

      {/* Timer - Central Element */}
      <div className="no-drag shrink-0">
        <TimerDisplay isCollapsed={isCollapsed} onToggleCollapse={() => setIsCollapsed(!isCollapsed)} />
      </div>

      {/* Collapsible content - flex column with fixed XP bar at bottom */}
      {!isCollapsed && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Current Quest - fixed height */}
          <div className="no-drag shrink-0">
            <CurrentQuest />
          </div>

          {/* Quest Log - scrollable area */}
          <div className="no-drag flex-1 min-h-0 overflow-hidden">
            <QuestLog />
          </div>

          {/* Completed Quests - collapsible but fixed when visible */}
          <div className="no-drag shrink-0">
            <CompletedQuests />
          </div>

          {/* XP Bar - always at bottom */}
          <div className="no-drag shrink-0">
            <XPBar />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
