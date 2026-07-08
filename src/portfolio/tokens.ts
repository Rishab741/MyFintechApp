/**
 * Design tokens — compatibility shim that re-exports from the Quantum Ledger
 * design system in constants/Colors.ts.
 *
 * All variable names are preserved so existing imports in Portfolio.tsx,
 * Insights.tsx and sub-components continue to work unchanged.
 *
 * For new code, import directly:
 *   import { QL, sans, mono } from '@/constants/Colors';
 */
import { Dimensions } from 'react-native';
import { QL, sans as _sans, mono as _mono } from '@/constants/Colors';

export const { width } = Dimensions.get('window');
export const CHART_W = width - 48;

// ─── Surfaces ────────────────────────────────────────────────────────────────
export const BG      = QL.BG;
export const BG2     = QL.BG2;
export const CARD    = QL.CARD;
export const CARD2   = QL.CARD2;
export const CARD3   = QL.CARD3;
export const GLASS   = QL.GLASS;
export const BORDER  = QL.BORDER;
export const BORDER2 = QL.BORDER_HI;

// ─── Primary (sky blue) ──────────────────────────────────────────────────────
export const GOLD    = QL.GOLD;
export const GOLD_L  = QL.GOLD_L;
export const GOLD_D  = QL.GOLD_D;
export const GOLD_B  = QL.GOLD_B;
export const GOLD_G  = QL.GLASS;
export const TEAL    = QL.GOLD;
export const TEAL_D  = QL.GOLD_D;

// ─── Supporting ──────────────────────────────────────────────────────────────
export const BLUE    = QL.BLUE;
export const BLUE_D  = QL.BLUE_D;
export const GREEN   = QL.GREEN;
export const GREEN_D = QL.GREEN_D;
export const RED     = QL.RED;
export const RED_D   = QL.RED_D;
export const PURPLE  = QL.PURPLE;
export const PURPLE_D = QL.PURPLE_D;
export const ORANGE  = QL.ORANGE;
export const ORANGE_D = QL.ORANGE_D;
export const AMBER   = QL.AMBER;
export const AMBER_D = QL.AMBER_D;

// ─── Text ────────────────────────────────────────────────────────────────────
export const TXT     = QL.TXT;
export const TXT2    = QL.TXT2;
export const MUTED   = QL.MUTED;
export const SUB     = QL.SUB;

// ─── Typography ──────────────────────────────────────────────────────────────
export const sans  = _sans;
export const mono  = _mono;
export const serif = _sans;
