import { supabase } from '@/src/lib/supabase';

export interface UserPosition {
  id: string;
  symbol: string;
  name: string | null;
  quantity: number;
  avg_cost: number | null;
  asset_class: string;
  notes: string | null;
  created_at: string;
}

export async function addPosition(params: {
  symbol: string;
  name?: string;
  quantity: number;
  avg_cost?: number | null;
  asset_class?: string;
}): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { error } = await supabase.from('user_positions').upsert(
    {
      user_id:     session.user.id,
      symbol:      params.symbol.toUpperCase(),
      name:        params.name ?? null,
      quantity:    params.quantity,
      avg_cost:    params.avg_cost ?? null,
      asset_class: params.asset_class ?? 'stock',
    },
    { onConflict: 'user_id,symbol' },
  );
  if (error) throw new Error(error.message);
}

export async function listPositions(): Promise<UserPosition[]> {
  const { data, error } = await supabase
    .from('user_positions')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as UserPosition[];
}

export async function deletePosition(id: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const { error } = await supabase
    .from('user_positions')
    .delete()
    .eq('id', id)
    .eq('user_id', session.user.id);
  if (error) throw new Error(error.message);
}

export async function hasPositions(): Promise<boolean> {
  const { count } = await supabase
    .from('user_positions')
    .select('id', { count: 'exact', head: true });
  return (count ?? 0) > 0;
}

// Marks the user as having completed onboarding so the wizard never shows again.
// Stored in Supabase auth user_metadata — no extra table needed.
export async function markOnboarded(): Promise<void> {
  await supabase.auth.updateUser({ data: { onboarded: true } });
}
