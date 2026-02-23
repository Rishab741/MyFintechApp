import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
// Correct relative paths from app/_layout.tsx to the root src folder
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/store/useAuthStore';

export default function RootLayout() {
  const { session, setSession, initialized, setInitialized } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // 1. Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitialized(true);
    });

    // 2. Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!initialized) return;

    const inAuthGroup = segments[0] === '(auth)';

    // Redirect logic
    if (!session && !inAuthGroup) {
      // If not logged in and not in auth screens, go to login
      router.replace('/(auth)/login'); 
    } else if (session && inAuthGroup) {
      // If logged in and trying to access auth screens, go home
      router.replace('/(main)/home' as any);
    }
  }, [session, initialized, segments]);

  return <Slot />;
}