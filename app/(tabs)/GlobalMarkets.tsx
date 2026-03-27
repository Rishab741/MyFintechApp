/**
 * GlobalMarkets.tsx — Vestara Global Macro Intelligence
 * Real-time macroeconomic data (FRED) + AI regime detection + investment tactics
 * Aesthetic: Luxury Terminal — obsidian depth, gold hairlines, monospace data
 */

import React, { useState } from 'react';
import {
    ActivityIndicator,
    Linking,
    Platform,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import { useGlobalMarkets } from '@/src/global-markets/useGlobalMarkets';
import type { MacroSignal, MacroSeverity, MacroCategory, SectorAllocation, LiveSector } from '@/src/global-markets/types';
import {
    BG, CARD, CARD2, BORDER, BORDER2,
    GOLD, GOLD_L, GOLD_D, GOLD_B,
    GREEN, GREEN_D, RED, RED_D,
    ORANGE, ORANGE_D, BLUE, BLUE_D,
    TXT, TXT2, MUTED, SUB,
    serif, mono, sans,
} from '@/src/portfolio/tokens';

// ─── Additional tokens ────────────────────────────────────────────────────────
const PURPLE = '#C084FC';
const TEAL   = '#2DD4BF';

// ─── Severity mapping ─────────────────────────────────────────────────────────
const SEV_COLOR: Record<MacroSeverity, string> = {
    critical: RED,
    warning:  ORANGE,
    positive: GREEN,
    neutral:  BLUE,
};
const SEV_BG: Record<MacroSeverity, string> = {
    critical: RED_D,
    warning:  ORANGE_D,
    positive: GREEN_D,
    neutral:  BLUE_D,
};
const SEV_LABEL: Record<MacroSeverity, string> = {
    critical: 'CRITICAL',
    warning:  'WARNING',
    positive: 'POSITIVE',
    neutral:  'INFO',
};

// ─── Category label mapping ───────────────────────────────────────────────────
const CAT_LABEL: Record<MacroCategory, string> = {
    inflation:   'INFLATION',
    rates:       'RATES',
    yield_curve: 'YIELD CURVE',
    sentiment:   'SENTIMENT',
    employment:  'EMPLOYMENT',
};
const CAT_COLOR: Record<MacroCategory, string> = {
    inflation:   ORANGE,
    rates:       PURPLE,
    yield_curve: TEAL,
    sentiment:   RED,
    employment:  GREEN,
};

// ─── Helper formatters ────────────────────────────────────────────────────────
function fmtNum(v: number | null, decimals = 2, suffix = '%'): string {
    if (v === null) return '—';
    return `${v.toFixed(decimals)}${suffix}`;
}
function fmtPct(v: number, decimals = 1): string {
    return `${v > 0 ? '+' : ''}${v.toFixed(decimals)}%`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const Divider = () => <View style={s.divider} />;

const SectionHeader: React.FC<{ title: string; right?: string }> = ({ title, right }) => (
    <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>{title}</Text>
        {right && <Text style={s.sectionRight}>{right}</Text>}
    </View>
);

// ── Indicator Tile ─────────────────────────────────────────────────────────────
const IndicatorTile: React.FC<{
    label:    string;
    value:    string;
    sub?:     string;
    color?:   string;
    badge?:   string;
    badgeCol?:string;
}> = ({ label, value, sub, color = TXT, badge, badgeCol = MUTED }) => (
    <View style={s.indicatorTile}>
        <Text style={s.indLabel}>{label}</Text>
        <Text style={[s.indValue, { color }]}>{value}</Text>
        {sub && <Text style={s.indSub}>{sub}</Text>}
        {badge && (
            <View style={[s.indBadge, { borderColor: `${badgeCol}40`, backgroundColor: `${badgeCol}12` }]}>
                <Text style={[s.indBadgeText, { color: badgeCol }]}>{badge}</Text>
            </View>
        )}
    </View>
);

// ── Regime Banner ──────────────────────────────────────────────────────────────
const RegimeBanner: React.FC<{
    label:         string;
    description:   string;
    color:         string;
    equityStance:  string;
    bondStance:    string;
    strategy:      string;
}> = ({ label, description, color, equityStance, bondStance, strategy }) => (
    <View style={[s.regimeBanner, { borderLeftColor: color, borderLeftWidth: 4 }]}>
        <View style={s.regimeLabelRow}>
            <View style={[s.regimeDot, { backgroundColor: color }]} />
            <Text style={[s.regimeLabel, { color }]}>MACRO REGIME</Text>
        </View>
        <Text style={s.regimeName}>{label}</Text>
        <Text style={s.regimeDesc}>{description}</Text>
        <Divider />
        <View style={s.regimeStanceRow}>
            <View style={s.stanceBlock}>
                <Text style={s.stanceLabel}>EQUITIES</Text>
                <Text style={[s.stanceValue, {
                    color: equityStance.includes('Over') ? GREEN
                         : equityStance.includes('Under') || equityStance === 'Defensive' ? RED
                         : GOLD,
                }]}>{equityStance}</Text>
            </View>
            <View style={s.stanceDivider} />
            <View style={s.stanceBlock}>
                <Text style={s.stanceLabel}>FIXED INCOME</Text>
                <Text style={[s.stanceValue, {
                    color: bondStance.includes('Under') || bondStance === 'Reduce' ? RED
                         : bondStance.includes('Over') || bondStance === 'Long Duration' ? GREEN
                         : GOLD,
                }]}>{bondStance}</Text>
            </View>
        </View>
        <View style={[s.strategyBox, { borderColor: `${color}30`, backgroundColor: `${color}08` }]}>
            <Text style={s.strategyLabel}>STRATEGY  </Text>
            <Text style={[s.strategyText, { color: color === GREEN ? GREEN : GOLD_L }]}>{strategy}</Text>
        </View>
    </View>
);

// ── Yield Curve Visual ─────────────────────────────────────────────────────────
const YieldCurveCard: React.FC<{
    yield2y:  number | null;
    yield10y: number | null;
    spread:   number | null;
}> = ({ yield2y, yield10y, spread }) => {
    const max = Math.max(yield2y ?? 0, yield10y ?? 0, 0.01);
    const w2y  = yield2y  ? `${Math.min((yield2y  / (max + 1)) * 90, 90)}%` as any : '0%';
    const w10y = yield10y ? `${Math.min((yield10y / (max + 1)) * 90, 90)}%` as any : '0%';
    const inverted = spread !== null && spread < 0;
    const spreadColor = inverted
        ? (spread! < -0.5 ? RED : ORANGE)
        : (spread! > 1 ? GREEN : TXT2);

    return (
        <View style={s.yieldCard}>
            <View style={s.yieldRow}>
                <Text style={s.yieldLabel}>2Y TREASURY</Text>
                <View style={s.yieldBarWrap}>
                    <View style={[s.yieldBar, { width: w2y, backgroundColor: PURPLE }]} />
                </View>
                <Text style={[s.yieldValue, { color: PURPLE }]}>{fmtNum(yield2y)}</Text>
            </View>
            <View style={[s.yieldRow, { marginTop: 12 }]}>
                <Text style={s.yieldLabel}>10Y TREASURY</Text>
                <View style={s.yieldBarWrap}>
                    <View style={[s.yieldBar, { width: w10y, backgroundColor: TEAL }]} />
                </View>
                <Text style={[s.yieldValue, { color: TEAL }]}>{fmtNum(yield10y)}</Text>
            </View>
            <Divider />
            <View style={s.yieldSpreadRow}>
                <Text style={s.yieldSpreadLabel}>10Y–2Y SPREAD</Text>
                <View style={s.yieldSpreadRight}>
                    <Text style={[s.yieldSpreadValue, { color: spreadColor }]}>
                        {spread !== null ? `${spread > 0 ? '+' : ''}${spread.toFixed(2)}%` : '—'}
                    </Text>
                    <View style={[s.yieldStatusPill, { backgroundColor: `${spreadColor}15`, borderColor: `${spreadColor}30` }]}>
                        <Text style={[s.yieldStatusText, { color: spreadColor }]}>
                            {spread === null ? 'N/A'
                             : spread < -0.5 ? 'DEEPLY INVERTED'
                             : spread < 0    ? 'INVERTED'
                             : spread < 0.5  ? 'FLAT'
                             : spread < 1.5  ? 'NORMAL'
                             : 'STEEP'}
                        </Text>
                    </View>
                </View>
            </View>
            {inverted && (
                <Text style={s.yieldWarning}>
                    ⚠ Inverted curves have preceded every US recession since 1955 (typical lead: 12–18 months)
                </Text>
            )}
        </View>
    );
};

// ── Macro Signal Card ──────────────────────────────────────────────────────────
const MacroSignalCard: React.FC<{ signal: MacroSignal }> = ({ signal }) => {
    const color  = SEV_COLOR[signal.severity];
    const bg     = SEV_BG[signal.severity];
    const catCol = CAT_COLOR[signal.category];
    return (
        <View style={[s.signalCard, { borderLeftColor: color }]}>
            <View style={s.signalHeader}>
                <View style={[s.catBadge, { backgroundColor: `${catCol}18` }]}>
                    <Text style={[s.catText, { color: catCol }]}>{CAT_LABEL[signal.category]}</Text>
                </View>
                <View style={[s.sevBadge, { backgroundColor: bg }]}>
                    <Text style={[s.sevText, { color }]}>{SEV_LABEL[signal.severity]}</Text>
                </View>
            </View>
            <View style={s.signalTitleRow}>
                <Text style={s.signalTitle}>{signal.title}</Text>
                <View style={[s.valuePill, { borderColor: `${color}40` }]}>
                    <Text style={[s.valuePillText, { color }]}>{signal.value}</Text>
                </View>
            </View>
            <Text style={s.signalBody}>{signal.body}</Text>
            <View style={s.actionBox}>
                <Text style={s.actionLabel}>TACTIC  </Text>
                <Text style={s.actionText}>{signal.action}</Text>
            </View>
        </View>
    );
};

// ── Sector Rotation Block ──────────────────────────────────────────────────────
const SectorRotationBlock: React.FC<{
    overweight:  SectorAllocation[];
    underweight: SectorAllocation[];
    keyEtfs:     string[];
    fixedIncome: string;
}> = ({ overweight, underweight, keyEtfs, fixedIncome }) => (
    <View style={s.card}>
        {overweight.length > 0 && (
            <>
                <Text style={s.rotationGroupLabel}>OVERWEIGHT</Text>
                {overweight.map(sec => (
                    <View key={sec.etf} style={s.rotationRow}>
                        <View style={s.rotationLeft}>
                            <View style={[s.rotationDot, { backgroundColor: GREEN }]} />
                            <Text style={s.rotationName}>{sec.name}</Text>
                            <View style={[s.etfChip, { borderColor: `${GREEN}40`, backgroundColor: GREEN_D }]}>
                                <Text style={[s.etfChipText, { color: GREEN }]}>{sec.etf}</Text>
                            </View>
                        </View>
                        <Text style={s.rotationReason}>{sec.reason}</Text>
                    </View>
                ))}
            </>
        )}
        {underweight.length > 0 && (
            <>
                <View style={[s.divider, { marginVertical: 16 }]} />
                <Text style={[s.rotationGroupLabel, { color: RED }]}>UNDERWEIGHT</Text>
                {underweight.map(sec => (
                    <View key={sec.etf} style={s.rotationRow}>
                        <View style={s.rotationLeft}>
                            <View style={[s.rotationDot, { backgroundColor: RED }]} />
                            <Text style={s.rotationName}>{sec.name}</Text>
                            <View style={[s.etfChip, { borderColor: `${RED}40`, backgroundColor: RED_D }]}>
                                <Text style={[s.etfChipText, { color: RED }]}>{sec.etf}</Text>
                            </View>
                        </View>
                        <Text style={s.rotationReason}>{sec.reason}</Text>
                    </View>
                ))}
            </>
        )}
        <View style={[s.divider, { marginVertical: 16 }]} />
        <Text style={[s.rotationGroupLabel, { color: GOLD }]}>FIXED INCOME STANCE</Text>
        <Text style={[s.signalBody, { marginTop: 8, marginBottom: 0 }]}>{fixedIncome}</Text>
        <View style={[s.divider, { marginVertical: 16 }]} />
        <Text style={s.rotationGroupLabel}>TACTICAL ETFs</Text>
        <View style={s.etfRow}>
            {keyEtfs.map(etf => (
                <View key={etf} style={s.keyEtfChip}>
                    <Text style={s.keyEtfText}>{etf}</Text>
                </View>
            ))}
        </View>
    </View>
);

// ── Live Sector Performance ────────────────────────────────────────────────────
const SectorPerfRow: React.FC<{ sector: LiveSector; maxAbs: number }> = ({ sector, maxAbs }) => {
    const color   = sector.changePct >= 0 ? GREEN : RED;
    const barPct  = maxAbs > 0 ? Math.abs(sector.changePct) / maxAbs : 0;
    const barW    = `${Math.round(barPct * 100)}%` as any;
    return (
        <View style={s.sectorRow}>
            <Text style={s.sectorName}>{sector.name}</Text>
            <View style={s.sectorBarWrap}>
                <View style={[s.sectorBar, { width: barW, backgroundColor: color, opacity: 0.7 }]} />
            </View>
            <Text style={[s.sectorPct, { color }]}>{fmtPct(sector.changePct)}</Text>
        </View>
    );
};

// ─── Setup Screen ─────────────────────────────────────────────────────────────
const SetupScreen = () => (
    <View style={s.setupWrap}>
        <Text style={s.setupIcon}>🌐</Text>
        <Text style={s.setupTitle}>Setup Required</Text>
        <Text style={s.setupBody}>
            The Global Intelligence screen requires a free FRED API key from the Federal Reserve Bank of St. Louis.
        </Text>
        <View style={s.setupSteps}>
            {[
                '1. Visit fred.stlouisfed.org and create a free account',
                '2. Generate your API key under "My Account"',
                '3. Run: npx supabase secrets set FRED_API_KEY=your_key',
                '4. Run: npx supabase functions deploy market-intelligence',
                '5. Run the SQL from the edge function header in Supabase SQL Editor',
            ].map((step, i) => (
                <Text key={i} style={s.setupStep}>{step}</Text>
            ))}
        </View>
        <TouchableOpacity
            style={s.setupBtn}
            onPress={() => Linking.openURL('https://fred.stlouisfed.org/docs/api/api_key.html')}
        >
            <Text style={s.setupBtnText}>Get Free FRED API Key →</Text>
        </TouchableOpacity>
    </View>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function GlobalMarketsScreen() {
    const { intelligence, sectors, loading, refreshing, error, needsSetup, onRefresh } = useGlobalMarkets();
    const [signalTab, setSignalTab] = useState<'all' | 'critical' | 'positive'>('all');

    // ── Loading ──
    if (loading) {
        return (
            <View style={s.center}>
                <StatusBar barStyle="light-content" />
                <ActivityIndicator color={GOLD} size="large" />
                <Text style={s.loadingText}>Fetching global macro data…</Text>
                <Text style={[s.loadingText, { fontSize: 11, marginTop: 6, opacity: 0.6 }]}>
                    FRED · Federal Reserve Economic Data
                </Text>
            </View>
        );
    }

    // ── Setup required ──
    if (needsSetup) {
        return (
            <View style={s.root}>
                <StatusBar barStyle="light-content" />
                <View style={s.glow1} />
                <View style={s.glow2} />
                <View style={s.nav}>
                    <Text style={s.navTitle}>GLOBAL INTELLIGENCE</Text>
                    <Text style={s.navSub}>MACRO ANALYTICS</Text>
                </View>
                <SetupScreen />
            </View>
        );
    }

    // ── Error (sector data still shown if macro failed) ──
    if (error && !intelligence) {
        return (
            <View style={s.center}>
                <StatusBar barStyle="light-content" />
                <Text style={[s.setupIcon, { color: RED }]}>⚠</Text>
                <Text style={[s.setupTitle, { color: RED }]}>Failed to Load</Text>
                <Text style={s.setupBody}>{error}</Text>
                <TouchableOpacity style={s.setupBtn} onPress={onRefresh}>
                    <Text style={s.setupBtnText}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // Safety guard: transient null during state-batching transitions in older RN arch
    if (!intelligence) return null;
    const intel = intelligence;
    const { macro, regime, signals } = intel;

    const maxAbsSector = sectors.reduce((m, s) => Math.max(m, Math.abs(s.changePct)), 0);

    const filteredSignals = signals.filter(sig =>
        signalTab === 'all'      ? true :
        signalTab === 'critical' ? (sig.severity === 'critical' || sig.severity === 'warning') :
                                   (sig.severity === 'positive' || sig.severity === 'neutral')
    );

    const critCount     = signals.filter(s => s.severity === 'critical').length;
    const warnCount     = signals.filter(s => s.severity === 'warning').length;
    const positiveCount = signals.filter(s => s.severity === 'positive').length;

    const genDate = new Date(intel.fetched_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={s.glow1} />
            <View style={s.glow2} />
            <View style={s.glow3} />

            <ScrollView
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={GOLD}
                        colors={[GOLD]}
                    />
                }
            >
                {/* ── Nav ── */}
                <View style={s.nav}>
                    <View>
                        <Text style={s.navTitle}>GLOBAL INTELLIGENCE</Text>
                        <Text style={s.navSub}>
                            {intel.cached ? `CACHED · ${intel.cache_age_min}m AGO` : `LIVE · ${genDate.toUpperCase()}`}
                        </Text>
                    </View>
                    <TouchableOpacity style={s.refreshBtn} onPress={onRefresh} disabled={refreshing}>
                        <Text style={s.refreshBtnText}>↺</Text>
                    </TouchableOpacity>
                </View>

                {/* ── Macro Regime Banner ── */}
                <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                    <RegimeBanner
                        label={regime.label}
                        description={regime.description}
                        color={regime.color}
                        equityStance={regime.equity_stance}
                        bondStance={regime.bond_stance}
                        strategy={regime.strategy}
                    />
                </View>

                {/* ── Economic Indicators ── */}
                <SectionHeader title="ECONOMIC INDICATORS" right="FRED · Federal Reserve" />
                <View style={s.card}>
                    <View style={s.indicatorGrid}>
                        <IndicatorTile
                            label="CPI INFLATION"
                            value={fmtNum(macro.cpi_yoy)}
                            sub="Year-over-Year"
                            color={macro.cpi_yoy === null ? MUTED
                                 : macro.cpi_yoy > 4 ? RED
                                 : macro.cpi_yoy > 2.5 ? ORANGE
                                 : GREEN}
                            badge={macro.cpi_yoy === null ? undefined
                                 : macro.cpi_yoy > 5 ? 'HIGH'
                                 : macro.cpi_yoy > 3 ? 'ELEVATED'
                                 : macro.cpi_yoy > 1 ? 'TARGET'
                                 : 'LOW'}
                            badgeCol={macro.cpi_yoy === null ? MUTED
                                    : macro.cpi_yoy > 4 ? RED
                                    : macro.cpi_yoy > 2.5 ? ORANGE
                                    : GREEN}
                        />
                        <IndicatorTile
                            label="FED FUNDS RATE"
                            value={fmtNum(macro.fed_rate)}
                            sub="Current Target"
                            color={macro.fed_rate === null ? MUTED
                                 : macro.fed_rate > 5 ? RED
                                 : macro.fed_rate > 3.5 ? ORANGE
                                 : GREEN}
                            badge={macro.fed_rate === null ? undefined
                                 : macro.fed_rate > 5 ? 'RESTRICTIVE'
                                 : macro.fed_rate > 3.5 ? 'ELEVATED'
                                 : 'ACCOMMODATIVE'}
                            badgeCol={macro.fed_rate === null ? MUTED
                                    : macro.fed_rate > 5 ? RED
                                    : macro.fed_rate > 3.5 ? ORANGE
                                    : GREEN}
                        />
                        <IndicatorTile
                            label="UNEMPLOYMENT"
                            value={fmtNum(macro.unemployment)}
                            sub="US Rate"
                            color={macro.unemployment === null ? MUTED
                                 : macro.unemployment > 5.5 ? RED
                                 : macro.unemployment < 3.5 ? ORANGE
                                 : GREEN}
                        />
                    </View>
                    <View style={[s.divider, { marginVertical: 16 }]} />
                    <View style={s.indicatorGrid}>
                        <IndicatorTile
                            label="VIX"
                            value={fmtNum(macro.vix, 1, '')}
                            sub="Fear Index"
                            color={macro.vix === null ? MUTED
                                 : macro.vix > 30 ? RED
                                 : macro.vix > 20 ? ORANGE
                                 : macro.vix < 13 ? BLUE
                                 : GREEN}
                            badge={macro.vix === null ? undefined
                                 : macro.vix > 35 ? 'EXTREME FEAR'
                                 : macro.vix > 25 ? 'FEAR'
                                 : macro.vix < 13 ? 'COMPLACENCY'
                                 : 'NORMAL'}
                            badgeCol={macro.vix === null ? MUTED
                                    : macro.vix > 35 ? RED
                                    : macro.vix > 25 ? ORANGE
                                    : macro.vix < 13 ? BLUE
                                    : GREEN}
                        />
                        <IndicatorTile
                            label="10Y TREASURY"
                            value={fmtNum(macro.yield_10y)}
                            sub="Long-Term Rate"
                            color={macro.yield_10y === null ? MUTED
                                 : macro.yield_10y > 5 ? RED
                                 : macro.yield_10y > 4 ? ORANGE
                                 : TEAL}
                        />
                        <IndicatorTile
                            label="2Y TREASURY"
                            value={fmtNum(macro.yield_2y)}
                            sub="Short-Term Rate"
                            color={macro.yield_2y === null ? MUTED
                                 : macro.yield_2y > 5 ? RED
                                 : macro.yield_2y > 4 ? ORANGE
                                 : PURPLE}
                        />
                    </View>
                </View>

                {/* ── Yield Curve ── */}
                <SectionHeader title="YIELD CURVE" right="Recession Indicator" />
                <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                    <YieldCurveCard
                        yield2y={macro.yield_2y}
                        yield10y={macro.yield_10y}
                        spread={macro.yield_spread}
                    />
                </View>

                {/* ── Macro Signals / Investment Tactics ── */}
                <SectionHeader
                    title="INVESTMENT TACTICS"
                    right={`${signals.length} signals`}
                />

                {/* Signal filter tabs */}
                <View style={s.signalTabs}>
                    {([
                        ['all',      `All (${signals.length})`],
                        ['critical', `Risk (${critCount + warnCount})`],
                        ['positive', `Positive (${positiveCount})`],
                    ] as const).map(([tab, label]) => (
                        <TouchableOpacity
                            key={tab}
                            style={[s.signalTab, signalTab === tab && s.signalTabActive]}
                            onPress={() => setSignalTab(tab)}
                        >
                            <Text style={[s.signalTabText, signalTab === tab && s.signalTabTextActive]}>
                                {label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {filteredSignals.length === 0 ? (
                    <View style={[s.card, { alignItems: 'center', paddingVertical: 28 }]}>
                        <Text style={[s.setupBody, { textAlign: 'center', marginBottom: 0 }]}>
                            No {signalTab === 'critical' ? 'risk' : 'positive'} signals in current macro environment.
                        </Text>
                    </View>
                ) : (
                    filteredSignals.map(sig => <MacroSignalCard key={sig.id} signal={sig} />)
                )}

                {/* ── Sector Rotation ── */}
                <SectionHeader title="SECTOR ROTATION" right={`${regime.label} Regime`} />
                <SectorRotationBlock
                    overweight={regime.overweight}
                    underweight={regime.underweight}
                    keyEtfs={regime.key_etfs}
                    fixedIncome={regime.fixed_income}
                />

                {/* ── Live Sector Performance ── */}
                {sectors.length > 0 && (
                    <>
                        <SectionHeader title="LIVE SECTOR PERFORMANCE" right="Today" />
                        <View style={s.card}>
                            {sectors.map((sec, i) => (
                                <React.Fragment key={sec.etf}>
                                    <SectorPerfRow sector={sec} maxAbs={maxAbsSector} />
                                    {i < sectors.length - 1 && <View style={s.sectorRowDivider} />}
                                </React.Fragment>
                            ))}
                        </View>
                    </>
                )}

                {/* ── Disclaimer ── */}
                <Text style={s.disclaimer}>
                    Macro data sourced from Federal Reserve Economic Data (FRED). Market data from Yahoo Finance. Analysis is rule-based and educational — not financial advice. Always conduct your own research before investing.
                </Text>

                <View style={{ height: 32 }} />
            </ScrollView>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: BG,
    },
    center: {
        flex: 1,
        backgroundColor: BG,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    scroll:        { flex: 1 },
    scrollContent: { paddingBottom: 24 },

    // ── Glows ──
    glow1: {
        position: 'absolute', width: 300, height: 300, borderRadius: 150,
        backgroundColor: 'rgba(45,212,191,0.03)', top: -60, right: -60,
    },
    glow2: {
        position: 'absolute', width: 250, height: 250, borderRadius: 125,
        backgroundColor: 'rgba(201,168,76,0.04)', bottom: 250, left: -80,
    },
    glow3: {
        position: 'absolute', width: 200, height: 200, borderRadius: 100,
        backgroundColor: 'rgba(192,132,252,0.03)', top: 350, right: -40,
    },

    // ── Nav ──
    nav: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 58 : 20,
        paddingBottom: 12,
    },
    navTitle: { color: TXT,  fontSize: 16, fontFamily: mono, letterSpacing: 2 },
    navSub:   { color: MUTED, fontSize: 10, fontFamily: mono, letterSpacing: 1.5, marginTop: 2 },
    refreshBtn: {
        width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: BORDER2,
        alignItems: 'center', justifyContent: 'center', backgroundColor: CARD2,
    },
    refreshBtnText: { color: GOLD, fontSize: 18 },

    // ── Card ──
    card: {
        backgroundColor: CARD,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: BORDER,
        marginHorizontal: 16,
        marginBottom: 12,
        padding: 20,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },

    // ── Section header ──
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginBottom: 8,
        marginTop: 4,
    },
    sectionTitle: { color: MUTED, fontSize: 11, fontFamily: mono, letterSpacing: 2 },
    sectionRight: { color: MUTED, fontSize: 11, fontFamily: mono },
    divider:      { height: 1, backgroundColor: BORDER, marginVertical: 14 },

    // ── Regime banner ──
    regimeBanner: {
        backgroundColor: CARD,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: BORDER,
        padding: 20,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },
    regimeLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
    regimeDot:      { width: 8, height: 8, borderRadius: 4 },
    regimeLabel:    { fontSize: 10, fontFamily: mono, letterSpacing: 2, fontWeight: '700' },
    regimeName:     { fontSize: 26, fontFamily: serif, fontWeight: '700', color: TXT, marginBottom: 8, lineHeight: 32 },
    regimeDesc:     { fontSize: 13, fontFamily: sans, color: TXT2, lineHeight: 19, marginBottom: 4 },
    regimeStanceRow:{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    stanceBlock:    { flex: 1 },
    stanceLabel:    { color: MUTED, fontSize: 10, fontFamily: mono, letterSpacing: 1.5, marginBottom: 4 },
    stanceValue:    { fontSize: 15, fontFamily: mono, fontWeight: '700' },
    stanceDivider:  { width: 1, height: 36, backgroundColor: BORDER, marginHorizontal: 20 },
    strategyBox:    {
        flexDirection: 'row',
        alignItems: 'flex-start',
        borderWidth: 1,
        borderRadius: 10,
        padding: 12,
    },
    strategyLabel: { color: GOLD, fontSize: 10, fontFamily: mono, fontWeight: '700', letterSpacing: 1, marginTop: 1, flexShrink: 0 },
    strategyText:  { fontSize: 12, fontFamily: sans, lineHeight: 17, flex: 1 },

    // ── Indicator grid ──
    indicatorGrid: { flexDirection: 'row' },
    indicatorTile: { flex: 1, alignItems: 'center' },
    indLabel:      { color: MUTED, fontSize: 9, fontFamily: mono, letterSpacing: 1, marginBottom: 6, textAlign: 'center' },
    indValue:      { fontSize: 20, fontFamily: mono, fontWeight: '700', marginBottom: 2 },
    indSub:        { color: MUTED, fontSize: 10, fontFamily: mono, marginBottom: 6, textAlign: 'center' },
    indBadge:      { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
    indBadgeText:  { fontSize: 8, fontFamily: mono, fontWeight: '700', letterSpacing: 0.5 },

    // ── Yield curve ──
    yieldCard: {
        backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER,
        marginHorizontal: 0, padding: 20,
    },
    yieldRow:         { flexDirection: 'row', alignItems: 'center', gap: 12 },
    yieldLabel:       { color: MUTED, fontSize: 10, fontFamily: mono, width: 90 },
    yieldBarWrap:     { flex: 1, height: 8, backgroundColor: BORDER, borderRadius: 4, overflow: 'hidden' },
    yieldBar:         { height: '100%', borderRadius: 4 },
    yieldValue:       { fontSize: 14, fontFamily: mono, fontWeight: '700', width: 48, textAlign: 'right' },
    yieldSpreadRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    yieldSpreadLabel: { color: MUTED, fontSize: 11, fontFamily: mono, letterSpacing: 1 },
    yieldSpreadRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    yieldSpreadValue: { fontSize: 20, fontFamily: mono, fontWeight: '700' },
    yieldStatusPill:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
    yieldStatusText:  { fontSize: 10, fontFamily: mono, fontWeight: '700', letterSpacing: 0.5 },
    yieldWarning:     {
        marginTop: 12, color: ORANGE, fontSize: 11, fontFamily: sans,
        lineHeight: 16, fontStyle: 'italic', opacity: 0.85,
    },

    // ── Macro signal cards ──
    signalTabs: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginBottom: 10,
        backgroundColor: CARD,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: BORDER,
        overflow: 'hidden',
    },
    signalTab:         { flex: 1, paddingVertical: 10, alignItems: 'center' },
    signalTabActive:   { backgroundColor: GOLD_D, borderBottomWidth: 2, borderBottomColor: GOLD },
    signalTabText:     { color: MUTED, fontSize: 11, fontFamily: mono },
    signalTabTextActive:{ color: GOLD, fontWeight: '700' },

    signalCard: {
        backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER,
        borderLeftWidth: 4, marginHorizontal: 16, marginBottom: 10, padding: 16,
        shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 }, elevation: 4,
    },
    signalHeader:   { flexDirection: 'row', gap: 8, marginBottom: 10 },
    catBadge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    catText:        { fontSize: 9, fontFamily: mono, fontWeight: '700', letterSpacing: 1 },
    sevBadge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    sevText:        { fontSize: 9, fontFamily: mono, fontWeight: '700', letterSpacing: 1 },
    signalTitleRow: {
        flexDirection: 'row', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 8, marginBottom: 8,
    },
    signalTitle:   { color: TXT, fontSize: 15, fontFamily: serif, fontWeight: '700', flex: 1, lineHeight: 20 },
    valuePill:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 2, flexShrink: 0 },
    valuePillText: { fontSize: 11, fontFamily: mono, fontWeight: '700' },
    signalBody:    { color: TXT2, fontSize: 13, fontFamily: sans, lineHeight: 19, marginBottom: 12 },
    actionBox:     {
        flexDirection: 'row', alignItems: 'flex-start',
        backgroundColor: GOLD_D, borderRadius: 8, padding: 10,
    },
    actionLabel: { color: GOLD, fontSize: 10, fontFamily: mono, fontWeight: '700', letterSpacing: 1, marginTop: 1, flexShrink: 0 },
    actionText:  { color: GOLD_L, fontSize: 12, fontFamily: sans, lineHeight: 17, flex: 1 },

    // ── Sector rotation ──
    rotationGroupLabel: { color: GREEN, fontSize: 10, fontFamily: mono, letterSpacing: 2, marginBottom: 12 },
    rotationRow:    { marginBottom: 14 },
    rotationLeft:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    rotationDot:    { width: 6, height: 6, borderRadius: 3 },
    rotationName:   { color: TXT, fontSize: 13, fontFamily: mono, fontWeight: '600' },
    rotationReason: { color: SUB, fontSize: 12, fontFamily: sans, lineHeight: 17, paddingLeft: 14 },
    etfChip: {
        paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, borderWidth: 1,
    },
    etfChipText:  { fontSize: 10, fontFamily: mono, fontWeight: '700' },
    etfRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    keyEtfChip:   {
        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
        backgroundColor: GOLD_D, borderWidth: 1, borderColor: GOLD_B,
    },
    keyEtfText:   { color: GOLD_L, fontSize: 12, fontFamily: mono, fontWeight: '700' },

    // ── Live sector perf ──
    sectorRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
    sectorName:       { color: TXT2, fontSize: 12, fontFamily: mono, width: 108 },
    sectorBarWrap:    { flex: 1, height: 5, backgroundColor: BORDER, borderRadius: 3, overflow: 'hidden', marginRight: 10 },
    sectorBar:        { height: '100%', borderRadius: 3 },
    sectorPct:        { fontSize: 13, fontFamily: mono, fontWeight: '700', width: 52, textAlign: 'right' },
    sectorRowDivider: { height: 1, backgroundColor: BORDER },

    // ── Setup ──
    setupWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
    setupIcon:  { fontSize: 48, marginBottom: 16 },
    setupTitle: { color: TXT, fontSize: 20, fontFamily: serif, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
    setupBody:  { color: SUB, fontSize: 14, fontFamily: sans, lineHeight: 21, textAlign: 'center', marginBottom: 20, maxWidth: 300 },
    setupSteps: { alignSelf: 'stretch', backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, padding: 16, marginBottom: 20 },
    setupStep:  { color: TXT2, fontSize: 12, fontFamily: mono, lineHeight: 22 },
    setupBtn:   {
        backgroundColor: GOLD, paddingVertical: 14, paddingHorizontal: 28,
        borderRadius: 14, alignItems: 'center',
        shadowColor: GOLD, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    },
    setupBtnText: { color: '#0A0D14', fontSize: 14, fontFamily: sans, fontWeight: '800', letterSpacing: 0.5 },

    // ── Loading ──
    loadingText: { color: MUTED, fontSize: 13, fontFamily: mono, letterSpacing: 1, marginTop: 16 },

    // ── Disclaimer ──
    disclaimer: {
        color: MUTED, fontSize: 11, fontFamily: sans, lineHeight: 16,
        textAlign: 'center', marginHorizontal: 24, marginTop: 8, opacity: 0.65,
    },
});
