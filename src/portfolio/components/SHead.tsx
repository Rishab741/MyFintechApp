import React from 'react';
import { Text, View } from 'react-native';
import { GOLD, TXT, serif } from '../tokens';

const SHead: React.FC<{ title: string; right?: React.ReactNode }> = ({ title, right }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 3, height: 14, backgroundColor: GOLD, borderRadius: 2 }} />
            <Text style={{ color: TXT, fontSize: 14, fontWeight: '700', fontFamily: serif }}>{title}</Text>
        </View>
        {right}
    </View>
);

export default SHead;
