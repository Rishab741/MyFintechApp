import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { QL } from '@/constants/Colors';
import { useOpenDrawer } from '@/src/context/DrawerContext';

export function NavMenuButton() {
  const openDrawer = useOpenDrawer();
  return (
    <Pressable onPress={openDrawer} hitSlop={10} accessibilityLabel="Open navigation menu">
      <View style={s.btn}>
        <MaterialCommunityIcons name="chart-areaspline" size={15} color={QL.GOLD} />
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: {
    width:           32,
    height:          32,
    borderRadius:    9,
    backgroundColor: 'rgba(201,162,75,0.10)',
    borderWidth:     StyleSheet.hairlineWidth,
    borderColor:     'rgba(201,162,75,0.28)',
    alignItems:      'center',
    justifyContent:  'center',
  },
});
