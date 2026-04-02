import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GOLD, GOLD_D, CARD2, BORDER, MUTED, sans } from '../tokens';
import { Period } from '../types';

const PeriodTabs: React.FC<{ selected: Period; onChange: (p: Period) => void }> = ({ selected, onChange }) => (
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
        {(['1W','1M','3M','ALL'] as Period[]).map(p => (
            <TouchableOpacity
                key={p}
                onPress={() => onChange(p)}
                style={[pt.tab, selected === p && { backgroundColor: GOLD_D, borderColor: `${GOLD}40` }]}
            >
                <Text style={[pt.txt, selected === p && { color: GOLD }]}>{p}</Text>
            </TouchableOpacity>
        ))}
    </View>
);

export const pt = StyleSheet.create({
    tab: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8,
           backgroundColor: CARD2, borderWidth: 1, borderColor: BORDER },
    txt: { color: MUTED, fontSize: 11, fontWeight: '700', fontFamily: sans },
});

export default PeriodTabs;
