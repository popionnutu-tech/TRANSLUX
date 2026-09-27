// Tipul mașinii după plăcuță (ION-114, Ion 27.09: «pune tip mașină alături»): vehicles → lde_vehicle_norms.vehicle_type_id →
// lde_vehicle_types.display_name, ca în livrare-poster.ts. Plăcuța se compară canonic (fără spații, «ARF744» = «744ARF»). Funcții pure.
export const canonPlaca = (s: string | null | undefined): string => {
  const p = String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = p.match(/^([A-Z]{3})(\d{3})$/);
  return m ? m[2] + m[1] : p;
};

export function tipPePlaca(
  vehicule: { id: string; plate_number: string | null }[],
  norme: { vehicle_id: string; vehicle_type_id: string | null }[],
  tipuri: { id: string; display_name: string | null }[],
): Record<string, string> {
  const nume = new Map(tipuri.map((t) => [t.id, t.display_name]));
  const tipVehicul = new Map(norme.filter((n) => n.vehicle_type_id).map((n) => [n.vehicle_id, nume.get(n.vehicle_type_id!) ?? null]));
  const out: Record<string, string> = {};
  for (const v of vehicule) { const t = tipVehicul.get(v.id); const k = canonPlaca(v.plate_number); if (t && k && !out[k]) out[k] = t; }
  return out;
}
