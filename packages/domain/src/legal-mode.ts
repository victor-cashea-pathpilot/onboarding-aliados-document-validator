export type LegalMode =
  | 'sociedad_mercantil'
  | 'firma_personal'
  | 'emprendimiento'
  | 'unknown';

export type CedulaPolicyOutcome =
  | 'valid'
  | 'expired_within_10_years'
  | 'expired_over_10_years'
  | 'unknown';
