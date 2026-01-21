export interface ProgressData {
  currentXP: number;
  level: number;
  totalXPEarned: number;
}

const STORAGE_KEY = 'scoped_progress';

// Check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// Browser localStorage fallback
function loadProgressFromLocalStorage(): ProgressData {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch {
    // Ignore parse errors
  }
  return { currentXP: 0, level: 1, totalXPEarned: 0 };
}

function saveProgressToLocalStorage(progress: ProgressData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

// Tauri file system storage
async function loadProgressFromTauri(): Promise<ProgressData> {
  try {
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const { exists, readTextFile } = await import('@tauri-apps/plugin-fs');

    const appDir = await appDataDir();
    const path = await join(appDir, 'progress.json');
    const fileExists = await exists(path);

    if (!fileExists) {
      return { currentXP: 0, level: 1, totalXPEarned: 0 };
    }

    const content = await readTextFile(path);
    return JSON.parse(content) as ProgressData;
  } catch (error) {
    console.error('Failed to load progress from Tauri:', error);
    return { currentXP: 0, level: 1, totalXPEarned: 0 };
  }
}

async function saveProgressToTauri(progress: ProgressData): Promise<void> {
  try {
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const { exists, writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');

    const appDir = await appDataDir();
    const dirExists = await exists(appDir);
    if (!dirExists) {
      await mkdir(appDir, { recursive: true });
    }

    const path = await join(appDir, 'progress.json');
    const content = JSON.stringify(progress, null, 2);
    await writeTextFile(path, content);
  } catch (error) {
    console.error('Failed to save progress to Tauri:', error);
    throw error;
  }
}

// Unified API
export async function loadProgress(): Promise<ProgressData> {
  if (isTauri()) {
    return loadProgressFromTauri();
  }
  return loadProgressFromLocalStorage();
}

export async function saveProgress(progress: ProgressData): Promise<void> {
  if (isTauri()) {
    await saveProgressToTauri(progress);
  } else {
    saveProgressToLocalStorage(progress);
  }
}
