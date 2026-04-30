export type ValidatableRow = {
  cancelled: boolean;
  driver_id: string | null;
  vehicle_id: string | null;
  foaie_parcurs_nr: string | null;
};

export type MissingField = 'driver' | 'vehicle' | 'foaie';

export type ValidationResult = {
  isValid: boolean;
  missing: MissingField[];
};

export function validateRow(row: ValidatableRow): ValidationResult {
  if (row.cancelled) {
    return { isValid: true, missing: [] };
  }
  const missing: MissingField[] = [];
  if (!row.driver_id) missing.push('driver');
  if (!row.vehicle_id) missing.push('vehicle');
  if (!row.foaie_parcurs_nr) missing.push('foaie');
  return { isValid: missing.length === 0, missing };
}

export function errorMessageRo(missing: MissingField[]): string {
  if (missing.length === 0) return '';
  if (missing.length === 1) {
    switch (missing[0]) {
      case 'driver': return 'Lipsește șofer';
      case 'vehicle': return 'Lipsește auto';
      case 'foaie': return 'Lipsește foaie de parcurs';
    }
  }
  return "Bifează 'Anulată' sau completează șofer + auto + foaie";
}
