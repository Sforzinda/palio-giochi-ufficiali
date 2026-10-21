import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getPalioDelegatedAuth, getSupabaseClient, type PalioDelegatedSession } from '../config';

export type PalioAuthStatus = 'loading' | 'signed-out' | 'forbidden' | 'authorized';

export interface PalioAuthState {
  email: string | null;
  isAdmin: boolean;
  session: Session | null;
  status: PalioAuthStatus;
  delegatedSession: PalioDelegatedSession | null;
}

/**
 * Autentica l'utente con lo stesso Supabase Auth di fantapalio e verifica,
 * via RPC `can_manage_palio_games()`, che abbia ruolo `is_admin` o
 * `is_palio_games_manager` — stessa funzione usata dalle RLS su
 * `palio_editions`/`palio_edition_results`, quindi sempre coerente coi
 * permessi reali di scrittura. Espone anche `isAdmin` (letto dalla riga
 * `public.users` dell'utente stesso) per mostrare le sezioni riservate ai
 * soli amministratori, come la gestione utenti.
 */
export function usePalioAuth(): PalioAuthState {
  const supabase = getSupabaseClient();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<PalioAuthStatus>('loading');
  const [isAdmin, setIsAdmin] = useState(false);
  const [delegatedSession, setDelegatedSession] = useState<PalioDelegatedSession | null>(null);

  useEffect(() => {
    let isMounted = true;
    let revision = 0;

    async function checkAuthorization(nextSession: Session | null) {
      const currentRevision = ++revision;
      const delegated = await getPalioDelegatedAuth()?.getSession().catch(() => null);
      if (!isMounted || currentRevision !== revision) return;
      setDelegatedSession(delegated ?? null);
      if (delegated && Date.parse(delegated.expiresAt) > Date.now()) {
        setStatus('authorized');
        setIsAdmin(false);
        return;
      }
      if (!nextSession) {
        if (isMounted) {
          setStatus('signed-out');
          setIsAdmin(false);
        }
        return;
      }

      const { data, error } = await supabase.rpc('can_manage_palio_games');
      if (!isMounted || currentRevision !== revision) return;

      if (error) {
        console.error('Error checking can_manage_palio_games:', error);
        setStatus('forbidden');
        setIsAdmin(false);
        return;
      }

      setStatus(data ? 'authorized' : 'forbidden');

      if (data) {
        const { data: userRow, error: userError } = await supabase
          .from('users')
          .select('is_admin')
          .eq('id', nextSession.user.id)
          .maybeSingle();
        if (!isMounted || currentRevision !== revision) return;
        if (userError) {
          console.error('Error fetching user role:', userError);
          setIsAdmin(false);
          return;
        }
        setIsAdmin(Boolean(userRow?.is_admin));
      } else {
        setIsAdmin(false);
      }
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

    const timer = getPalioDelegatedAuth() ? window.setInterval(() => {
      supabase.auth.getSession().then(({ data }) => checkAuthorization(data.session));
    }, 30_000) : undefined;

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
      window.clearInterval(timer);
    };
  }, [supabase]);

  return {
    email: session?.user?.email ?? null,
    isAdmin,
    session,
    status,
    delegatedSession,
  };
}
