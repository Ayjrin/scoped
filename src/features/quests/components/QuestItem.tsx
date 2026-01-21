import { useState, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { updateQuest, startCompleting, completeQuest, deleteQuest, persistQuests } from '../slice';
import { addXP, persistProgress } from '../../progress/slice';
import type { Quest } from '../slice';

interface QuestItemProps {
  quest: Quest;
  isSubQuest: boolean;
  isDragging?: boolean;
  onPromote: () => void;
  onAddSubquest?: () => void;
}

export function QuestItem({ quest, isSubQuest, isDragging: isDraggingProp, onPromote, onAddSubquest }: QuestItemProps) {
  const dispatch = useAppDispatch();
  const quests = useAppSelector((state) => state.quests.items);
  const progress = useAppSelector((state) => state.progress);
  const completingIds = useAppSelector((state) => state.quests.completingIds);
  const isCompleting = completingIds.includes(quest.id);
  const isCompleted = quest.status === 'done';

  // Check if this is a parent with incomplete children
  const childQuests = quests.filter((q) => q.parentId === quest.id);
  const hasIncompleteChildren = childQuests.some((q) => q.status !== 'done');
  const canComplete = isSubQuest || !hasIncompleteChildren;

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(quest.title);
  const [isChecked, setIsChecked] = useState(isCompleted);
  const inputRef = useRef<HTMLInputElement>(null);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isDraggingSortable,
  } = useSortable({ id: quest.id, disabled: isCompleted });

  const isDragging = isDraggingProp || isDraggingSortable;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  const handleClick = () => {
    if (isCompleted) return;
    
    // Delay single click to allow double-click to cancel it
    clickTimeoutRef.current = setTimeout(() => {
      setEditValue(quest.title);
      setIsEditing(true);
    }, 200);
  };

  const handleDoubleClick = () => {
    // Cancel the single click edit
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    onPromote();
  };

  const handleSaveEdit = () => {
    if (editValue.trim() && editValue.trim() !== quest.title) {
      dispatch(updateQuest({ id: quest.id, title: editValue.trim() }));
      dispatch(persistQuests(quests.map((q) => 
        q.id === quest.id ? { ...q, title: editValue.trim() } : q
      )));
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditValue(quest.title);
    }
  };

  const handleComplete = () => {
    if (!canComplete || isCompleted) return;
    
    setIsChecked(true);
    dispatch(startCompleting(quest.id));

    // Calculate XP with level scaling (0.95^(level-1))
    const levelMultiplier = Math.pow(0.95, progress.level - 1);
    const baseXP = isSubQuest ? 10 : 20;
    const scaledXP = Math.round(baseXP * levelMultiplier);

    // After animation, complete the quest and add XP
    setTimeout(() => {
      dispatch(completeQuest(quest.id));
      dispatch(addXP({ isSubquest: isSubQuest }));
      
      // Persist both
      const updatedQuests = quests.map((q) => {
        if (q.id === quest.id) {
          return { ...q, status: 'done' as const, completedAt: Date.now() };
        }
        // If completing a parent, also complete all children
        if (!isSubQuest && q.parentId === quest.id) {
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

  const handleDelete = () => {
    dispatch(deleteQuest(quest.id));
    dispatch(persistQuests(quests.filter((q) => q.id !== quest.id && q.parentId !== quest.id)));
  };

  // If completed subquest, show muted
  if (isCompleted && isSubQuest) {
    return (
      <div className="flex items-center gap-2 py-1.5 px-2 ml-5 opacity-40">
        <div className="quest-checkbox checked">
          <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <span className="text-xs text-[var(--color-muted)] line-through">{quest.title}</span>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`
        group flex items-center gap-2 py-1.5 px-2 rounded-[var(--radius-sm)]
        hover:bg-[var(--color-surface)] transition-all duration-150
        ${isSubQuest ? 'ml-5' : ''}
        ${isDragging ? 'quest-item-dragging' : ''}
        ${isCompleting ? 'quest-completing quest-completed-fade' : ''}
      `}
    >
      {/* Drag handle */}
      <div
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity"
      >
        <svg className="w-3 h-3 text-[var(--color-muted)]" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.5" />
          <circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" />
          <circle cx="15" cy="18" r="1.5" />
        </svg>
      </div>

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

      {/* Quest title - click to edit, double-click to promote */}
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSaveEdit}
          onKeyDown={handleKeyDown}
          className="quest-inline-edit text-xs"
        />
      ) : (
        <button
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          className="flex-1 text-left text-xs text-[var(--color-text)]/80 hover:text-[var(--color-text)] transition-colors truncate"
          title="Click to edit, double-click to set as current"
        >
          {quest.title}
        </button>
      )}

      {/* Add subquest button - only for parent quests */}
      {!isSubQuest && onAddSubquest && (
        <button
          onClick={onAddSubquest}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--color-focus)]/20 text-[var(--color-muted)] hover:text-[var(--color-focus)] transition-all"
          title="Add sub-quest"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}

      {/* Delete button - visible on hover */}
      <button
        onClick={handleDelete}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/20 text-[var(--color-muted)] hover:text-red-400 transition-all"
        title="Delete quest"
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
