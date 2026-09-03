import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '../config';

export type PalioAuthStatus = 'loading' | 'signed-out' | 'forbidden' | 'authorized';

export interface PalioAuthState {
  email: string | null;
  session: Session | null;
  status: PalioAuthStatus;
}

/**
 * Autentica l'utente con lo stesso Supabase Auth di fantapalio e verifica,
 * via RPC `can_manage_palio_games()`, che abbia ruolo `is_admin` o
 * `is_palio_games_manager` — stessa funzione usata dalle RLS su
 * `palio_editions`/`palio_edition_results`, quindi sempre coerente coi
 * permessi reali di scrittura.
 */
export function usePalioAuth(): PalioAuthState {
  const supabase = getSupabaseClient();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<PalioAuthStatus>('loading');

  useEffect(() => {
    let isMounted = true;

    async function checkAuthorization(nextSession: Session | null) {
      if (!nextSession) {
        if (isMounted) setStatus('signed-out');
        return;
      }

      const { data, error } = await supabase.rpc('can_manage_palio_games');
      if (!isMounted) return;

      if (error) {
        console.error('Error checking can_manage_palio_games:', error);
        setStatus('forbidden');
        return;
      }

      setStatus(data ? 'authorized' : 'forbidden');
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      checkAuthorization(data.session);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      checkAuthorization(nextSession);
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabase]);

  return {
    email: session?.user?.email ?? null,
    session,
    status,
  };
}
