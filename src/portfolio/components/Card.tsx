import React from 'react';
import { View } from 'react-native';
import { CARD, BORDER, BORDER2, GOLD } from '../tokens';

const Card: React.FC<{ children: React.ReactNode; style?: any; glow?: string }> = ({ children, style, glow }) => (
    <View style={[{
        backgroundColor: CARD,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: glow ? `${glow}28` : BORDER,
        borderTopColor: glow ? `${glow}50` : BORDER2,
        borderTopWidth: 1,
        padding: 20,
        marginBottom: 14,
        shadowColor: glow ?? GOLD,
        shadowOpacity: glow ? 0.12 : 0.07,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 2 },
        elevation: 5,
    }, style]}>
        {children}
    </View>
);

export default Card;
