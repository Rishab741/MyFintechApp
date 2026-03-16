import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { create, LinkExit, LinkSuccess, open } from 'react-native-plaid-link-sdk';
import { supabase } from '../src/lib/supabase';

export default function ConnectInvestment() {
  const [loading, setLoading] = useState(false);

  // --- 1. PLAID: For Banks & Traditional Finance ---
  const handlePlaid = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('exchange-plaid-token', {
        body: { action: 'plaid_create' }
      });

      if (error || !data?.link_token) throw new Error("Could not initialize Bank Link");

      create({ token: data.link_token });

      // Small delay to ensure native module readiness
      setTimeout(() => {
        setLoading(false);
        open({
          onSuccess: async (success: LinkSuccess) => {
            await supabase.functions.invoke('exchange-plaid-token', {
              body: { 
                action: 'plaid_exchange', 
                public_token: success.publicToken, 
                metadata: success.metadata 
              }
            });
            Alert.alert("Success", "Bank account synchronized.");
          },
          onExit: (exit: LinkExit) => console.log('Plaid Exit', exit),
        });
      }, 100);
    } catch (err: any) {
      setLoading(false);
      Alert.alert("Connection Error", err.message);
    }
  };

  // --- 2. SNAPTRADE: For Binance, Coinbase, & Brokerages ---
  // This uses the "Portal" flow where users log in directly to the exchange
  const handleBrokerageConnect = async (brokerId?: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('exchange-plaid-token', {
        body: { 
          action: 'snaptrade_create',
          // Optional: specify 'binance' or 'coinbase' to skip the selection screen
          broker: brokerId 
        }
      });

      setLoading(false);

      if (error || !data?.redirect_uri) {
        throw new Error("Could not initialize Brokerage Link");
      }

      // This opens the secure SnapTrade Login Portal in the system browser
      // Once the user logs in, they are redirected back to your app
      const supported = await Linking.canOpenURL(data.redirect_uri);
      if (supported) {
        await Linking.openURL(data.redirect_uri);
      } else {
        Alert.alert("Error", "Cannot open connection portal.");
      }
    } catch (err: any) {
      setLoading(false);
      Alert.alert("Connection Error", err.message);
    }
  };

  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator color="#C9A84C" />
          <Text style={styles.loaderText}>Establishing Secure Connection...</Text>
        </View>
      )}
      
      <View style={styles.grid}>
        <PlatformButton 
          title="Banks & Savings" 
          icon="🏦" 
          onPress={handlePlaid} 
          disabled={loading} 
        />
        <PlatformButton 
          title="Binance" 
          icon="🔶" 
          onPress={() => handleBrokerageConnect('BINANCE')} 
          disabled={loading} 
        />
        <PlatformButton 
          title="Coinbase" 
          icon="🔵" 
          onPress={() => handleBrokerageConnect('COINBASE')} 
          disabled={loading} 
        />
        <PlatformButton 
          title="Other Brokers" 
          icon="📈" 
          onPress={() => handleBrokerageConnect()} 
          disabled={loading} 
        />
      </View>
    </View>
  );
}

const PlatformButton = ({ title, icon, onPress, disabled }: any) => (
  <TouchableOpacity 
    style={[styles.pBtn, disabled && { opacity: 0.5 }]} 
    onPress={onPress} 
    disabled={disabled}
    activeOpacity={0.7}
  >
    <View style={styles.iconCircle}>
      <Text style={{ fontSize: 22 }}>{icon}</Text>
    </View>
    <Text style={styles.pBtnText}>{title}</Text>
    <Text style={styles.pBtnSub}>Connect Seamlessly</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { width: '100%', paddingVertical: 10 },
  grid: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    justifyContent: 'space-between', 
    gap: 12 
  },
  loader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 10
  },
  loaderText: { color: '#C9A84C', fontSize: 12, fontWeight: '600' },
  pBtn: { 
    backgroundColor: '#12161F', 
    width: '48%', 
    padding: 16, 
    borderRadius: 20, 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.08)',
  },
  iconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10
  },
  pBtnText: { color: '#F0EDE6', fontSize: 13, fontWeight: '700' },
  pBtnSub: { color: '#5A6070', fontSize: 10, marginTop: 4 },
});