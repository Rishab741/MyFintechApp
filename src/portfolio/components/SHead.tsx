import React from 'react';
import { Text, View } from 'react-native';
import { GOLD, TXT, sans } from '../tokens';

const SHead: React.FC<{ title: string; right?: React.ReactNode }> = ({ title, right }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, marginTop: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <View style={{ width: 3, height: 14, backgroundColor: GOLD, borderRadius: 2, opacity: 0.9 }} />
            <Text style={{ color: TXT, fontSize: 14, fontWeight: '700', fontFamily: sans }}>{title}</Text>
        </View>
        {right}
    </View>
);

export default SHead;
