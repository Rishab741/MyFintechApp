import { Platform } from 'react-native';

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

// ─── Quantum Ledger Design System — ink & brass ────────────────────────────
// Same key names as before, so nothing importing QL elsewhere breaks —
// only the values changed, from sky-blue/navy to the ink/gold editorial
// palette used on the web app and dashboard.
// Import: import { QL } from '@/constants/Colors';

export const QL = {
  // Surfaces — deep ink, warmer than pure black/navy
  BG:        '#0A0E17',
  BG2:       '#0D1320',
  CARD:      '#121826',
  CARD2:     '#161D2C',
  CARD3:     '#1D2536',
  GLASS:     'rgba(201,162,75,0.04)',
  BORDER:    '#1B2334',
  BORDER_HI: 'rgba(201,162,75,0.25)',

  // Primary — brass gold (kept as GOLD for backward compat with existing screens)
  GOLD:      '#C9A24B',
  GOLD_L:    '#E8D3A0',
  GOLD_D:    'rgba(201,162,75,0.08)',
  GOLD_B:    'rgba(201,162,75,0.22)',

  // Secondary / supporting — desaturated so nothing competes with gold
  BLUE:      '#7B8CC4',
  BLUE_D:    'rgba(123,140,196,0.13)',
  GREEN:     '#7FA37A',
  GREEN_D:   'rgba(127,163,122,0.09)',
  RED:       '#C1613F',
  RED_D:     'rgba(193,97,63,0.09)',
  PURPLE:    '#A98BC9',
  PURPLE_D:  'rgba(169,139,201,0.09)',
  ORANGE:    '#C1793F',
  ORANGE_D:  'rgba(193,121,63,0.10)',
  AMBER:     '#D9B25C',
  AMBER_D:   'rgba(217,178,92,0.09)',

  // Text — warm ivory instead of cool blue-white
  TXT:       '#F4EFE4',
  TXT2:      '#B8B0A0',
  MUTED:     '#948C7C',
  SUB:       '#1B2334',
} as const;

export const sans = Platform.OS === 'ios' ? 'SF Pro Text' : 'sans-serif';
export const mono = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

// Optional editorial type — used for hero numbers and headline moments
// (portfolio value, greeting name) where the serif carries the brand's
// "art" beyond what a system sans can do. Falls back silently to the
// system font until loaded, so nothing breaks if you skip this step.
//
//   npx expo install @expo-google-fonts/fraunces expo-font
//   useFonts({ Fraunces_500Medium, Fraunces_400Regular_Italic })
//
export const serif       = 'Fraunces_500Medium';
export const serifItalic = 'Fraunces_400Regular_Italic';

export const SP = {
  XS: 4, SM: 8, MD: 12, LG: 16, XL: 20, XXL: 24,
  '2XL': 32, '3XL': 40, '4XL': 48,
} as const;

export const RADIUS = {
  XS: 4, SM: 6, MD: 8, LG: 10, XL: 12, '2XL': 14, '3XL': 16, '4XL': 20, PILL: 100,
} as const;