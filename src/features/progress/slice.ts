import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { loadProgress, saveProgress, type ProgressData } from '../../shared/lib/progressStorage';

interface ProgressState {
  currentXP: number;
  level: number;
  totalXPEarned: number;
  showLevelUp: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: ProgressState = {
  currentXP: 0,
  level: 1,
  totalXPEarned: 0,
  showLevelUp: false,
  loading: false,
  error: null,
};

const XP_PER_QUEST = 20; // 1/5 of bar (100 XP total)
const XP_PER_SUBQUEST = 10; // 1/10 of bar
const XP_TO_LEVEL = 100;
const LEVEL_MULTIPLIER = 0.95; // XP reduction per level

// Calculate scaled XP based on level
function calculateScaledXP(baseXP: number, level: number): number {
  const multiplier = Math.pow(LEVEL_MULTIPLIER, level - 1);
  return Math.round(baseXP * multiplier);
}

export const fetchProgress = createAsyncThunk('progress/fetch', async () => {
  return await loadProgress();
});

export const persistProgress = createAsyncThunk(
  'progress/persist',
  async (data: ProgressData) => {
    await saveProgress(data);
    return data;
  }
);

const progressSlice = createSlice({
  name: 'progress',
  initialState,
  reducers: {
    addXP(state, action: PayloadAction<{ isSubquest: boolean }>) {
      const baseXP = action.payload.isSubquest ? XP_PER_SUBQUEST : XP_PER_QUEST;
      const scaledXP = calculateScaledXP(baseXP, state.level);
      
      state.currentXP += scaledXP;
      state.totalXPEarned += scaledXP;

      // Check for level up
      if (state.currentXP >= XP_TO_LEVEL) {
        state.currentXP = state.currentXP - XP_TO_LEVEL;
        state.level += 1;
        state.showLevelUp = true;
      }
    },
    removeXP(state, action: PayloadAction<{ isSubquest: boolean }>) {
      // Use level - 1 for calculation since we may have leveled up
      const levelForCalc = state.level > 1 && state.currentXP < 20 ? state.level - 1 : state.level;
      const baseXP = action.payload.isSubquest ? XP_PER_SUBQUEST : XP_PER_QUEST;
      const scaledXP = calculateScaledXP(baseXP, levelForCalc);
      
      state.currentXP -= scaledXP;
      state.totalXPEarned -= scaledXP;

      // Check for level down (undo level up)
      if (state.currentXP < 0 && state.level > 1) {
        state.level -= 1;
        state.currentXP = XP_TO_LEVEL + state.currentXP;
      }
      
      // Ensure we don't go below 0
      if (state.currentXP < 0) {
        state.currentXP = 0;
      }
      if (state.totalXPEarned < 0) {
        state.totalXPEarned = 0;
      }
    },
    clearLevelUp(state) {
      state.showLevelUp = false;
    },
    setProgress(state, action: PayloadAction<ProgressData>) {
      state.currentXP = action.payload.currentXP;
      state.level = action.payload.level;
      state.totalXPEarned = action.payload.totalXPEarned;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProgress.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProgress.fulfilled, (state, action) => {
        state.loading = false;
        state.currentXP = action.payload.currentXP;
        state.level = action.payload.level;
        state.totalXPEarned = action.payload.totalXPEarned;
      })
      .addCase(fetchProgress.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to load progress';
      });
  },
});

export const { addXP, removeXP, clearLevelUp, setProgress } = progressSlice.actions;
export default progressSlice.reducer;
