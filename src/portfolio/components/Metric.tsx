import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TXT, MUTED, serif, sans, mono } from '../tokens';

const Metric: React.FC<{ label: string; value: string; color?: string; sub?: string }> = ({ label, value, color = TXT, sub }) => (
    <View style={mt.wrap}>
        <Text style={mt.label}>{label}</Text>
        <Text style={[mt.value, { color }]}>{value}</Text>
        {sub && <Text style={mt.sub}>{sub}</Text>}
    </View>
);

export const mt = StyleSheet.create({
    wrap:  { flex: 1 },
    label: { color: MUTED, fontSize: 9, fontFamily: sans, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5 },
    value: { fontSize: 20, fontWeight: '700', fontFamily: serif },
    sub:   { color: MUTED, fontSize: 10, fontFamily: mono, marginTop: 3 },
});

export default Metric;
