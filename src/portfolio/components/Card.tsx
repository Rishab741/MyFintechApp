import React from 'react';
import { View } from 'react-native';
import { CARD, BORDER } from '../tokens';

const Card: React.FC<{ children: React.ReactNode; style?: any; glow?: string }> = ({ children, style, glow }) => (
    <View style={[{
        backgroundColor: CARD,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: glow ? `${glow}22` : BORDER,
        padding: 20,
        marginBottom: 14,
        shadowColor: glow ?? '#000',
        shadowOpacity: glow ? 0.08 : 0.3,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
    }, style]}>
        {children}
    </View>
);

export default Card;
