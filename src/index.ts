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
