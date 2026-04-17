import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Card from '../Card';
import SHead from '../SHead';
import HoldingRow from '../HoldingRow';
import PerformersSection from '../PerformersSection';
import {
    GOLD, MUTED, TXT,
    sans, mono,
} from '../../tokens';
import { fmtCurrency, getTicker } from '../../helpers';
import type { Position, PerformerItem } from '../../types';

interface Props {
    positions:  Position[];
    performers: { top: PerformerItem[]; bottom: PerformerItem[] };
    totalPos:   number;
    currency:   string;
}

export default function PositionsTab({ positions, performers, totalPos, currency }: Props) {
    return (
        <>
            {/* ── Performers ── */}
            <PerformersSection top={performers.top} bottom={performers.bottom} />

            {/* ── Full holdings list ── */}
            {positions.length > 0 ? (
                <Card>
                    <SHead
                        title={`All Holdings · ${positions.length} assets`}
                        right={<Text style={s.totalVal}>{fmtCurrency(totalPos, currency)}</Text>}
                    />
                    {positions.map((pos, i) => (
                        <HoldingRow
                            key={`${getTicker(pos.symbol)}-${i}`}
                            pos={pos}
                            totalValue={totalPos}
                            index={i}
                        />
                    ))}
                </Card>
            ) : (
                <View style={s.empty}>
                    <Text style={s.emptyIcon}>📭</Text>
                    <Text style={s.emptyTitle}>No Positions</Text>
                    <Text style={s.emptySub}>Connect your brokerage to see live holdings here.</Text>
                </View>
            )}
        </>
    );
}

const s = StyleSheet.create({
    totalVal:   { color: MUTED, fontSize: 10, fontFamily: mono },

    empty:      { alignItems: 'center', paddingVertical: 48, gap: 10 },
    emptyIcon:  { fontSize: 40 },
    emptyTitle: { color: TXT, fontSize: 18, fontWeight: '700', fontFamily: sans },
    emptySub:   { color: MUTED, fontSize: 12, textAlign: 'center', lineHeight: 20 },
});
