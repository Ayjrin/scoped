import { useState, useRef, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { addQuest, promoteToActive, reorderQuests, persistQuests } from '../slice';
import { QuestItem } from './QuestItem';
import type { Quest } from '../slice';

export function QuestLog() {
  const dispatch = useAppDispatch();
  const quests = useAppSelector((state) => state.quests.items);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [isAddingQuest, setIsAddingQuest] = useState(false);
  const [newQuestTitle, setNewQuestTitle] = useState('');
  const [isSubQuest, setIsSubQuest] = useState(false);
  const [addingSubquestTo, setAddingSubquestTo] = useState<string | null>(null);
  const [subquestTitle, setSubquestTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const subquestInputRef = useRef<HTMLInputElement>(null);

  // Filter quests - show queued and completed subquests (for muted display)
  const queuedQuests = quests
    .filter((q) => q.status === 'queued')
    .sort((a, b) => a.order - b.order);

  // Group quests with their sub-quests
  const parentQuests = queuedQuests.filter((q) => q.parentId === null);
  
  // Get subquests including completed ones (for muted display)
  const getSubQuests = (parentId: string) => {
    const queuedSubs = queuedQuests.filter((q) => q.parentId === parentId);
    const completedSubs = quests.filter((q) => q.parentId === parentId && q.status === 'done');
    return [...queuedSubs, ...completedSubs].sort((a, b) => a.order - b.order);
  };

  // Find the last queued parent quest for sub-quest creation
  const lastParentQuest = parentQuests[parentQuests.length - 1];

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (isAddingQuest && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAddingQuest]);

  // Focus subquest input when adding subquest to specific parent
  useEffect(() => {
    if (addingSubquestTo && subquestInputRef.current) {
      subquestInputRef.current.focus();
    }
  }, [addingSubquestTo]);

  // Listen for keyboard shortcut to add quest
  useEffect(() => {
    const handleTriggerAdd = () => {
      setIsAddingQuest(true);
      setIsSubQuest(false);
      setNewQuestTitle('');
    };
    
    window.addEventListener('trigger-add-quest', handleTriggerAdd);
    return () => window.removeEventListener('trigger-add-quest', handleTriggerAdd);
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      dispatch(reorderQuests({ fromId: active.id as string, toId: over.id as string }));
      
      // Persist the reordered quests
      const fromIndex = quests.findIndex((q) => q.id === active.id);
      const toIndex = quests.findIndex((q) => q.id === over.id);
      
      if (fromIndex !== -1 && toIndex !== -1) {
        const newQuests = [...quests];
        const [moved] = newQuests.splice(fromIndex, 1);
        newQuests.splice(toIndex, 0, moved);
        newQuests.forEach((q, i) => {
          q.order = i;
        });
        dispatch(persistQuests(newQuests));
      }
    }
  };

  const handleStartAdd = () => {
    setIsAddingQuest(true);
    setIsSubQuest(false);
    setNewQuestTitle('');
  };

  const handleSave = () => {
    if (newQuestTitle.trim()) {
      dispatch(
        addQuest({
          title: newQuestTitle.trim(),
          parentId: isSubQuest && lastParentQuest ? lastParentQuest.id : null,
        })
      );
      
      // Auto-persist after adding
      const newQuest: Quest = {
        id: crypto.randomUUID(),
        title: newQuestTitle.trim(),
        status: 'queued',
        parentId: isSubQuest && lastParentQuest ? lastParentQuest.id : null,
        order: quests.length,
        createdAt: Date.now(),
      };
      dispatch(persistQuests([...quests, newQuest]));
      
      // Reset for next add
      setNewQuestTitle('');
      // Keep input open for chain-adding
    } else {
      setIsAddingQuest(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsAddingQuest(false);
      setNewQuestTitle('');
    } else if (e.key === 'Tab' && newQuestTitle.trim() === '') {
      e.preventDefault();
      // Toggle sub-quest mode with Tab
      setIsSubQuest(!isSubQuest);
    }
  };

  const handlePromote = (id: string) => {
    dispatch(promoteToActive(id));
    const updatedQuests = quests.map((q) => {
      if (q.status === 'active') return { ...q, status: 'queued' as const };
      if (q.id === id) return { ...q, status: 'active' as const };
      return q;
    });
    dispatch(persistQuests(updatedQuests));
  };

  const handleStartAddSubquest = (parentId: string) => {
    setAddingSubquestTo(parentId);
    setSubquestTitle('');
  };

  const handleSaveSubquest = () => {
    if (subquestTitle.trim() && addingSubquestTo) {
      dispatch(
        addQuest({
          title: subquestTitle.trim(),
          parentId: addingSubquestTo,
        })
      );
      
      // Auto-persist after adding
      const newQuest: Quest = {
        id: crypto.randomUUID(),
        title: subquestTitle.trim(),
        status: 'queued',
        parentId: addingSubquestTo,
        order: quests.length,
        createdAt: Date.now(),
      };
      dispatch(persistQuests([...quests, newQuest]));
      
      // Reset for next add - keep input open for chain-adding
      setSubquestTitle('');
    } else {
      setAddingSubquestTo(null);
    }
  };

  const handleSubquestKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveSubquest();
    } else if (e.key === 'Escape') {
      setAddingSubquestTo(null);
      setSubquestTitle('');
    }
  };

  // Get all sortable item IDs (only queued items can be sorted)
  const sortableIds = parentQuests.flatMap((parent) => [
    parent.id,
    ...queuedQuests.filter((q) => q.parentId === parent.id).map((sub) => sub.id),
  ]);

  return (
    <div className="h-full flex flex-col min-h-0 px-3 py-2">
      <div className="text-[10px] font-semibold text-[var(--color-muted-strong)] uppercase tracking-wider px-2 mb-2 shrink-0">
        Quest Log
      </div>

      {/* Quest list with drag and drop - scrollable */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-y-auto space-y-0.5 min-h-0 scrollbar-thin">
          {parentQuests.length === 0 && !isAddingQuest ? (
            <div className="text-xs text-[var(--color-muted)]/60 italic px-2 py-2">
              No quests yet
            </div>
          ) : (
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              {parentQuests.map((quest) => (
                <div key={quest.id}>
                  <QuestItem
                    quest={quest}
                    isSubQuest={false}
                    isDragging={activeId === quest.id}
                    onPromote={() => handlePromote(quest.id)}
                    onAddSubquest={() => handleStartAddSubquest(quest.id)}
                  />
                  {/* Sub-quests (including completed ones shown muted) */}
                  {getSubQuests(quest.id).map((subQuest) => (
                    <QuestItem
                      key={subQuest.id}
                      quest={subQuest}
                      isSubQuest={true}
                      isDragging={activeId === subQuest.id}
                      onPromote={() => handlePromote(subQuest.id)}
                    />
                  ))}
                  {/* Inline subquest input */}
                  {addingSubquestTo === quest.id && (
                    <div className="flex items-center gap-2 py-1.5 px-2 ml-5">
                      <span className="text-[var(--color-focus)] text-xs">+</span>
                      <input
                        ref={subquestInputRef}
                        type="text"
                        value={subquestTitle}
                        onChange={(e) => setSubquestTitle(e.target.value)}
                        onBlur={() => {
                          if (!subquestTitle.trim()) {
                            setAddingSubquestTo(null);
                          }
                        }}
                        onKeyDown={handleSubquestKeyDown}
                        placeholder="Add sub-quest..."
                        className="flex-1 bg-transparent text-xs text-[var(--color-text)] placeholder:text-[var(--color-muted)]/50 outline-none border-b border-[var(--color-focus)]/40"
                      />
                    </div>
                  )}
                </div>
              ))}
            </SortableContext>
          )}
        </div>

        {/* No drag overlay - just use CSS to show dragging state */}
      </DndContext>

      {/* Ghost quest input / Add quest button - always visible at bottom */}
      <div className="mt-2 px-2 shrink-0 border-t border-[var(--color-border)]/30 pt-2">
        {isAddingQuest ? (
          <div className={`flex items-center gap-2 ${isSubQuest ? 'ml-5' : ''}`}>
            <span className="text-[var(--color-muted-strong)] text-xs">+</span>
            <input
              ref={inputRef}
              type="text"
              value={newQuestTitle}
              onChange={(e) => setNewQuestTitle(e.target.value)}
              onBlur={() => {
                if (!newQuestTitle.trim()) {
                  setIsAddingQuest(false);
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder={isSubQuest ? 'Add sub-quest...' : 'Add quest...'}
              className="flex-1 bg-transparent text-xs text-[var(--color-text)] placeholder:text-[var(--color-muted)]/50 outline-none border-b border-[var(--color-focus)]/40"
            />
          </div>
        ) : (
          <button
            onClick={handleStartAdd}
            className="flex items-center gap-2 text-xs text-[var(--color-muted-strong)]/70 hover:text-[var(--color-text-secondary)] transition-colors w-full py-1"
          >
            <span>+</span>
            <span>Add quest...</span>
          </button>
        )}
      </div>
    </div>
  );
}
