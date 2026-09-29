// ============================================================================
// Comun pentru importurile de combustibil (fuel-worker, lde-alim-worker, fuel-strain-worker):
// potrivirea plăcuței pe flotă și ora locală Chișinău. O singură regulă, ca o alimentare să
// ajungă ori la o mașină, ori în lde_fuel_strain — niciodată în ambele, niciodată în niciuna.
// ============================================================================

export const normPlate = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// Benzol și foile LDE scriu unele plăcuțe invers față de vehicles (139HMK vs HMK139).
export const flipPlate = p => { const m = p.match(/^(\d+)([A-Z]+)$/) || p.match(/^([A-Z]+)(\d+)$/); return m ? m[2] + m[1] : null; };

// Plăcuță normalizată → vehicle_id, pe TOATE mașinile (și cele oprite: istoricul lor rămâne la ele).
// Plăcuța dublată în vehicles (319BRAT / «319 BRAT») → câștigă mașina mai veche, cea cu istoric.
export async function vehicleMap(supa) {
  const { data, error } = await supa.from('vehicles').select('id,plate_number,created_at').order('created_at');
  if (error) throw new Error(`Supabase vehicles: ${error.message}`);
  const map = new Map();
  for (const v of data) { const p = normPlate(v.plate_number); if (p && !map.has(p)) map.set(p, v.id); }
  for (const v of data) { const f = flipPlate(normPlate(v.plate_number)); if (f && !map.has(f)) map.set(f, v.id); }
  return map;
}

// Ora locală Moldova → ISO cu offsetul corect al zilei (vară +03:00, iarnă +02:00).
function offsetMin(y, m, d, H, M) {
  const guess = Date.UTC(y, m - 1, d, H, M);
  const g = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Chisinau', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(guess)).map(p => [p.type, p.value]));
  return Math.round((Date.UTC(+g.year, +g.month - 1, +g.day, +g.hour % 24, +g.minute) - guess) / 60000);
}
export function chisinauIso(y, m, d, H = 0, M = 0) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && H >= 0 && H <= 23 && M >= 0 && M <= 59)) return null;
  const off = offsetMin(y, m, d, H, M);
  const p = n => String(Math.abs(n)).padStart(2, '0');
  return `${y}-${p(m)}-${p(d)}T${p(H)}:${p(M)}:00${off >= 0 ? '+' : '-'}${p(Math.trunc(off / 60))}:${p(off % 60)}`;
}

// Benzol: data = DDMMYYYY (uneori fără zeroul din față), ora = HHMM (uneori «853»).
export function benzolIso(data, ora) {
  const d = String(data || '').padStart(8, '0');
  const o = String(ora || '').replace(/\D/g, '').padStart(4, '0').slice(-4);
  const iso = chisinauIso(+d.slice(4, 8), +d.slice(2, 4), +d.slice(0, 2), +o.slice(0, 2), +o.slice(2, 4));
  return iso ? { iso, zi: iso.slice(0, 10) } : null;
}

// Supabase dă cel mult 1000 de rânduri pe răspuns — paginăm până la capăt.
export async function selectAll(query) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await query().range(off, off + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
