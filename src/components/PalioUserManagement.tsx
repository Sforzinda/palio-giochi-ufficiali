import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, Users as UsersIcon } from 'lucide-react';
import { getSupabaseClient } from '../config';

interface ManagedUser {
  id: string;
  username: string;
  email: string;
  is_admin: boolean;
  is_palio_games_manager: boolean;
}

/**
 * Elenco degli utenti con accesso a questa sezione (admin o responsabili
 * giochi del Palio) e reset password, riservato agli amministratori.
 * Il reset imposta subito la nuova password tramite l'Edge Function
 * `admin-reset-password`, che usa la Service Role Key lato server e rifiuta
 * sia chi non è admin sia i tentativi di resettare un altro admin.
 */
export function PalioUserManagement() {
  const supabase = getSupabaseClient();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('users')
      .select('id, username, email, is_admin, is_palio_games_manager')
      .or('is_admin.eq.true,is_palio_games_manager.eq.true')
      .order('username');
    if (error) {
      console.error('Error fetching palio users:', error);
      setLoadError(`Errore caricamento utenti: ${error.message}`);
      setUsers([]);
      setLoading(false);
      return;
    }
    setUsers((data as ManagedUser[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  function openResetForm(userId: string) {
    setResetTargetId(userId);
    setNewPassword('');
    setResetMessage('');
    setResetError('');
  }

  function closeResetForm() {
    setResetTargetId(null);
    setNewPassword('');
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    if (!resetTargetId || resetting) return;
    if (newPassword.length < 8) {
      setResetError('La password deve avere almeno 8 caratteri');
      return;
    }

    setResetting(true);
    setResetError('');
    try {
      const { data, error } = await supabase.functions.invoke('admin-reset-password', {
        body: { targetUserId: resetTargetId, newPassword },
      });
      if (error) {
        setResetError(error.message);
        return;
      }
      if (data?.error) {
        setResetError(data.error);
        return;
      }
      setResetMessage('Password aggiornata');
      closeResetForm();
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Errore imprevisto');
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-stone-400">Caricamento utenti...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-stone-800 bg-stone-900 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-stone-300">
          <UsersIcon className="h-4 w-4" />
          Utenti con accesso alla Gestione Palio
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Amministratori e responsabili giochi. Solo per questi ultimi puoi impostare una nuova password.
        </p>

        {loadError && <p className="mt-3 text-sm font-semibold text-red-400">{loadError}</p>}
        {resetMessage && <p className="mt-3 text-sm font-semibold text-emerald-400">{resetMessage}</p>}

        <div className="mt-4 overflow-hidden rounded-md border border-stone-700">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_110px_170px] gap-2 border-b border-stone-700 bg-stone-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
            <span>Utente</span>
            <span>Email</span>
            <span>Ruolo</span>
            <span>Password</span>
          </div>
          <div className="divide-y divide-stone-800">
            {users.map((user) => (
              <div key={user.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_110px_170px] items-center gap-2 px-3 py-2.5 text-sm">
                <span className="truncate font-semibold text-stone-100">{user.username}</span>
                <span className="truncate text-stone-400">{user.email}</span>
                <span>
                  {user.is_admin ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/40 px-2 py-0.5 text-xs font-semibold text-amber-300">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Admin
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-stone-800 px-2 py-0.5 text-xs font-semibold text-stone-300">
                      Responsabile
                    </span>
                  )}
                </span>
                <span>
                  {user.is_admin ? (
                    <span className="text-xs text-stone-500">Non gestibile da qui</span>
                  ) : resetTargetId === user.id ? null : (
                    <button
                      type="button"
                      onClick={() => openResetForm(user.id)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-stone-700 px-2.5 py-1 text-xs font-semibold text-stone-300 transition hover:border-palio-400 hover:text-palio-300"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Resetta password
                    </button>
                  )}
                </span>
                {resetTargetId === user.id && (
                  <form onSubmit={handleResetPassword} className="col-span-4 mt-1 flex flex-wrap items-end gap-2 rounded-md border border-palio-500/40 bg-stone-800/60 p-3">
                    <label className="text-xs font-semibold text-stone-300">
                      Nuova password per {user.username}
                      <input
                        type="password"
                        required
                        minLength={8}
                        autoFocus
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="mt-1 block w-56 rounded-md border border-stone-700 bg-stone-900 px-2.5 py-1.5 text-sm text-stone-100 focus:border-palio-400 focus:outline-none focus:ring-2 focus:ring-palio-500/40"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={resetting}
                      className="inline-flex items-center gap-1.5 rounded-md bg-palio-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-palio-600 disabled:opacity-50"
                    >
                      {resetting ? 'Salvataggio...' : 'Conferma'}
                    </button>
                    <button
                      type="button"
                      onClick={closeResetForm}
                      disabled={resetting}
                      className="rounded-md border border-stone-700 px-3 py-1.5 text-sm font-semibold text-stone-300 hover:border-stone-500 disabled:opacity-50"
                    >
                      Annulla
                    </button>
                    {resetError && <p className="w-full text-sm font-semibold text-red-400">{resetError}</p>}
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
