import React from 'react';
import { View } from 'react-native';
import { CARD, BORDER, BORDER2, GOLD } from '../tokens';

const Card: React.FC<{ children: React.ReactNode; style?: any; glow?: string }> = ({ children, style, glow }) => (
    <View style={[{
        backgroundColor: CARD,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: glow ? `${glow}28` : BORDER,
        borderTopColor: glow ? `${glow}50` : BORDER2,
        borderTopWidth: 1,
        padding: 18,
        marginBottom: 12,
        shadowColor: glow ?? GOLD,
        shadowOpacity: glow ? 0.10 : 0.06,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 0 },
        elevation: 4,
    }, style]}>
        {children}
    </View>
);

export default Card;
