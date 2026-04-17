import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import Card from '../Card';
import SHead from '../SHead';
import HoldingRow from '../HoldingRow';
import {
    GOLD, GOLD_D, GREEN, GREEN_D, RED, RED_D,
    TXT, TXT2, MUTED, SUB,
    sans, mono,
} from '../../tokens';
import { fmtCurrency, fmt2, sign, getTicker } from '../../helpers';
import type { AllocSeg, PerformerItem, Position } from '../../types';

interface Props {
    totalVal:  number;
    totalPos:  number;
    totalPnl:  number;
    cash:      number;
    currency:  string;
    positions: Position[];
    allocSegs: AllocSeg[];
}

const ALLOC_COLORS = ['#8ff5ff', '#ac89ff', '#ff6b98', '#00E09A', '#FFA500', '#a5abbd'];

// ── Allocation bar row ────────────────────────────────────────────────────────
const AllocRow: React.FC<{ label: string; pct: number; color: string; mv: string }> =
    ({ label, pct, color, mv }) => (
    <View style={s.allocRow}>
        <View style={s.allocMeta}>
            <Text style={s.allocLabel}>{label.toUpperCase()}</Text>
            <Text style={[s.allocMv, { color }]}>{mv}</Text>
        </View>
        <View style={s.track}>
            <View style={[s.fill, { width: `${Math.min(pct, 100)}%`, backgroundColor: color }]} />
        </View>
        <Text style={[s.allocPct, { color }]}>{fmt2(pct)}%</Text>
    </View>
);

// ── Stat pill ─────────────────────────────────────────────────────────────────
const Stat: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color = TXT2 }) => (
    <View style={s.statCell}>
        <Text style={s.statLabel}>{label}</Text>
        <Text style={[s.statValue, { color }]}>{value}</Text>
    </View>
);

export default function OverviewTab({ totalVal, totalPos, totalPnl, cash, currency, positions, allocSegs }: Props) {
    const invested = totalPos;
    const pnlColor = totalPnl >= 0 ? GREEN : RED;

    return (
        <>
            {/* ── Portfolio composition ── */}
            <Card>
                <SHead title="Portfolio Composition" />
                <View style={s.statsRow}>
                    <Stat label="INVESTED"    value={fmtCurrency(invested, currency)} />
                    <View style={s.div} />
                    <Stat label="CASH"        value={fmtCurrency(cash, currency)} />
                    <View style={s.div} />
                    <Stat label="POSITIONS"   value={String(positions.length)} />
                    {totalPnl !== 0 && <>
                        <View style={s.div} />
                        <Stat label="OPEN P&L" value={`${sign(totalPnl)}${fmtCurrency(Math.abs(totalPnl), currency)}`} color={pnlColor} />
                    </>}
                </View>
            </Card>

            {/* ── Asset allocation ── */}
            {allocSegs.length > 0 && (
                <Card>
                    <SHead title="Asset Allocation" />
                    {allocSegs.map((seg, i) => (
                        <AllocRow
                            key={seg.label}
                            label={seg.label}
                            pct={seg.pct}
                            color={ALLOC_COLORS[i % ALLOC_COLORS.length]}
                            mv={fmtCurrency(seg.value, currency)}
                        />
                    ))}
                    <TouchableOpacity style={s.rebalBtn}>
                        <Text style={s.rebalTxt}>REBALANCE PORTFOLIO</Text>
                    </TouchableOpacity>
                </Card>
            )}

            {/* ── Top holdings preview ── */}
            {positions.length > 0 && (
                <Card>
                    <SHead
                        title="Top Holdings"
                        right={
                            <TouchableOpacity onPress={() => router.push('/Holdings' as any)}>
                                <Text style={s.seeAll}>SEE ALL →</Text>
                            </TouchableOpacity>
                        }
                    />
                    {positions.slice(0, 4).map((pos, i) => (
                        <HoldingRow
                            key={`${getTicker(pos.symbol)}-${i}`}
                            pos={pos}
                            totalValue={totalPos}
                            index={i}
                        />
                    ))}
                </Card>
            )}
        </>
    );
}

const s = StyleSheet.create({
    statsRow:   { flexDirection: 'row', backgroundColor: 'rgba(15,22,40,0.7)', borderRadius: 4,
                  borderWidth: 1, borderColor: 'rgba(65,72,87,0.5)', padding: 14, marginBottom: 4 },
    statCell:   { flex: 1, alignItems: 'center' },
    statLabel:  { color: MUTED, fontSize: 8, fontFamily: mono, letterSpacing: 2, marginBottom: 5 },
    statValue:  { fontSize: 12, fontWeight: '700', fontFamily: mono },
    div:        { width: 1, backgroundColor: 'rgba(65,72,87,0.6)', marginHorizontal: 4, alignSelf: 'stretch' },

    allocRow:   { marginBottom: 14 },
    allocMeta:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    allocLabel: { color: MUTED, fontSize: 8, fontFamily: mono, letterSpacing: 2.5 },
    allocMv:    { fontSize: 10, fontFamily: mono, fontWeight: '700' },
    track:      { height: 4, backgroundColor: 'rgba(65,72,87,0.5)', borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
    fill:       { height: '100%', borderRadius: 2, opacity: 0.88 },
    allocPct:   { fontSize: 11, fontWeight: '700', fontFamily: mono },

    rebalBtn:   { marginTop: 4, borderWidth: 1, borderColor: `${GOLD}35`, borderRadius: 4,
                  paddingVertical: 13, alignItems: 'center', backgroundColor: GOLD_D },
    rebalTxt:   { color: GOLD, fontSize: 11, fontWeight: '800', fontFamily: mono, letterSpacing: 2.5 },

    seeAll:     { color: GOLD, fontSize: 10, fontWeight: '700', fontFamily: mono, letterSpacing: 1 },
});
