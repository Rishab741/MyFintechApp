import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
// Use create and open instead of usePlaidLink
import { LinkExit, LinkSuccess, create, open } from 'react-native-plaid-link-sdk';
import { supabase } from '../src/lib/supabase';

export default function ConnectInvestment() {
  const [linkToken, setLinkToken] = useState<string | null>(null);

  useEffect(() => {
    const fetchToken = async () => {
      const { data, error } = await supabase.functions.invoke('create-plaid-link-token');
      if (data?.link_token) {
        setLinkToken(data.link_token);
        // Pre-initialize Link to reduce latency when the user clicks
        create({ token: data.link_token });
      }
    };
    fetchToken();
  }, []);

  const onSuccess = async (success: LinkSuccess) => {
    const { error } = await supabase.functions.invoke('exchange-plaid-token', {
      body: { public_token: success.publicToken, metadata: success.metadata },
    });
    
    if (!error) Alert.alert("Success", "Account connected!");
  };

  const handleOpenLink = () => {
    if (linkToken) {
      open({
        onSuccess,
        onExit: (exit: LinkExit) => console.log('User exited link', exit),
      });
    }
  };

  if (!linkToken) return <Text>Loading Connection...</Text>;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.button}
        onPress={handleOpenLink}
      >
        <Text style={styles.buttonText}>Connect Investment Account</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  button: { backgroundColor: '#000', padding: 18, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold' }
});