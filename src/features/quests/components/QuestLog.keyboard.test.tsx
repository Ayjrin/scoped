import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import questsReducer, { type Quest, type QuestStatus } from '../slice';
import progressReducer from '../../progress/slice';
import timerReducer from '../../timer/slice';
import { QuestLog } from './QuestLog';

// Helper to create a test quest
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

// Helper to create a configured store with initial state
function createTestStore(questItems: Quest[] = []) {
  return configureStore({
    reducer: {
      timer: timerReducer,
      quests: questsReducer,
      progress: progressReducer,
    },
    preloadedState: {
      quests: {
        items: questItems,
        loading: false,
        error: null,
        completingIds: [],
        lastCompletedAction: null,
      },
      progress: {
        currentXP: 0,
        level: 1,
        totalXPEarned: 0,
        showLevelUp: false,
        loading: false,
        error: null,
      },
      timer: {
        mode: 'idle' as const,
        focusDuration: 1500,
        breakDuration: 300,
        remaining: 1500,
        isRunning: false,
        sessionCount: 0,
      },
    },
  });
}

// Helper to render QuestLog with provider
function renderQuestLog(store: ReturnType<typeof createTestStore>) {
  return render(
    <Provider store={store}>
      <QuestLog />
    </Provider>
  );
}

describe('QuestLog Keyboard Shortcuts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Tab - Toggle Sub-Quest Mode
  // ===========================================================================
  describe('Tab (Toggle Sub-Quest Mode)', () => {
    it('opens add quest input when clicking the add button', async () => {
      const parentQuest = createQuest({ id: 'parent-1', title: 'Parent Quest' });
      const store = createTestStore([parentQuest]);
      renderQuestLog(store);

      const addButton = screen.getByRole('button', { name: /add quest/i });
      fireEvent.click(addButton);

      const input = await screen.findByPlaceholderText(/add quest/i);
      expect(input).toBeInTheDocument();
    });

    it('toggles to sub-quest mode when pressing Tab with empty input', async () => {
      const parentQuest = createQuest({ id: 'parent-1', title: 'Parent Quest' });
      const store = createTestStore([parentQuest]);
      renderQuestLog(store);

      // Click to open add quest input
      const addButton = screen.getByRole('button', { name: /add quest/i });
      fireEvent.click(addButton);

      const input = await screen.findByPlaceholderText('Add quest...');
      expect(input).toBeInTheDocument();

      // Press Tab with empty input
      fireEvent.keyDown(input, { key: 'Tab' });

      // Should now show sub-quest placeholder
      const subquestInput = screen.getByPlaceholderText('Add sub-quest...');
      expect(subquestInput).toBeInTheDocument();
    });

    it('toggles back to quest mode when pressing Tab again', async () => {
      const parentQuest = createQuest({ id: 'parent-1', title: 'Parent Quest' });
      const store = createTestStore([parentQuest]);
      renderQuestLog(store);

      // Click to open add quest input
      const addButton = screen.getByRole('button', { name: /add quest/i });
      fireEvent.click(addButton);

      const input = await screen.findByPlaceholderText('Add quest...');

      // Press Tab twice to toggle back
      fireEvent.keyDown(input, { key: 'Tab' });
      fireEvent.keyDown(screen.getByPlaceholderText('Add sub-quest...'), { key: 'Tab' });

      // Should be back to regular quest mode
      const questInput = screen.getByPlaceholderText('Add quest...');
      expect(questInput).toBeInTheDocument();
    });

    it('does not toggle sub-quest mode when input has text', async () => {
      const parentQuest = createQuest({ id: 'parent-1', title: 'Parent Quest' });
      const store = createTestStore([parentQuest]);
      renderQuestLog(store);

      // Click to open add quest input
      const addButton = screen.getByRole('button', { name: /add quest/i });
      fireEvent.click(addButton);

      const input = await screen.findByPlaceholderText('Add quest...');

      // Type some text
      fireEvent.change(input, { target: { value: 'My Quest' } });

      // Press Tab - should not toggle (Tab will behave normally)
      fireEvent.keyDown(input, { key: 'Tab' });

      // Should still be in quest mode (not sub-quest)
      // The input should still exist with the same placeholder
      expect(input).toHaveValue('My Quest');
    });

    it('prevents default Tab behavior when toggling sub-quest mode', async () => {
      const parentQuest = createQuest({ id: 'parent-1', title: 'Parent Quest' });
      const store = createTestStore([parentQuest]);
      renderQuestLog(store);

      const addButton = screen.getByRole('button', { name: /add quest/i });
      fireEvent.click(addButton);

      const input = await screen.findByPlaceholderText('Add quest...');

      const tabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(tabEvent, 'preventDefault');

      input.dispatchEvent(tabEvent);

      // The component should call preventDefault
      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Enter - Save Quest
  // ===========================================================================
  describe('Enter (Save Quest)', () => {
    it('saves a quest when pressing Enter with text', async () => {
      const store = createTestStore([]);
      renderQuestLog(store);

      const addButton = screen.getByRole('button', { name: /add quest/i });
      fireEvent.click(addButton);

      const input = await screen.findByPlaceholderText('Add quest...');
      fireEvent.change(input, { target: { value: 'New Quest Title' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      // Quest should be added to the store
      await waitFor(() => {
        const state = store.getState();
        expect(state.quests.items.some((q) => q.title === 'New Quest Title')).toBe(true);
      });
    });

    it('keeps input open for chain-adding after saving', async () => {
      const store = createTestStore([]);
      renderQuestLog(store);

      const addButton = screen.getByRole('button', { name: /add quest/i });
      fireEvent.click(addButton);

      const input = await screen.findByPlaceholderText('Add quest...');
      fireEvent.change(input, { target: { value: 'First Quest' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      // Input should still be visible and empty for next quest
      await waitFor(() => {
        const inputAfterSave = screen.getByPlaceholderText('Add quest...');
        expect(inputAfterSave).toBeInTheDocument();
        expect(inputAfterSave).toHaveValue('');
      });
    });

    it('closes input when pressing Enter with empty text', async () => {
      const store = createTestStore([]);
      renderQuestLog(store);

      const addButton = screen.getByRole('button', { name: /add quest/i });
      fireEvent.click(addButton);

      const input = await screen.findByPlaceholderText('Add quest...');
      fireEvent.keyDown(input, { key: 'Enter' });

      // Input should be closed (not found)
      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Add quest...')).not.toBeInTheDocument();
      });
    });

    it('creates sub-quest when in sub-quest mode', async () => {
      const parentQuest = createQuest({ id: 'parent-1', title: 'Parent Quest', order: 0 });
      const store = createTestStore([parentQuest]);
      renderQuestLog(store);

      const addButton = screen.getByRole('button', { name: /add quest/i });
      fireEvent.click(addButton);

      const input = await screen.findByPlaceholderText('Add quest...');

      // Toggle to sub-quest mode
      fireEvent.keyDown(input, { key: 'Tab' });

      const subquestInput = screen.getByPlaceholderText('Add sub-quest...');
      fireEvent.change(subquestInput, { target: { value: 'My Subquest' } });
      fireEvent.keyDown(subquestInput, { key: 'Enter' });

      await waitFor(() => {
        const state = store.getState();
        const subquest = state.quests.items.find((q) => q.title === 'My Subquest');
        expect(subquest).toBeDefined();
        expect(subquest?.parentId).toBe('parent-1');
      });
    });
  });

  // ===========================================================================
  // Escape - Cancel Adding
  // ===========================================================================
  describe('Escape (Cancel Adding)', () => {
    it('closes the input when pressing Escape', async () => {
      const store = createTestStore([]);
      renderQuestLog(store);

      const addButton = screen.getByRole('button', { name: /add quest/i });
      fireEvent.click(addButton);

      const input = await screen.findByPlaceholderText('Add quest...');
      fireEvent.keyDown(input, { key: 'Escape' });

      // Input should be closed
      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Add quest...')).not.toBeInTheDocument();
      });
    });

    it('clears the input text when pressing Escape', async () => {
      const store = createTestStore([]);
      renderQuestLog(store);

      const addButton = screen.getByRole('button', { name: /add quest/i });
      fireEvent.click(addButton);

      const input = await screen.findByPlaceholderText('Add quest...');
      fireEvent.change(input, { target: { value: 'Unsaved Quest' } });
      
      // Verify text is in input before escape
      expect(input).toHaveValue('Unsaved Quest');
      
      fireEvent.keyDown(input, { key: 'Escape' });

      // Input should be closed
      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Add quest...')).not.toBeInTheDocument();
      });
      
      // Quest should not have been added to store
      const state = store.getState();
      expect(state.quests.items).toHaveLength(0);
    });

    it('resets sub-quest mode when pressing Escape', async () => {
      const parentQuest = createQuest({ id: 'parent-1', title: 'Parent Quest' });
      const store = createTestStore([parentQuest]);
      renderQuestLog(store);

      const addButton = screen.getByRole('button', { name: /add quest/i });
      fireEvent.click(addButton);

      const input = await screen.findByPlaceholderText('Add quest...');
      fireEvent.keyDown(input, { key: 'Tab' }); // Toggle to sub-quest mode
      
      // Verify we're in sub-quest mode
      const subquestInput = screen.getByPlaceholderText('Add sub-quest...');
      expect(subquestInput).toBeInTheDocument();
      
      fireEvent.keyDown(subquestInput, { key: 'Escape' });

      // Input should be closed
      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Add sub-quest...')).not.toBeInTheDocument();
      });
      
      // No quests should have been added
      const state = store.getState();
      // Should only have the original parent quest
      expect(state.quests.items).toHaveLength(1);
      expect(state.quests.items[0].id).toBe('parent-1');
    });
  });

  // ===========================================================================
  // Trigger-add-quest Event (from Ctrl+N)
  // ===========================================================================
  describe('trigger-add-quest Event', () => {
    it('opens add quest input when receiving custom event', async () => {
      const store = createTestStore([]);
      renderQuestLog(store);

      // Dispatch the custom event (as if from Ctrl+N)
      window.dispatchEvent(new CustomEvent('trigger-add-quest'));

      const input = await screen.findByPlaceholderText('Add quest...');
      expect(input).toBeInTheDocument();
    });

    it('resets to quest mode when receiving event', async () => {
      const parentQuest = createQuest({ id: 'parent-1', title: 'Parent Quest' });
      const store = createTestStore([parentQuest]);
      renderQuestLog(store);

      // First open and toggle to sub-quest mode
      window.dispatchEvent(new CustomEvent('trigger-add-quest'));
      const input = await screen.findByPlaceholderText('Add quest...');
      fireEvent.keyDown(input, { key: 'Tab' });
      fireEvent.keyDown(screen.getByPlaceholderText('Add sub-quest...'), { key: 'Escape' });

      // Trigger again
      window.dispatchEvent(new CustomEvent('trigger-add-quest'));

      // Should be in regular quest mode
      const questInput = await screen.findByPlaceholderText('Add quest...');
      expect(questInput).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Subquest Input Keyboard Shortcuts
  // ===========================================================================
  describe('Inline Subquest Input Shortcuts', () => {
    it('saves subquest when pressing Enter', async () => {
      const parentQuest = createQuest({ id: 'parent-1', title: 'Parent Quest', order: 0 });
      const store = createTestStore([parentQuest]);
      renderQuestLog(store);

      // Find and click the add subquest button (+ icon on hover)
      const addSubquestButton = screen.getByTitle('Add sub-quest');
      fireEvent.click(addSubquestButton);

      const input = await screen.findByPlaceholderText('Add sub-quest...');
      fireEvent.change(input, { target: { value: 'Inline Subquest' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        const state = store.getState();
        const subquest = state.quests.items.find((q) => q.title === 'Inline Subquest');
        expect(subquest).toBeDefined();
        expect(subquest?.parentId).toBe('parent-1');
      });
    });

    it('closes inline subquest input when pressing Escape', async () => {
      const parentQuest = createQuest({ id: 'parent-1', title: 'Parent Quest', order: 0 });
      const store = createTestStore([parentQuest]);
      renderQuestLog(store);

      const addSubquestButton = screen.getByTitle('Add sub-quest');
      fireEvent.click(addSubquestButton);

      const input = await screen.findByPlaceholderText('Add sub-quest...');
      fireEvent.keyDown(input, { key: 'Escape' });

      await waitFor(() => {
        // The inline subquest input should be closed
        expect(screen.queryByPlaceholderText('Add sub-quest...')).not.toBeInTheDocument();
      });
    });

    it('keeps inline input open for chain-adding subquests', async () => {
      const parentQuest = createQuest({ id: 'parent-1', title: 'Parent Quest', order: 0 });
      const store = createTestStore([parentQuest]);
      renderQuestLog(store);

      const addSubquestButton = screen.getByTitle('Add sub-quest');
      fireEvent.click(addSubquestButton);

      const input = await screen.findByPlaceholderText('Add sub-quest...');
      fireEvent.change(input, { target: { value: 'First Sub' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      // Input should still be there for adding more
      await waitFor(() => {
        const inputAfterSave = screen.getByPlaceholderText('Add sub-quest...');
        expect(inputAfterSave).toBeInTheDocument();
        expect(inputAfterSave).toHaveValue('');
      });
    });
  });
});
