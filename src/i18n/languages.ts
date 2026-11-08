import en from './en.json';
import fr from './fr.json';

/**
 * The languages of the app. Adding one is a JSON file next to fr.json and en.json plus one line here (and, for the native texts of
 * iOS, a file in languages/ and a line in the "locales" of app.json). The first one is the language of the source: a test fails when
 * another one misses a key of it.
 */
export const LANGUAGES = [
  { code: 'fr', label: 'Français', resources: fr },
  { code: 'en', label: 'English', resources: en },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

/** Spoken when the phone speaks none of the languages above. */
export const FALLBACK_LANGUAGE: LanguageCode = 'en';

export const isLanguage = (code: unknown): code is LanguageCode => LANGUAGES.some((l) => l.code === code);

/**
 * The language to use: the one the player chose, else the one of the phone when the app has it (French phone: French), else English.
 * `phone` is the list of language codes of the phone, most wanted first.
 */
export function resolveLanguage(saved: unknown, phone: readonly string[]): LanguageCode {
  if (isLanguage(saved)) return saved;
  for (const code of phone) {
    const base = code.toLowerCase().split(/[-_]/)[0];
    if (isLanguage(base)) return base;
  }
  return FALLBACK_LANGUAGE;
}
