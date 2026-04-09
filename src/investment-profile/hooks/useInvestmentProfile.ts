import { useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/src/lib/supabase';
import type { AssetClass, InvestmentProfile } from '../types';

const defaultProfile: InvestmentProfile = {
  selectedExchanges:    [],
  selectedAssetClasses: [],
  riskLevel:            '',
  baseCurrency:         'AUD',
};

export function useInvestmentProfile() {
  const [profile,    setProfile]    = useState<InvestmentProfile>(defaultProfile);
  const [isSaving,   setIsSaving]   = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);

  const loadProfile = async () => {
    const { data } = await supabase.auth.getUser();
    if (data?.user?.user_metadata?.investment_profile) {
      setProfile(data.user.user_metadata.investment_profile as InvestmentProfile);
    }
  };

  const update = (updates: Partial<InvestmentProfile>) => {
    setProfile(p => ({ ...p, ...updates }));
    setHasUnsaved(true);
  };

  const toggleExchange = (id: string) => {
    setProfile(p => ({
      ...p,
      selectedExchanges: p.selectedExchanges.includes(id)
        ? p.selectedExchanges.filter(e => e !== id)
        : [...p.selectedExchanges, id],
    }));
    setHasUnsaved(true);
  };

  const toggleAsset = (id: AssetClass) => {
    setProfile(p => ({
      ...p,
      selectedAssetClasses: p.selectedAssetClasses.includes(id)
        ? p.selectedAssetClasses.filter(a => a !== id)
        : [...p.selectedAssetClasses, id],
    }));
    setHasUnsaved(true);
  };

  const save = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { investment_profile: profile } });
      if (error) throw error;
      setHasUnsaved(false);
      Alert.alert('Saved ✓', 'Your investment profile has been updated.');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'An error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  return { profile, isSaving, hasUnsaved, loadProfile, update, toggleExchange, toggleAsset, save };
}
