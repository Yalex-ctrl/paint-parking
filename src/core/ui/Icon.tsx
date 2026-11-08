import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

/** The one icon family of the app (Material Community Icons). */
export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 24, color = '#ffffff' }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}
