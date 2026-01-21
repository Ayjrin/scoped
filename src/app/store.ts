import { configureStore } from '@reduxjs/toolkit';
import timerReducer from '../features/timer/slice';
import questsReducer from '../features/quests/slice';
import progressReducer from '../features/progress/slice';

export const store = configureStore({
  reducer: {
    timer: timerReducer,
    quests: questsReducer,
    progress: progressReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
