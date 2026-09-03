import { type FormEvent, type ReactNode, useState } from 'react';
import { LogIn, LogOut, ShieldAlert } from 'lucide-react';
import { getSupabaseClient } from '../config';
import { usePalioAuth } from '../hooks/usePalioAuth';

/**
 * Mostra `children` solo a un utente autenticato con lo stesso account
 * fantapalio e autorizzato (`is_admin` o `is_palio_games_manager`).
 * Altrimenti mostra un form di login o un messaggio di permessi mancanti.
 */
export function PalioAuthGate({ children }: { children: ReactNode }) {
  const supabase = getSupabaseClient();
  const { email, status } = usePalioAuth();
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });

    setSubmitting(false);
    if (signInError) {
      setError('Credenziali non valide.');
      return;
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-950 text-stone-300">
        Caricamento...
      </div>
    );
  }

  if (status === 'authorized') {
    return (
      <div>
        <div className="flex items-center justify-between gap-3 border-b border-stone-800 bg-stone-950 px-4 py-2 text-sm text-stone-400">
          <span className="truncate">Accesso come {email}</span>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-md border border-stone-700 px-2.5 py-1 font-semibold text-stone-300 transition hover:border-stone-500 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            Esci
          </button>
        </div>
        {children}
      </div>
    );
  }

  if (status === 'forbidden') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-stone-950 px-4 text-center text-stone-100">
        <ShieldAlert className="h-10 w-10 text-amber-400" />
        <div>
          <h1 className="text-xl font-bold">Permessi insufficienti</h1>
          <p className="mt-1 max-w-sm text-sm text-stone-400">
            L'account {email} non ha il ruolo "responsabile giochi del Palio". Chiedi a un amministratore del Fanta di abilitarlo.
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-md border border-stone-700 px-4 py-2 text-sm font-semibold text-stone-300 hover:border-stone-500 hover:text-white"
        >
          Cambia account
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-950 px-4">
      <form onSubmit={handleLogin} className="w-full max-w-sm rounded-2xl border border-stone-800 bg-stone-900 p-6 shadow-xl">
        <h1 className="text-lg font-bold text-stone-100">Accesso responsabili giochi</h1>
        <p className="mt-1 text-sm text-stone-400">Stesse credenziali dell'account fantapalio.</p>

        <label className="mt-5 block text-sm font-semibold text-stone-300">
          Email
          <input
            type="email"
            required
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 focus:border-palio-400 focus:outline-none focus:ring-2 focus:ring-palio-500/40"
          />
        </label>
        <label className="mt-3 block text-sm font-semibold text-stone-300">
          Password
          <input
            type="password"
            required
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 focus:border-palio-400 focus:outline-none focus:ring-2 focus:ring-palio-500/40"
          />
        </label>

        {error && <p className="mt-3 text-sm font-semibold text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-palio-500 px-4 py-2 font-semibold text-white transition hover:bg-palio-600 disabled:opacity-50"
        >
          <LogIn className="h-4 w-4" />
          {submitting ? 'Accesso in corso...' : 'Accedi'}
        </button>
      </form>
    </div>
  );
}
