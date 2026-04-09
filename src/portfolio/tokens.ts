import { Dimensions, Platform } from 'react-native';
export const { width } = Dimensions.get('window');
export const CHART_W = width - 48;

// ─── Design tokens — Quantum Ledger ──────────────────────────────────────────
export const BG       = '#070e1b';        // surface — deep space
export const BG2      = '#0c1322';        // surface_container_low
export const CARD     = '#11192a';        // surface_container
export const CARD2    = '#172031';        // surface_container_high
export const CARD3    = '#1c2639';        // surface_container_highest
export const GLASS    = 'rgba(143,245,255,0.04)';
export const BORDER   = '#414857';        // outline_variant
export const BORDER2  = 'rgba(143,245,255,0.22)'; // primary glow border

// Primary — Neon Cyan
export const GOLD     = '#8ff5ff';        // primary (neon cyan)
export const GOLD_L   = '#b5f9ff';        // primary lighter
export const GOLD_D   = 'rgba(143,245,255,0.08)';
export const GOLD_B   = 'rgba(143,245,255,0.22)';
export const GOLD_G   = 'rgba(143,245,255,0.04)';

// Secondary / supporting
export const BLUE     = '#ac89ff';        // secondary purple
export const BLUE_D   = 'rgba(172,137,255,0.13)';
export const GREEN    = '#00E09A';        // positive emerald
export const GREEN_D  = 'rgba(0,224,154,0.09)';
export const RED      = '#ff716c';        // error / negative
export const RED_D    = 'rgba(255,113,108,0.09)';
export const PURPLE   = '#ac89ff';        // purple (same as BLUE for compat)
export const PURPLE_D = 'rgba(172,137,255,0.09)';
export const ORANGE   = '#ff6b98';        // tertiary pink
export const ORANGE_D = 'rgba(255,107,152,0.10)';
export const TEAL     = '#8ff5ff';
export const TEAL_D   = 'rgba(143,245,255,0.08)';

// Amber (macro warning signals)
export const AMBER    = '#FFA500';
export const AMBER_D  = 'rgba(255,165,0,0.09)';

// Text
export const TXT      = '#e2e8fb';        // on_surface
export const TXT2     = '#a5abbd';        // on_surface_variant
export const MUTED    = '#6f7586';        // outline
export const SUB      = '#414857';        // outline_variant

export const serif = Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif';
export const mono  = Platform.OS === 'ios' ? 'Courier New' : 'monospace';
export const sans  = Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif';
