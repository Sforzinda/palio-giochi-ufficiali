import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let supabaseClient: SupabaseClient | null = null

/**
 * Inizializza il client Supabase condiviso da tutte le viste di questo package.
 * Va chiamata una sola volta, all'avvio dell'app consumatrice (fantapalio o il
 * sito giochi.paliodivigevano.it), passando le credenziali dello STESSO progetto
 * Supabase "Fanta" usato da fantapalio (non quello dei minigiochi/@sforzinda/palio-games).
 */
export function initPalioGiochiUfficiali(options: {
  supabaseUrl: string
  supabaseAnonKey: string
}): void {
  supabaseClient = createClient(options.supabaseUrl, options.supabaseAnonKey)
}

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    throw new Error(
      '[palio-giochi-ufficiali] initPalioGiochiUfficiali() deve essere chiamata prima di usare le viste del package'
    )
  }
  return supabaseClient
}
