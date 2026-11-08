import { ROMAN, WORLD_COUNT_BASE, isDailyLevelId, themeForLevel, worldIndexOf } from '../worlds';
import { t } from './';

/** The name of the world a level belongs to, in the language on screen ("Forêt II" / "Forest II"). */
export function worldName(levelId: number): string {
  const theme = themeForLevel(levelId);
  const variant = isDailyLevelId(levelId) ? 0 : Math.floor(Math.max(0, worldIndexOf(levelId)) / WORLD_COUNT_BASE);
  return t(`worlds.${theme.id}`, { defaultValue: theme.name }) + (variant === 0 ? '' : (ROMAN[variant] ?? ` ${variant + 1}`));
}
