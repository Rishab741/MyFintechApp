import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinkExit, LinkSuccess, create, open } from 'react-native-plaid-link-sdk';
import { supabase } from '../src/lib/supabase';

export default function ConnectInvestment() {
  const [isLoading, setIsLoading] = useState(false);

  const handleConnectPress = async () => {
    setIsLoading(true);

    try {
      // Step 1: Fetch the link token from your edge function
      const { data, error } = await supabase.functions.invoke('exchange-plaid-token', {
        body: { action: 'create' },
      });

      if (error || !data?.link_token) {
        console.error('Plaid Link Token Error:', error ?? 'No link_token in response');
        Alert.alert('Setup Failed', 'Could not initialize bank connection. Please try again.');
        setIsLoading(false);
        return;
      }

      // Step 2: Create the Plaid Link session with the token
      create({ token: data.link_token });

      // Step 3: Open Plaid Link immediately after create()
      open({
        onSuccess: async (success: LinkSuccess) => {
          setIsLoading(true);

          const { error: exchangeError } = await supabase.functions.invoke('exchange-plaid-token', {
            body: {
              action: 'exchange',
              public_token: success.publicToken,
              metadata: success.metadata,
            },
          });

          setIsLoading(false);

          if (exchangeError) {
            console.error('Token exchange error:', exchangeError);
            Alert.alert('Connection Failed', "We couldn't link your account. Please try again.");
          } else {
            Alert.alert('Success! 🎉', 'Your investment account has been connected.');
          }
        },

        onExit: (exit: LinkExit) => {
          setIsLoading(false);
          if (exit.error) {
            console.error('Plaid Link exit with error:', exit.error);
          }
        },
      });

    } catch (err) {
      console.error('Unexpected error:', err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={handleConnectPress}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#E5C97A" />
        ) : (
          <Text style={styles.buttonText}>Connect Investment Account</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'center',
  },
  button: {
    backgroundColor: '#12161F',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.3)',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#E5C97A',
    fontWeight: 'bold',
    fontSize: 15,
  },
});