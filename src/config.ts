import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let supabaseClient: SupabaseClient | null = null

export interface PalioDelegatedSession {
  label: string
  expiresAt: string
}

export interface PalioDelegatedAuth {
  getSession(): Promise<PalioDelegatedSession | null>
  signOut(): Promise<void>
}

let delegatedAuth: PalioDelegatedAuth | undefined

export function getPalioDelegatedAuth(): PalioDelegatedAuth | undefined {
  return delegatedAuth
}

/**
 * Inizializza il client Supabase condiviso da tutte le viste di questo package.
 * Va chiamata una sola volta, all'avvio dell'app consumatrice (fantapalio o il
 * sito giochi.paliodivigevano.it), passando le credenziali dello STESSO progetto
 * Supabase "Fanta" usato da fantapalio (non quello dei minigiochi/@sforzinda/palio-games).
 */
export function initPalioGiochiUfficiali(options: {
  supabaseUrl: string
  supabaseAnonKey: string
  fetch?: typeof fetch
  delegatedAuth?: PalioDelegatedAuth
}): void {
  delegatedAuth = options.delegatedAuth
  supabaseClient = createClient(options.supabaseUrl, options.supabaseAnonKey, {
    global: options.fetch ? { fetch: options.fetch } : undefined,
  })
}

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    throw new Error(
      '[palio-giochi-ufficiali] initPalioGiochiUfficiali() deve essere chiamata prima di usare le viste del package'
    )
  }
  return supabaseClient
}
