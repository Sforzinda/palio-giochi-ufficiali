import bronzone from '../assets/stemmi/bronzone.jpg';
import castello from '../assets/stemmi/castello.jpg';
import cicerino from '../assets/stemmi/cicerino.jpg';
import contado from '../assets/stemmi/contado.jpg';
import costa from '../assets/stemmi/costa.jpg';
import griona from '../assets/stemmi/griona.jpg';
import mercanti from '../assets/stemmi/mercanti.jpg';
import predalata from '../assets/stemmi/predalata.jpg';
import sanCrispino from '../assets/stemmi/san-crispino.jpg';
import sanMartino from '../assets/stemmi/san-martino.jpg';
import strata from '../assets/stemmi/strata.jpg';
import valle from '../assets/stemmi/valle.jpg';

// Mappa il nome della contrada (come salvato in Supabase) allo stemma corrispondente.
const stemmiByContradaName: Record<string, string> = {
  Bronzone: bronzone,
  Castello: castello,
  Cicerino: cicerino,
  Contado: contado,
  Costa: costa,
  Griona: griona,
  Mercanti: mercanti,
  Predalata: predalata,
  'San Martino': sanMartino,
  'Santi Crispino e Crispiniano': sanCrispino,
  Strata: strata,
  Valle: valle
};

export function getContradaStemma(contradaName: string | null | undefined): string | undefined {
  if (!contradaName) return undefined;
  return stemmiByContradaName[contradaName];
}
