import { createContext } from 'react';

/** Identifies the board a component belongs to, so it only reacts to its own board's events. */
export const WorldKeyContext = createContext('');
