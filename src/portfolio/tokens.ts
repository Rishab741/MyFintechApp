import { Dimensions, Platform } from 'react-native';
export const { width } = Dimensions.get('window');
export const CHART_W = width - 48;

// ─── Design tokens — Vestara ──────────────────────────────────────────────────
export const BG       = '#080C18';        // deep navy
export const BG2      = '#0B1120';
export const CARD     = '#0E1525';        // card surface
export const CARD2    = '#121B2E';        // raised card
export const GLASS    = 'rgba(255,255,255,0.03)';
export const BORDER   = 'rgba(255,255,255,0.07)';
export const BORDER2  = 'rgba(124,108,240,0.22)';

// Primary — Electric Violet
export const GOLD     = '#7C6CF0';        // electric violet (primary accent)
export const GOLD_L   = '#A89CF5';        // soft lavender
export const GOLD_D   = 'rgba(124,108,240,0.09)';
export const GOLD_B   = 'rgba(124,108,240,0.22)';
export const GOLD_G   = 'rgba(124,108,240,0.05)';

export const BLUE     = '#6366F1';        // indigo (secondary)
export const BLUE_D   = 'rgba(99,102,241,0.13)';
export const GREEN    = '#00D68F';        // emerald
export const GREEN_D  = 'rgba(0,214,143,0.11)';
export const RED      = '#FF4D6D';        // coral
export const RED_D    = 'rgba(255,77,109,0.11)';
export const PURPLE   = '#C4B5FD';        // lavender highlight
export const PURPLE_D = 'rgba(196,181,253,0.13)';
export const ORANGE   = '#FB923C';
export const ORANGE_D = 'rgba(251,146,60,0.10)';
export const TEAL     = '#14B8A6';
export const TEAL_D   = 'rgba(20,184,166,0.10)';

export const TXT      = '#EEF0FF';        // slight violet tint to white
export const TXT2     = '#8B9EC8';
export const MUTED    = '#3D5070';
export const SUB      = '#607090';

export const serif = Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif';
export const mono  = Platform.OS === 'ios' ? 'Courier New' : 'monospace';
export const sans  = Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif';
