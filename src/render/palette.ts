/** Body colours of the vehicles, by `Vehicle.color` (bright, easy to tell apart at a glance). */
export const VEHICLE_PALETTE: readonly string[] = [
  '#e8453c', // red
  '#f28c28', // orange
  '#f6cf3b', // yellow
  '#8fd14f', // lime
  '#2fa84f', // green
  '#2bb7a3', // teal
  '#3fb6ea', // sky
  '#3a6fe0', // blue
  '#8a5be0', // purple
  '#ea63b0', // pink
  '#f2f2ee', // white
  '#5c6370', // slate
];

/** Colours of the places, the sidewalk and the road (the asphalt is the grey-violet of the floor of Paint Maze). */
export const LOT_COLORS = {
  asphalt: '#6b6580',
  asphaltAlt: '#645e79',
  line: '#e9e6f2',
  road: '#3d3a4a',
  roadDash: '#f0d878',
  sidewalk: '#d2a56a',
  wood: '#a9763f',
  grass: '#5f9a4d',
  grassVoid: '#6aa656',
  post: '#4b4960',
  postTop: '#f4c542',
  pot: '#c8643c',
  leaf: '#3f9a45',
  bollardA: '#f08a24',
  bollardB: '#f6f2e8',
  gate: '#d9363e',
  gateStripe: '#f6f2e8',
  arrow: '#f6f2e8',
} as const;
