import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GLASS, BORDER, BLUE, MUTED, mono } from '../tokens';
import { Period } from '../types';

const PeriodTabs: React.FC<{ selected: Period; onChange: (p: Period) => void }> = ({ selected, onChange }) => (
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 18 }}>
        {(['1W','1M','3M','ALL'] as Period[]).map(p => (
            <TouchableOpacity key={p} onPress={() => onChange(p)} style={[
                pt.tab,
                selected === p && { backgroundColor: BLUE, borderColor: BLUE },
            ]}>
                <Text style={[pt.txt, selected === p && { color: '#fff' }]}>{p}</Text>
            </TouchableOpacity>
        ))}
    </View>
);

export const pt = StyleSheet.create({
    tab: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8, backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER },
    txt: { color: MUTED, fontSize: 11, fontWeight: '700', fontFamily: mono },
});

export default PeriodTabs;
