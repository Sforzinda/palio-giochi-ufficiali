export { initPalioGiochiUfficiali, getSupabaseClient } from './config'

export {
  usePalioLiveData,
  getPalioGamesForMonth,
  formatEditionLabel,
  formatNumber,
  getResultValue,
  getResultPositionLabel,
  palioGameLabels,
} from './hooks/usePalioLiveData'
export type {
  Contrada,
  PalioMonth,
  PalioGame,
  PalioEdition,
  PalioLiveControl,
  PalioEditionResult,
  PalioEditionHeat,
  RankingItem,
  HeatGroup,
  GameResultsGroup,
  PalioLiveData,
} from './hooks/usePalioLiveData'

export { PalioDraw } from './pages/PalioDraw'
export { PalioLive } from './pages/PalioLive'
export { PalioLiveMobile } from './pages/PalioLiveMobile'
export { PalioWinnerCelebration } from './components/PalioWinnerCelebration'

export { usePalioAuth } from './hooks/usePalioAuth'
export type { PalioAuthState, PalioAuthStatus } from './hooks/usePalioAuth'
export { PalioAuthGate } from './components/PalioAuthGate'
export { PalioGestione } from './components/PalioGestione'

export { useAuspiciData } from './hooks/useAuspiciData'
export type {
  AuspiciAdjustment,
  AuspiciCarta,
  AuspiciCartaType,
  AuspiciData,
  AuspiciEdition,
  AuspiciParticipant,
  AuspiciProva,
  AuspiciRankingItem,
  AuspiciResult,
} from './hooks/useAuspiciData'
export {
  auspiciCartaLabels,
  auspiciProvaDirection,
  auspiciProvaLabels,
  auspiciProvaOrder,
  auspiciProvaRawScoreLabels,
  getAuspiciPoints,
} from './lib/auspici-results'

export { AuspiciClassifica } from './pages/AuspiciClassifica'
export { AuspiciGestione } from './components/AuspiciGestione'
