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
  // Surfaces — Platstock deep navy palette
  BG:        '#060E1F',
  BG2:       '#0B1626',
  CARD:      '#0E1D35',
  CARD2:     '#122040',
  CARD3:     '#162A4A',
  GLASS:     'rgba(14,165,233,0.04)',
  BORDER:    '#1E3347',
  BORDER_HI: 'rgba(14,165,233,0.25)',

  // Primary — sky blue
  GOLD:      '#0EA5E9',   // kept as GOLD for backward compat with existing screens
  GOLD_L:    '#38BDF8',
  GOLD_D:    'rgba(14,165,233,0.08)',
  GOLD_B:    'rgba(14,165,233,0.22)',

  // Secondary / supporting
  BLUE:      '#818CF8',
  BLUE_D:    'rgba(129,140,248,0.13)',
  GREEN:     '#10B981',
  GREEN_D:   'rgba(16,185,129,0.09)',
  RED:       '#ff716c',
  RED_D:     'rgba(255,113,108,0.09)',
  PURPLE:    '#ac89ff',
  PURPLE_D:  'rgba(172,137,255,0.09)',
  ORANGE:    '#F97316',
  ORANGE_D:  'rgba(249,115,22,0.10)',
  AMBER:     '#F59E0B',
  AMBER_D:   'rgba(245,158,11,0.09)',

  // Text
  TXT:       '#E8F4FD',
  TXT2:      '#7C9AB5',
  MUTED:     '#607A93',
  SUB:       '#1E3347',
} as const;
