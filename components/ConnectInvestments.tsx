import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinkExit, LinkSuccess, create, open } from 'react-native-plaid-link-sdk';
import { supabase } from '../src/lib/supabase';

export default function ConnectInvestment() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [hasError, setHasError] = useState(false);

  const fetchToken = useCallback(async () => {
    setIsFetching(true);
    setHasError(false);
    
    // We point to 'exchange-plaid-token' using the 'create' action 
    // to match your consolidated backend logic.
    const { data, error } = await supabase.functions.invoke('exchange-plaid-token', {
      body: { action: 'create' }
    });

    if (error || !data?.link_token) {
      console.error('Plaid Link Token Error:', error);
      setHasError(true);
      setIsFetching(false);
      return;
    }

    setLinkToken(data.link_token);
    create({ token: data.link_token });
    setIsFetching(false);
  }, []);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  const onSuccess = async (success: LinkSuccess) => {
    const { error: exchangeError } = await supabase.functions.invoke('exchange-plaid-token', {
      body: { 
        action: 'exchange',
        public_token: success.publicToken, 
        metadata: success.metadata 
      },
    });
    
    if (exchangeError) {
      Alert.alert("Connection Failed", "We couldn't link your account. Please try again.");
      console.error(exchangeError);
    } else {
      Alert.alert("Success", "Account connected!");
    }
  };

  const handleOpenLink = () => {
    if (linkToken) {
      open({
        onSuccess,
        onExit: (exit: LinkExit) => console.log('User exited link', exit),
      });
    }
  };

  // --- Fallback UI States ---

  if (hasError) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Failed to initialize connection.</Text>
        <TouchableOpacity style={styles.button} onPress={fetchToken}>
          <Text style={styles.buttonText}>Retry Setup</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isFetching || !linkToken) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#C9A84C" />
        <Text style={styles.loadingText}>Initializing Secure Link...</Text>
      </View>
    );
  }

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
  container: { padding: 20, alignItems: 'center' },
  button: { 
    backgroundColor: '#12161F', 
    padding: 18, 
    borderRadius: 12, 
    alignItems: 'center', 
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.3)'
  },
  buttonText: { color: '#E5C97A', fontWeight: 'bold' },
  loadingText: { color: '#5A6070', marginTop: 10, fontSize: 12 },
  errorText: { color: '#E74C3C', marginBottom: 10, fontSize: 12 },
});