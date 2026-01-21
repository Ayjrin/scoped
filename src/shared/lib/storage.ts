import type { Quest } from '../../features/quests/slice';

const STORAGE_KEY = 'scoped_quests';

// Check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// Browser localStorage fallback
function loadQuestsFromLocalStorage(): Quest[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveQuestsToLocalStorage(quests: Quest[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(quests));
}

// Tauri file system storage
async function loadQuestsFromTauri(): Promise<Quest[]> {
  try {
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const { exists, readTextFile } = await import('@tauri-apps/plugin-fs');
    
    const appDir = await appDataDir();
    const path = await join(appDir, 'quests.json');
    const fileExists = await exists(path);
    
    if (!fileExists) {
      return [];
    }
    
    const content = await readTextFile(path);
    return JSON.parse(content) as Quest[];
  } catch (error) {
    console.error('Failed to load quests from Tauri:', error);
    return [];
  }
}

async function saveQuestsToTauri(quests: Quest[]): Promise<void> {
  try {
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const { exists, writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
    
    const appDir = await appDataDir();
    const dirExists = await exists(appDir);
    if (!dirExists) {
      await mkdir(appDir, { recursive: true });
    }
    
    const path = await join(appDir, 'quests.json');
    const content = JSON.stringify(quests, null, 2);
    await writeTextFile(path, content);
  } catch (error) {
    console.error('Failed to save quests to Tauri:', error);
    throw error;
  }
}

// Unified API
export async function loadQuests(): Promise<Quest[]> {
  if (isTauri()) {
    return loadQuestsFromTauri();
  }
  return loadQuestsFromLocalStorage();
}

export async function saveQuests(quests: Quest[]): Promise<void> {
  if (isTauri()) {
    await saveQuestsToTauri(quests);
  } else {
    saveQuestsToLocalStorage(quests);
  }
}
