import { Dimensions, Platform } from 'react-native';
export const { width } = Dimensions.get('window');
export const CHART_W = width - 48;
// ─── Design tokens — Luxury Terminal ─────────────────────────────────────────
export const BG       = '#080B12';        // deep obsidian
export const BG2      = '#0C1018';        // slightly lifted
export const CARD     = '#0F1520';        // card surface
export const CARD2    = '#131C2B';        // raised card
export const GLASS    = 'rgba(255,255,255,0.025)';
export const BORDER   = 'rgba(255,255,255,0.06)';
export const BORDER2  = 'rgba(255,255,255,0.1)';
export const GOLD     = '#C9A84C';
export const GOLD_L   = '#E8CC7A';
export const GOLD_D   = 'rgba(201,168,76,0.1)';
export const GOLD_B   = 'rgba(201,168,76,0.25)';
export const GOLD_G   = 'rgba(201,168,76,0.06)';  // subtle gold glow bg
export const BLUE     = '#4F9EF8';
export const BLUE_D   = 'rgba(79,158,248,0.12)';
export const GREEN    = '#34D399';
export const GREEN_D  = 'rgba(52,211,153,0.1)';
export const RED      = '#F87171';
export const RED_D    = 'rgba(248,113,113,0.1)';
export const PURPLE   = '#C084FC';
export const PURPLE_D = 'rgba(192,132,252,0.12)';
export const ORANGE   = '#FB923C';
export const ORANGE_D = 'rgba(251,146,60,0.1)';
export const TEAL     = '#2DD4BF';
export const TXT      = '#EEE8DC';
export const TXT2     = '#B8B2A8';
export const MUTED    = '#4A5468';
export const SUB      = '#7A8494';
export const serif = Platform.OS === 'ios' ? 'Georgia' : 'serif';
export const mono  = Platform.OS === 'ios' ? 'Courier New' : 'monospace';
export const sans  = Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif';
