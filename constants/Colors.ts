const tintColorLight = '#2f95dc';
const tintColorDark  = '#fff';

export default {
  light: {
    text:            '#000',
    background:      '#fff',
    tint:            tintColorLight,
    tabIconDefault:  '#ccc',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text:            '#fff',
    background:      '#000',
    tint:            tintColorDark,
    tabIconDefault:  '#ccc',
    tabIconSelected: tintColorDark,
  },
};

// ─── Quantum Ledger Design System ─────────────────────────────────────────────
// Use these tokens directly when building screens instead of hardcoding hex values.
// Import: import { QL } from '@/constants/Colors';

export const QL = {
  // Surfaces
  BG:        '#070e1b',
  BG2:       '#0c1322',
  CARD:      '#11192a',
  CARD2:     '#172031',
  CARD3:     '#1c2639',
  GLASS:     'rgba(143,245,255,0.04)',
  BORDER:    '#414857',
  BORDER_HI: 'rgba(143,245,255,0.22)',

  // Primary — neon cyan (mapped as GOLD for backward compat)
  GOLD:      '#8ff5ff',
  GOLD_L:    '#b5f9ff',
  GOLD_D:    'rgba(143,245,255,0.08)',
  GOLD_B:    'rgba(143,245,255,0.22)',

  // Secondary / supporting
  BLUE:      '#ac89ff',
  BLUE_D:    'rgba(172,137,255,0.13)',
  GREEN:     '#00E09A',
  GREEN_D:   'rgba(0,224,154,0.09)',
  RED:       '#ff716c',
  RED_D:     'rgba(255,113,108,0.09)',
  PURPLE:    '#ac89ff',
  PURPLE_D:  'rgba(172,137,255,0.09)',
  ORANGE:    '#ff6b98',
  ORANGE_D:  'rgba(255,107,152,0.10)',
  AMBER:     '#FFA500',
  AMBER_D:   'rgba(255,165,0,0.09)',

  // Text
  TXT:       '#e2e8fb',
  TXT2:      '#a5abbd',
  MUTED:     '#6f7586',
  SUB:       '#414857',
} as const;
