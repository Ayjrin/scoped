import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type TimerMode = 'focus' | 'break' | 'idle';

interface TimerState {
  mode: TimerMode;
  focusDuration: number;
  breakDuration: number;
  remaining: number;
  isRunning: boolean;
  sessionCount: number;
}

const FOCUS_DURATION = 25 * 60; // 25 minutes in seconds
const BREAK_DURATION = 5 * 60;  // 5 minutes in seconds

const initialState: TimerState = {
  mode: 'idle',
  focusDuration: FOCUS_DURATION,
  breakDuration: BREAK_DURATION,
  remaining: FOCUS_DURATION,
  isRunning: false,
  sessionCount: 0,
};

const timerSlice = createSlice({
  name: 'timer',
  initialState,
  reducers: {
    toggle(state) {
      if (state.mode === 'idle') {
        state.mode = 'focus';
        state.remaining = state.focusDuration;
      }
      state.isRunning = !state.isRunning;
    },
    tick(state) {
      if (state.isRunning) {
        state.remaining -= 1;
      }
    },
    reset(state) {
      state.isRunning = false;
      if (state.mode === 'focus' || state.mode === 'idle') {
        state.remaining = state.focusDuration;
      } else {
        state.remaining = state.breakDuration;
      }
    },
    completeSession(state) {
      if (state.mode === 'focus') {
        state.sessionCount += 1;
        state.mode = 'break';
        state.remaining = state.breakDuration;
        state.isRunning = false;
      } else if (state.mode === 'break') {
        state.mode = 'focus';
        state.remaining = state.focusDuration;
        state.isRunning = false;
      }
    },
    setFocusDuration(state, action: PayloadAction<number>) {
      state.focusDuration = action.payload * 60;
      if (state.mode === 'idle' || state.mode === 'focus') {
        state.remaining = state.focusDuration;
      }
    },
    setBreakDuration(state, action: PayloadAction<number>) {
      state.breakDuration = action.payload * 60;
      if (state.mode === 'break') {
        state.remaining = state.breakDuration;
      }
    },
    skipToBreak(state) {
      state.mode = 'break';
      state.remaining = state.breakDuration;
      state.isRunning = false;
    },
    skipToFocus(state) {
      state.mode = 'focus';
      state.remaining = state.focusDuration;
      state.isRunning = false;
    },
  },
});

export const {
  toggle,
  tick,
  reset,
  completeSession,
  setFocusDuration,
  setBreakDuration,
  skipToBreak,
  skipToFocus,
} = timerSlice.actions;

export default timerSlice.reducer;
