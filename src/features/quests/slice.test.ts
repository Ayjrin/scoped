import { describe, it, expect } from 'vitest';
import questsReducer, {
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
  type Quest,
  type QuestStatus,
} from './slice';

// Helper to create a quest with defaults
function createQuest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: crypto.randomUUID(),
    title: 'Test Quest',
    status: 'queued' as QuestStatus,
    parentId: null,
    order: 0,
    createdAt: Date.now(),
    ...overrides,
  };
}

// Helper to create initial state
function createInitialState(quests: Quest[] = []) {
  return {
    items: quests,
    loading: false,
    error: null,
    completingIds: [] as string[],
    lastCompletedAction: null as null | {
      questId: string;
      wasSubquest: boolean;
      childIds: string[];
      previousStatus: QuestStatus;
    },
  };
}

describe('quests slice', () => {
  // =========================================================================
  // addQuest Tests
  // =========================================================================
  describe('addQuest', () => {
    it('creates a quest with correct defaults', () => {
      const state = createInitialState();
      const result = questsReducer(state, addQuest({ title: 'New Quest' }));

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        title: 'New Quest',
        status: 'queued',
        parentId: null,
        order: 0,
      });
      expect(result.items[0].id).toBeDefined();
      expect(result.items[0].createdAt).toBeDefined();
    });

    it('sets parentId when provided', () => {
      const parentId = 'parent-123';
      const state = createInitialState();
      const result = questsReducer(state, addQuest({ title: 'Subquest', parentId }));

      expect(result.items[0].parentId).toBe(parentId);
    });

    it('assigns incremental order based on existing items', () => {
      const existingQuest = createQuest({ order: 0 });
      const state = createInitialState([existingQuest]);
      const result = questsReducer(state, addQuest({ title: 'Second Quest' }));

      expect(result.items[1].order).toBe(1);
    });

    it('handles null parentId explicitly', () => {
      const state = createInitialState();
      const result = questsReducer(state, addQuest({ title: 'Quest', parentId: null }));

      expect(result.items[0].parentId).toBeNull();
    });
  });

  // =========================================================================
  // updateQuest Tests
  // =========================================================================
  describe('updateQuest', () => {
    it('updates the title of an existing quest', () => {
      const quest = createQuest({ title: 'Original' });
      const state = createInitialState([quest]);
      const result = questsReducer(state, updateQuest({ id: quest.id, title: 'Updated' }));

      expect(result.items[0].title).toBe('Updated');
    });

    it('does nothing if quest is not found', () => {
      const quest = createQuest();
      const state = createInitialState([quest]);
      const result = questsReducer(state, updateQuest({ id: 'nonexistent', title: 'Updated' }));

      expect(result.items[0].title).toBe(quest.title);
    });
  });

  // =========================================================================
  // promoteToActive Tests
  // =========================================================================
  describe('promoteToActive', () => {
    it('promotes a quest to active status', () => {
      const quest = createQuest({ status: 'queued' });
      const state = createInitialState([quest]);
      const result = questsReducer(state, promoteToActive(quest.id));

      expect(result.items[0].status).toBe('active');
    });

    it('demotes existing active quest to queued', () => {
      const activeQuest = createQuest({ id: 'active-1', status: 'active' });
      const queuedQuest = createQuest({ id: 'queued-1', status: 'queued' });
      const state = createInitialState([activeQuest, queuedQuest]);
      const result = questsReducer(state, promoteToActive(queuedQuest.id));

      expect(result.items.find((q) => q.id === 'active-1')?.status).toBe('queued');
      expect(result.items.find((q) => q.id === 'queued-1')?.status).toBe('active');
    });

    it('handles case when no active quest exists', () => {
      const quest = createQuest({ status: 'queued' });
      const state = createInitialState([quest]);
      const result = questsReducer(state, promoteToActive(quest.id));

      expect(result.items[0].status).toBe('active');
    });

    it('does nothing if quest is not found', () => {
      const quest = createQuest({ status: 'queued' });
      const state = createInitialState([quest]);
      const result = questsReducer(state, promoteToActive('nonexistent'));

      expect(result.items[0].status).toBe('queued');
    });
  });

  // =========================================================================
  // startCompleting Tests
  // =========================================================================
  describe('startCompleting', () => {
    it('adds quest id to completingIds', () => {
      const quest = createQuest();
      const state = createInitialState([quest]);
      const result = questsReducer(state, startCompleting(quest.id));

      expect(result.completingIds).toContain(quest.id);
    });

    it('does not duplicate ids if already completing', () => {
      const quest = createQuest();
      const state = createInitialState([quest]);
      state.completingIds = [quest.id];
      const result = questsReducer(state, startCompleting(quest.id));

      expect(result.completingIds.filter((id) => id === quest.id)).toHaveLength(1);
    });
  });

  // =========================================================================
  // completeQuest Tests (likely bug area)
  // =========================================================================
  describe('completeQuest', () => {
    it('marks quest as done with completedAt timestamp', () => {
      const quest = createQuest({ status: 'active' });
      const state = createInitialState([quest]);
      const result = questsReducer(state, completeQuest(quest.id));

      expect(result.items[0].status).toBe('done');
      expect(result.items[0].completedAt).toBeDefined();
    });

    it('completes all child subquests when completing parent', () => {
      const parent = createQuest({ id: 'parent', status: 'active' });
      const child1 = createQuest({ id: 'child-1', parentId: 'parent', status: 'queued' });
      const child2 = createQuest({ id: 'child-2', parentId: 'parent', status: 'queued' });
      const state = createInitialState([parent, child1, child2]);
      const result = questsReducer(state, completeQuest('parent'));

      expect(result.items.every((q) => q.status === 'done')).toBe(true);
      expect(result.items.every((q) => q.completedAt !== undefined)).toBe(true);
    });

    it('removes quest from completingIds', () => {
      const quest = createQuest({ status: 'active' });
      const state = createInitialState([quest]);
      state.completingIds = [quest.id];
      const result = questsReducer(state, completeQuest(quest.id));

      expect(result.completingIds).not.toContain(quest.id);
    });

    it('stores lastCompletedAction for undo', () => {
      const quest = createQuest({ id: 'test-quest', status: 'active' });
      const state = createInitialState([quest]);
      const result = questsReducer(state, completeQuest(quest.id));

      expect(result.lastCompletedAction).toEqual({
        questId: 'test-quest',
        wasSubquest: false,
        childIds: [],
        previousStatus: 'active',
      });
    });

    it('stores childIds in lastCompletedAction', () => {
      const parent = createQuest({ id: 'parent', status: 'active' });
      const child = createQuest({ id: 'child', parentId: 'parent', status: 'queued' });
      const state = createInitialState([parent, child]);
      const result = questsReducer(state, completeQuest('parent'));

      expect(result.lastCompletedAction?.childIds).toContain('child');
    });

    // Auto-promotion tests (key area to investigate for bugs)
    describe('auto-promotion logic', () => {
      it('promotes next sibling subquest after completing a subquest', () => {
        const parent = createQuest({ id: 'parent', status: 'queued', order: 0 });
        const sub1 = createQuest({ id: 'sub1', parentId: 'parent', status: 'active', order: 1 });
        const sub2 = createQuest({ id: 'sub2', parentId: 'parent', status: 'queued', order: 2 });
        const state = createInitialState([parent, sub1, sub2]);
        const result = questsReducer(state, completeQuest('sub1'));

        expect(result.items.find((q) => q.id === 'sub1')?.status).toBe('done');
        expect(result.items.find((q) => q.id === 'sub2')?.status).toBe('active');
      });

      it('promotes next top-level quest after completing last subquest', () => {
        const parent1 = createQuest({ id: 'parent1', status: 'queued', order: 0 });
        const sub1 = createQuest({ id: 'sub1', parentId: 'parent1', status: 'active', order: 1 });
        const parent2 = createQuest({ id: 'parent2', status: 'queued', order: 2 });
        const state = createInitialState([parent1, sub1, parent2]);
        const result = questsReducer(state, completeQuest('sub1'));

        // After completing last subquest of parent1, should promote parent2
        expect(result.items.find((q) => q.id === 'sub1')?.status).toBe('done');
        expect(result.items.find((q) => q.id === 'parent2')?.status).toBe('active');
      });

      it('promotes first subquest of next parent when completing last subquest and next parent has subquests', () => {
        const parent1 = createQuest({ id: 'parent1', status: 'queued', order: 0 });
        const sub1 = createQuest({ id: 'sub1', parentId: 'parent1', status: 'active', order: 1 });
        const parent2 = createQuest({ id: 'parent2', status: 'queued', order: 2 });
        const sub2 = createQuest({ id: 'sub2', parentId: 'parent2', status: 'queued', order: 3 });
        const state = createInitialState([parent1, sub1, parent2, sub2]);
        const result = questsReducer(state, completeQuest('sub1'));

        // After completing last subquest of parent1, should promote sub2 (first subquest of parent2)
        expect(result.items.find((q) => q.id === 'sub1')?.status).toBe('done');
        expect(result.items.find((q) => q.id === 'sub2')?.status).toBe('active');
        // parent2 should remain queued (its subquest is active)
        expect(result.items.find((q) => q.id === 'parent2')?.status).toBe('queued');
      });

      it('handles empty queue gracefully after completion', () => {
        const quest = createQuest({ id: 'only-quest', status: 'active' });
        const state = createInitialState([quest]);
        const result = questsReducer(state, completeQuest('only-quest'));

        expect(result.items[0].status).toBe('done');
        // No active quest, no error
        expect(result.items.filter((q) => q.status === 'active')).toHaveLength(0);
      });

      it('does not promote already completed quests', () => {
        const quest1 = createQuest({ id: 'q1', status: 'active', order: 0 });
        const quest2 = createQuest({ id: 'q2', status: 'done', order: 1 });
        const quest3 = createQuest({ id: 'q3', status: 'queued', order: 2 });
        const state = createInitialState([quest1, quest2, quest3]);
        const result = questsReducer(state, completeQuest('q1'));

        expect(result.items.find((q) => q.id === 'q2')?.status).toBe('done');
        expect(result.items.find((q) => q.id === 'q3')?.status).toBe('active');
      });

      it('promotes top-level quest when completing a top-level quest with no subquests', () => {
        const quest1 = createQuest({ id: 'q1', status: 'active', order: 0 });
        const quest2 = createQuest({ id: 'q2', status: 'queued', order: 1 });
        const state = createInitialState([quest1, quest2]);
        const result = questsReducer(state, completeQuest('q1'));

        expect(result.items.find((q) => q.id === 'q2')?.status).toBe('active');
      });

      it('respects order when promoting next quest', () => {
        const quest1 = createQuest({ id: 'q1', status: 'active', order: 0 });
        const quest2 = createQuest({ id: 'q2', status: 'queued', order: 2 });
        const quest3 = createQuest({ id: 'q3', status: 'queued', order: 1 });
        const state = createInitialState([quest1, quest2, quest3]);
        const result = questsReducer(state, completeQuest('q1'));

        // q3 has lower order, should be promoted first
        expect(result.items.find((q) => q.id === 'q3')?.status).toBe('active');
        expect(result.items.find((q) => q.id === 'q2')?.status).toBe('queued');
      });

      it('demotes current active quest when auto-promoting', () => {
        // Edge case: if there's somehow still an active quest when auto-promoting
        const parent = createQuest({ id: 'parent', status: 'queued', order: 0 });
        const sub1 = createQuest({ id: 'sub1', parentId: 'parent', status: 'active', order: 1 });
        const sub2 = createQuest({ id: 'sub2', parentId: 'parent', status: 'queued', order: 2 });
        const state = createInitialState([parent, sub1, sub2]);
        const result = questsReducer(state, completeQuest('sub1'));

        // sub1 is done, sub2 should be active
        const activeQuests = result.items.filter((q) => q.status === 'active');
        expect(activeQuests).toHaveLength(1);
        expect(activeQuests[0].id).toBe('sub2');
      });
    });
  });

  // =========================================================================
  // undoCompleteQuest Tests
  // =========================================================================
  describe('undoCompleteQuest', () => {
    it('restores quest to previous status', () => {
      const quest = createQuest({ id: 'q1', status: 'done', completedAt: Date.now() });
      const state = createInitialState([quest]);
      state.lastCompletedAction = {
        questId: 'q1',
        wasSubquest: false,
        childIds: [],
        previousStatus: 'active',
      };
      const result = questsReducer(state, undoCompleteQuest());

      expect(result.items[0].status).toBe('active');
      expect(result.items[0].completedAt).toBeUndefined();
    });

    it('restores all child quests that were completed', () => {
      const parent = createQuest({ id: 'parent', status: 'done', completedAt: Date.now() });
      const child = createQuest({ id: 'child', parentId: 'parent', status: 'done', completedAt: Date.now() });
      const state = createInitialState([parent, child]);
      state.lastCompletedAction = {
        questId: 'parent',
        wasSubquest: false,
        childIds: ['child'],
        previousStatus: 'active',
      };
      const result = questsReducer(state, undoCompleteQuest());

      expect(result.items.find((q) => q.id === 'parent')?.status).toBe('active');
      expect(result.items.find((q) => q.id === 'child')?.status).toBe('queued');
    });

    it('clears lastCompletedAction after undo', () => {
      const quest = createQuest({ status: 'done' });
      const state = createInitialState([quest]);
      state.lastCompletedAction = {
        questId: quest.id,
        wasSubquest: false,
        childIds: [],
        previousStatus: 'active',
      };
      const result = questsReducer(state, undoCompleteQuest());

      expect(result.lastCompletedAction).toBeNull();
    });

    it('does nothing if no lastCompletedAction', () => {
      const quest = createQuest({ status: 'done' });
      const state = createInitialState([quest]);
      const result = questsReducer(state, undoCompleteQuest());

      expect(result.items[0].status).toBe('done');
    });

    it('correctly identifies wasSubquest', () => {
      const parent = createQuest({ id: 'parent', status: 'queued' });
      const subquest = createQuest({ id: 'sub', parentId: 'parent', status: 'done', completedAt: Date.now() });
      const state = createInitialState([parent, subquest]);
      state.lastCompletedAction = {
        questId: 'sub',
        wasSubquest: true,
        childIds: [],
        previousStatus: 'active',
      };
      const result = questsReducer(state, undoCompleteQuest());

      expect(result.items.find((q) => q.id === 'sub')?.status).toBe('active');
    });
  });

  // =========================================================================
  // clearLastAction Tests
  // =========================================================================
  describe('clearLastAction', () => {
    it('clears the lastCompletedAction', () => {
      const state = createInitialState();
      state.lastCompletedAction = {
        questId: 'q1',
        wasSubquest: false,
        childIds: [],
        previousStatus: 'active',
      };
      const result = questsReducer(state, clearLastAction());

      expect(result.lastCompletedAction).toBeNull();
    });
  });

  // =========================================================================
  // restoreQuest Tests
  // =========================================================================
  describe('restoreQuest', () => {
    it('restores a completed quest to queued', () => {
      const quest = createQuest({ status: 'done', completedAt: Date.now() });
      const state = createInitialState([quest]);
      const result = questsReducer(state, restoreQuest(quest.id));

      expect(result.items[0].status).toBe('queued');
      expect(result.items[0].completedAt).toBeUndefined();
    });

    it('does not change subquests status', () => {
      const parent = createQuest({ id: 'parent', status: 'done', completedAt: Date.now() });
      const child = createQuest({ id: 'child', parentId: 'parent', status: 'done', completedAt: Date.now() });
      const state = createInitialState([parent, child]);
      const result = questsReducer(state, restoreQuest('parent'));

      expect(result.items.find((q) => q.id === 'parent')?.status).toBe('queued');
      // Child status remains unchanged (per the slice comment)
      expect(result.items.find((q) => q.id === 'child')?.status).toBe('done');
    });
  });

  // =========================================================================
  // deleteQuest Tests
  // =========================================================================
  describe('deleteQuest', () => {
    it('removes quest from items', () => {
      const quest = createQuest();
      const state = createInitialState([quest]);
      const result = questsReducer(state, deleteQuest(quest.id));

      expect(result.items).toHaveLength(0);
    });

    it('cascades delete to child quests', () => {
      const parent = createQuest({ id: 'parent' });
      const child1 = createQuest({ id: 'child1', parentId: 'parent' });
      const child2 = createQuest({ id: 'child2', parentId: 'parent' });
      const unrelated = createQuest({ id: 'unrelated' });
      const state = createInitialState([parent, child1, child2, unrelated]);
      const result = questsReducer(state, deleteQuest('parent'));

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('unrelated');
    });

    it('does not delete unrelated quests', () => {
      const quest1 = createQuest({ id: 'q1' });
      const quest2 = createQuest({ id: 'q2' });
      const state = createInitialState([quest1, quest2]);
      const result = questsReducer(state, deleteQuest('q1'));

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('q2');
    });
  });

  // =========================================================================
  // reorderQuests Tests
  // =========================================================================
  describe('reorderQuests', () => {
    it('swaps positions correctly', () => {
      const quest1 = createQuest({ id: 'q1', order: 0 });
      const quest2 = createQuest({ id: 'q2', order: 1 });
      const quest3 = createQuest({ id: 'q3', order: 2 });
      const state = createInitialState([quest1, quest2, quest3]);
      const result = questsReducer(state, reorderQuests({ fromId: 'q3', toId: 'q1' }));

      // q3 should be moved to where q1 was
      expect(result.items[0].id).toBe('q3');
      expect(result.items[1].id).toBe('q1');
      expect(result.items[2].id).toBe('q2');
    });

    it('updates order property for all items', () => {
      const quest1 = createQuest({ id: 'q1', order: 0 });
      const quest2 = createQuest({ id: 'q2', order: 1 });
      const quest3 = createQuest({ id: 'q3', order: 2 });
      const state = createInitialState([quest1, quest2, quest3]);
      const result = questsReducer(state, reorderQuests({ fromId: 'q3', toId: 'q1' }));

      expect(result.items[0].order).toBe(0);
      expect(result.items[1].order).toBe(1);
      expect(result.items[2].order).toBe(2);
    });

    it('handles same from and to gracefully', () => {
      const quest = createQuest({ id: 'q1', order: 0 });
      const state = createInitialState([quest]);
      const result = questsReducer(state, reorderQuests({ fromId: 'q1', toId: 'q1' }));

      expect(result.items[0].id).toBe('q1');
    });

    it('handles nonexistent ids gracefully', () => {
      const quest = createQuest({ id: 'q1', order: 0 });
      const state = createInitialState([quest]);
      const result = questsReducer(state, reorderQuests({ fromId: 'nonexistent', toId: 'q1' }));

      expect(result.items[0].id).toBe('q1');
    });
  });

  // =========================================================================
  // setQuests Tests
  // =========================================================================
  describe('setQuests', () => {
    it('replaces all items', () => {
      const oldQuest = createQuest({ id: 'old' });
      const newQuest = createQuest({ id: 'new' });
      const state = createInitialState([oldQuest]);
      const result = questsReducer(state, setQuests([newQuest]));

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('new');
    });
  });

  // =========================================================================
  // moveQuestUpHierarchy Tests
  // =========================================================================
  describe('moveQuestUpHierarchy', () => {
    it('moves subquest to top-level', () => {
      const parent = createQuest({ id: 'parent' });
      const subquest = createQuest({ id: 'sub', parentId: 'parent' });
      const state = createInitialState([parent, subquest]);
      const result = questsReducer(state, moveQuestUpHierarchy('sub'));

      expect(result.items.find((q) => q.id === 'sub')?.parentId).toBeNull();
    });

    it('moves nested subquest to parent level', () => {
      const grandparent = createQuest({ id: 'gp' });
      const parent = createQuest({ id: 'parent', parentId: 'gp' });
      const child = createQuest({ id: 'child', parentId: 'parent' });
      const state = createInitialState([grandparent, parent, child]);
      const result = questsReducer(state, moveQuestUpHierarchy('child'));

      expect(result.items.find((q) => q.id === 'child')?.parentId).toBe('gp');
    });

    it('does nothing if already top-level', () => {
      const quest = createQuest({ id: 'q1', parentId: null });
      const state = createInitialState([quest]);
      const result = questsReducer(state, moveQuestUpHierarchy('q1'));

      expect(result.items[0].parentId).toBeNull();
    });

    it('does nothing if quest not found', () => {
      const quest = createQuest({ id: 'q1', parentId: 'parent' });
      const state = createInitialState([quest]);
      const result = questsReducer(state, moveQuestUpHierarchy('nonexistent'));

      expect(result.items[0].parentId).toBe('parent');
    });
  });

  // =========================================================================
  // moveQuestDownHierarchy Tests
  // =========================================================================
  describe('moveQuestDownHierarchy', () => {
    it('makes quest a subquest of previous sibling', () => {
      const quest1 = createQuest({ id: 'q1', order: 0 });
      const quest2 = createQuest({ id: 'q2', order: 1 });
      const state = createInitialState([quest1, quest2]);
      const result = questsReducer(state, moveQuestDownHierarchy('q2'));

      expect(result.items.find((q) => q.id === 'q2')?.parentId).toBe('q1');
    });

    it('does nothing if no previous sibling exists', () => {
      const quest = createQuest({ id: 'q1', order: 0 });
      const state = createInitialState([quest]);
      const result = questsReducer(state, moveQuestDownHierarchy('q1'));

      expect(result.items[0].parentId).toBeNull();
    });

    it('ignores completed quests as potential parents', () => {
      const quest1 = createQuest({ id: 'q1', status: 'done', order: 0 });
      const quest2 = createQuest({ id: 'q2', status: 'queued', order: 1 });
      const quest3 = createQuest({ id: 'q3', status: 'queued', order: 2 });
      const state = createInitialState([quest1, quest2, quest3]);
      const result = questsReducer(state, moveQuestDownHierarchy('q3'));

      // q1 is done, so q3 should become child of q2
      expect(result.items.find((q) => q.id === 'q3')?.parentId).toBe('q2');
    });

    it('only considers siblings at the same level', () => {
      const parent = createQuest({ id: 'parent', order: 0 });
      const sub1 = createQuest({ id: 'sub1', parentId: 'parent', order: 1 });
      const sub2 = createQuest({ id: 'sub2', parentId: 'parent', order: 2 });
      const state = createInitialState([parent, sub1, sub2]);
      const result = questsReducer(state, moveQuestDownHierarchy('sub2'));

      // sub2 should become child of sub1 (both share same parent)
      expect(result.items.find((q) => q.id === 'sub2')?.parentId).toBe('sub1');
    });

    it('does nothing if quest not found', () => {
      const quest = createQuest({ id: 'q1' });
      const state = createInitialState([quest]);
      const result = questsReducer(state, moveQuestDownHierarchy('nonexistent'));

      expect(result.items[0].parentId).toBeNull();
    });
  });

  // =========================================================================
  // Edge Cases and Regression Tests
  // =========================================================================
  describe('edge cases', () => {
    it('handles completing parent after all children are already done', () => {
      const parent = createQuest({ id: 'parent', status: 'active' });
      const child = createQuest({ id: 'child', parentId: 'parent', status: 'done', completedAt: Date.now() });
      const state = createInitialState([parent, child]);
      const result = questsReducer(state, completeQuest('parent'));

      expect(result.items.find((q) => q.id === 'parent')?.status).toBe('done');
    });

    it('handles deeply nested quest hierarchies', () => {
      const gp = createQuest({ id: 'gp', order: 0 });
      const parent = createQuest({ id: 'parent', parentId: 'gp', order: 1 });
      const child = createQuest({ id: 'child', parentId: 'parent', order: 2 });
      const state = createInitialState([gp, parent, child]);

      // Move child up twice
      let result = questsReducer(state, moveQuestUpHierarchy('child'));
      expect(result.items.find((q) => q.id === 'child')?.parentId).toBe('gp');

      result = questsReducer(result, moveQuestUpHierarchy('child'));
      expect(result.items.find((q) => q.id === 'child')?.parentId).toBeNull();
    });

    it('multiple quests can be in completingIds simultaneously', () => {
      const q1 = createQuest({ id: 'q1' });
      const q2 = createQuest({ id: 'q2' });
      const state = createInitialState([q1, q2]);
      let result = questsReducer(state, startCompleting('q1'));
      result = questsReducer(result, startCompleting('q2'));

      expect(result.completingIds).toContain('q1');
      expect(result.completingIds).toContain('q2');
    });

    it('order values can have gaps and still sort correctly', () => {
      const q1 = createQuest({ id: 'q1', status: 'active', order: 0 });
      const q2 = createQuest({ id: 'q2', status: 'queued', order: 5 });
      const q3 = createQuest({ id: 'q3', status: 'queued', order: 10 });
      const state = createInitialState([q1, q2, q3]);
      const result = questsReducer(state, completeQuest('q1'));

      // q2 has lower order than q3, should be promoted
      expect(result.items.find((q) => q.id === 'q2')?.status).toBe('active');
    });
  });
});
