import { t } from '../i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Tutorial } from '../game/types';

import { KEYS } from './keys';

const KEY = KEYS.tutorials;

export async function loadSeenTutorials(): Promise<Tutorial[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Tutorial[]) : [];
  } catch {
    return [];
  }
}

/** Remembers that a mechanic's explanation was shown, so it is never shown twice. */
export async function markTutorialSeen(mechanic: Tutorial): Promise<void> {
  const seen = await loadSeenTutorials();
  if (seen.includes(mechanic)) return;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify([...seen, mechanic]));
  } catch {
    // Worst case the bubble shows again next time.
  }
}

/** The bubble of each mechanic, read in the language on screen at the moment it is shown (tutorial.<mechanic> in the language files). */
export const TUTORIAL_TEXT = new Proxy({} as Record<Tutorial, string>, { get: (_target, mechanic) => t(`tutorial.${String(mechanic)}`) });
