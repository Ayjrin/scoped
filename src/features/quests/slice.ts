import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { loadQuests, saveQuests } from '../../shared/lib/storage';

export type QuestStatus = 'active' | 'queued' | 'done';

export interface Quest {
  id: string;
  title: string;
  status: QuestStatus;
  parentId: string | null;
  order: number;
  createdAt: number;
  completedAt?: number;
}

interface LastCompletedAction {
  questId: string;
  wasSubquest: boolean;
  childIds: string[];
  previousStatus: QuestStatus;
}

interface QuestsState {
  items: Quest[];
  loading: boolean;
  error: string | null;
  completingIds: string[]; // Track quests currently animating completion
  lastCompletedAction: LastCompletedAction | null; // For undo functionality
}

const initialState: QuestsState = {
  items: [],
  loading: false,
  error: null,
  completingIds: [],
  lastCompletedAction: null,
};

export const fetchQuests = createAsyncThunk('quests/fetch', async () => {
  return await loadQuests();
});

export const persistQuests = createAsyncThunk(
  'quests/persist',
  async (quests: Quest[]) => {
    await saveQuests(quests);
    return quests;
  }
);

const questsSlice = createSlice({
  name: 'quests',
  initialState,
  reducers: {
    addQuest(state, action: PayloadAction<{ title: string; parentId?: string | null }>) {
      const { title, parentId = null } = action.payload;
      const newQuest: Quest = {
        id: crypto.randomUUID(),
        title,
        status: 'queued',
        parentId,
        order: state.items.length,
        createdAt: Date.now(),
      };
      state.items.push(newQuest);
    },
    updateQuest(state, action: PayloadAction<{ id: string; title: string }>) {
      const quest = state.items.find((q) => q.id === action.payload.id);
      if (quest) {
        quest.title = action.payload.title;
      }
    },
    deleteQuest(state, action: PayloadAction<string>) {
      state.items = state.items.filter((q) => q.id !== action.payload && q.parentId !== action.payload);
    },
    promoteToActive(state, action: PayloadAction<string>) {
      // First, demote current active quest
      const currentActive = state.items.find((q) => q.status === 'active');
      if (currentActive) {
        currentActive.status = 'queued';
      }
      // Then promote the selected quest
      const quest = state.items.find((q) => q.id === action.payload);
      if (quest) {
        quest.status = 'active';
      }
    },
    startCompleting(state, action: PayloadAction<string>) {
      if (!state.completingIds.includes(action.payload)) {
        state.completingIds.push(action.payload);
      }
    },
    completeQuest(state, action: PayloadAction<string>) {
      const quest = state.items.find((q) => q.id === action.payload);
      if (quest) {
        // Store the last action for undo
        const childIds = state.items
          .filter((q) => q.parentId === action.payload && q.status !== 'done')
          .map((q) => q.id);
        
        state.lastCompletedAction = {
          questId: action.payload,
          wasSubquest: quest.parentId !== null,
          childIds,
          previousStatus: quest.status,
        };

        quest.status = 'done';
        quest.completedAt = Date.now();
      }
      // Also complete sub-quests
      state.items
        .filter((q) => q.parentId === action.payload)
        .forEach((q) => {
          q.status = 'done';
          q.completedAt = Date.now();
        });
      // Remove from completing
      state.completingIds = state.completingIds.filter((id) => id !== action.payload);

      // Auto-promote next quest
      // Helper to safely promote a quest (demotes any existing active first)
      const promoteQuest = (questToPromote: Quest) => {
        // First demote any currently active quest
        const currentActive = state.items.find((q) => q.status === 'active');
        if (currentActive) {
          currentActive.status = 'queued';
        }
        questToPromote.status = 'active';
      };

      // First, check if completed quest was a subquest - if so, promote next sibling subquest
      if (quest?.parentId) {
        const nextSubquest = state.items.find(
          (q) => q.parentId === quest.parentId && q.status === 'queued'
        );
        if (nextSubquest) {
          promoteQuest(nextSubquest);
          return;
        }
        // No more subquests - find next top-level quest (parent is likely already done or we need next quest)
      }

      // Find the next top-level queued quest (by order)
      // Exclude the parent of the just-completed subquest, since all its subquests are done
      const nextQuest = state.items
        .filter((q) => q.status === 'queued' && q.parentId === null && q.id !== quest?.parentId)
        .sort((a, b) => a.order - b.order)[0];
      
      if (nextQuest) {
        // Check if this quest has subquests - if so, promote the first subquest only
        const firstSubquest = state.items.find(
          (q) => q.parentId === nextQuest.id && q.status === 'queued'
        );
        if (firstSubquest) {
          // Promote only the subquest (it represents the actual work)
          promoteQuest(firstSubquest);
        } else {
          // No subquests, promote the parent quest itself
          promoteQuest(nextQuest);
        }
      }
    },
    undoCompleteQuest(state) {
      const lastAction = state.lastCompletedAction;
      if (!lastAction) return;

      // Restore the main quest
      const quest = state.items.find((q) => q.id === lastAction.questId);
      if (quest) {
        quest.status = lastAction.previousStatus;
        delete quest.completedAt;
      }

      // Restore child quests that were completed as part of this action
      lastAction.childIds.forEach((childId) => {
        const child = state.items.find((q) => q.id === childId);
        if (child) {
          child.status = 'queued';
          delete child.completedAt;
        }
      });

      // Clear the last action
      state.lastCompletedAction = null;
    },
    clearLastAction(state) {
      state.lastCompletedAction = null;
    },
    restoreQuest(state, action: PayloadAction<string>) {
      const quest = state.items.find((q) => q.id === action.payload);
      if (quest) {
        quest.status = 'queued';
        delete quest.completedAt;
        // Sub-quests keep their current status - they'll show muted if completed
      }
    },
    reorderQuests(state, action: PayloadAction<{ fromId: string; toId: string }>) {
      const { fromId, toId } = action.payload;
      const fromIndex = state.items.findIndex((q) => q.id === fromId);
      const toIndex = state.items.findIndex((q) => q.id === toId);
      
      if (fromIndex !== -1 && toIndex !== -1) {
        const [moved] = state.items.splice(fromIndex, 1);
        state.items.splice(toIndex, 0, moved);
        state.items.forEach((q, i) => {
          q.order = i;
        });
      }
    },
    setQuests(state, action: PayloadAction<Quest[]>) {
      state.items = action.payload;
    },
    // Move quest UP in hierarchy (subquest → top-level, or to grandparent)
    moveQuestUpHierarchy(state, action: PayloadAction<string>) {
      const quest = state.items.find((q) => q.id === action.payload);
      if (!quest || quest.parentId === null) return; // Already top-level
      
      // Get the parent to find grandparent
      const parent = state.items.find((q) => q.id === quest.parentId);
      // Set to grandparent (or null if parent was top-level)
      quest.parentId = parent?.parentId ?? null;
    },
    // Move quest DOWN in hierarchy (make it a subquest of the previous sibling)
    moveQuestDownHierarchy(state, action: PayloadAction<string>) {
      const quest = state.items.find((q) => q.id === action.payload);
      if (!quest) return;
      
      // Find quests at the same level (same parentId), sorted by order
      const siblings = state.items
        .filter((q) => q.parentId === quest.parentId && q.id !== quest.id && q.status !== 'done')
        .sort((a, b) => a.order - b.order);
      
      // Find the previous sibling (the one that would be visually above this quest)
      const questIndex = state.items.findIndex((q) => q.id === quest.id);
      const previousSibling = siblings
        .filter((s) => state.items.findIndex((q) => q.id === s.id) < questIndex)
        .pop();
      
      if (previousSibling) {
        // Make this quest a subquest of the previous sibling
        quest.parentId = previousSibling.id;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchQuests.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchQuests.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchQuests.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to load quests';
      });
  },
});

export const {
  addQuest,
  updateQuest,
  deleteQuest,
  promoteToActive,
  startCompleting,
  completeQuest,
  undoCompleteQuest,
  clearLastAction,
  restoreQuest,
  reorderQuests,
  setQuests,
  moveQuestUpHierarchy,
  moveQuestDownHierarchy,
} = questsSlice.actions;

export default questsSlice.reducer;
