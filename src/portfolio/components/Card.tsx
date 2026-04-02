import React from 'react';
import { View } from 'react-native';
import { CARD, BORDER } from '../tokens';

const Card: React.FC<{ children: React.ReactNode; style?: any; glow?: string }> = ({ children, style, glow }) => (
    <View style={[{
        backgroundColor: CARD,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: glow ? `${glow}20` : BORDER,
        padding: 18,
        marginBottom: 12,
        shadowColor: glow ?? '#000',
        shadowOpacity: glow ? 0.12 : 0.25,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
    }, style]}>
        {children}
    </View>
);

export default Card;
