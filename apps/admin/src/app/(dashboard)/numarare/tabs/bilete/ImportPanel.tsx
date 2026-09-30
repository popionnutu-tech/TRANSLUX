'use client';

// Importul exporturilor «carrier-2-sales-*.csv»: citire în browser, previzualizare, trimitere în bucăți,
// apoi tabela de prețuri și recalculul lunar (deducerea perechilor + totaluri). Fișierele suprapuse sunt în regulă:
// un bilet deja importat se sare după numărul lui.

import { useEffect, useState } from 'react';
import {
  createTikiBatch, insertTikiChunk, finalizeTikiBatch, rebuildTikiPriceMap, runTikiMonth, listTikiBatches, getTikiMeta,
} from '../biletAparatActions';
import { parseTikiExport, packRow, monthsBetween, type ParseResult } from './ticketParse';
import type { TikiBatch } from './types';
import { fmtDate, monthLabel } from './periods';
import { Notice, fmtInt } from './ui';

const CHUNK = 1000;

interface Parsed { file: File; result?: ParseResult; error?: string }

const EXCL_LABEL: Record<string, string> = {
  test: 'de probă (TEST)', data_invalida: 'dată invalidă', pret_invalid: 'preț invalid', fara_bilet: 'fără număr de bilet',
};

function exclText(e: Record<string, number>) {
  const parts = Object.entries(e).filter(([, n]) => n > 0).map(([k, n]) => `${fmtInt(n)} ${EXCL_LABEL[k] ?? k}`);
  return parts.length ? parts.join(', ') : '—';
}

export default function ImportPanel({ onImported }: { onImported: () => void }) {
  const [files, setFiles] = useState<Parsed[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [batches, setBatches] = useState<TikiBatch[]>([]);

  const loadBatches = () => listTikiBatches().then(r => setBatches(r.data ?? []));
  useEffect(() => { loadBatches(); }, []);

  async function pick(list: FileList | null) {
    if (!list) return;
    setError(null); setLog([]);
    const out: Parsed[] = [];
    for (const file of Array.from(list)) {
      const text = await file.text();
      const r = parseTikiExport(text);
      out.push('error' in r ? { file, error: r.error } : { file, result: r });
    }
    setFiles(out);
  }

  async function recompute(months: string[]) {
    setProgress({ label: 'Tabela de prețuri', done: 0, total: months.length + 1 });
    const m = await rebuildTikiPriceMap();
    if (m.error) throw new Error(`Tabela de prețuri: ${m.error}`);
    for (let i = 0; i < months.length; i++) {
      setProgress({ label: `Recalculez ${monthLabel(months[i])}`, done: i + 1, total: months.length + 1 });
      const r = await runTikiMonth(months[i]);
      if (r.error) throw new Error(`${monthLabel(months[i])}: ${r.error}`);
    }
  }

  async function runImport() {
    const ok = files.filter(f => f.result && f.result.rows.length);
    if (!ok.length) return;
    setBusy(true); setError(null); setLog([]);
    const months = new Set<string>();
    try {
      for (const f of ok) {
        const r = f.result!;
        const b = await createTikiBatch({
          file_name: f.file.name, rows_in_file: r.totalLines, rows_excluded: r.excluded,
          rows_dup_in_file: r.duplicatesInFile, date_min: r.dateMin, date_max: r.dateMax,
        });
        if (b.error) throw new Error(b.error);
        let inserted = 0, sent = 0;
        try {
          for (let i = 0; i < r.rows.length; i += CHUNK) {
            const part = r.rows.slice(i, i + CHUNK);
            setProgress({ label: `Încarc ${f.file.name}`, done: i, total: r.rows.length });
            const res = await insertTikiChunk(b.data!, part.map(packRow));
            if (res.error) throw new Error(res.error);
            inserted += res.data ?? 0;
            sent += part.length;
          }
          await finalizeTikiBatch(b.data!, sent, inserted, 'done');
        } catch (e) {
          await finalizeTikiBatch(b.data!, sent, inserted, 'failed');
          throw e;
        }
        if (r.dateMin && r.dateMax) monthsBetween(r.dateMin, r.dateMax).forEach(m => months.add(m));
        setLog(l => [...l, `${f.file.name}: ${fmtInt(inserted)} bilete noi, ${fmtInt(sent - inserted)} erau deja importate.`]);
      }
      await recompute([...months].sort());
      setLog(l => [...l, 'Gata: tipurile de bilet deduse și totalurile recalculate.']);
      setFiles([]);
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false); setProgress(null); loadBatches();
    }
  }

  async function recomputeAll() {
    setBusy(true); setError(null); setLog([]);
    try {
      const m = await getTikiMeta();
      if (m.error) throw new Error(m.error);
      if (!m.data?.date_min || !m.data.date_max) throw new Error('Nu sunt date importate.');
      await recompute(monthsBetween(m.data.date_min, m.data.date_max));
      setLog(['Recalcul complet terminat.']);
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false); setProgress(null);
    }
  }

  const ready = files.filter(f => f.result && f.result.rows.length).length;

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Încarcă exporturile din aparat</div>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 10 }}>
          Fișierele CSV «carrier-2-sales-…» (coloanele Data; Bilet; Rută; De la; Până la; …; Vândut, lei). Poți alege mai multe
          deodată, și perioadele se pot suprapune: fiecare bilet intră o singură dată, după numărul lui.
          Rândurile de probă (TEST) se exclud; «Anulare» se păstrează ca vânzări fără cursă.
        </div>
        <input type="file" accept=".csv,text/csv" multiple disabled={busy} onChange={e => pick(e.target.files)} />

        {files.length > 0 && (
          <table style={{ width: '100%', marginTop: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Fișier</th>
                <th style={{ textAlign: 'left' }}>Perioada</th>
                <th style={{ textAlign: 'right' }}>Rânduri</th>
                <th style={{ textAlign: 'right' }}>Bilete</th>
                <th style={{ textAlign: 'right' }}>Dubluri în fișier</th>
                <th style={{ textAlign: 'left' }}>Excluse</th>
              </tr>
            </thead>
            <tbody>
              {files.map(f => (
                <tr key={f.file.name}>
                  <td style={{ textAlign: 'left' }}>{f.file.name}</td>
                  {f.error ? (
                    <td colSpan={5} style={{ textAlign: 'left', color: 'var(--danger)' }}>{f.error}</td>
                  ) : (
                    <>
                      <td style={{ textAlign: 'left' }}>{f.result!.dateMin ? `${fmtDate(f.result!.dateMin)} – ${fmtDate(f.result!.dateMax!)}` : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{fmtInt(f.result!.totalLines)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtInt(f.result!.rows.length)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtInt(f.result!.duplicatesInFile)}</td>
                      <td style={{ textAlign: 'left', fontSize: 12 }}>{exclText(f.result!.excluded)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={busy || !ready} onClick={runImport}>
            {busy ? 'Se importă…' : `Importă ${ready || ''} ${ready === 1 ? 'fișier' : 'fișiere'}`}
          </button>
          <button className="btn" disabled={busy} onClick={recomputeAll}
            title="Refă deducerea tipurilor de bilet și totalurile pe toate lunile (după ce ai importat date noi cu stații)">
            Recalculează tot
          </button>
        </div>

        {progress && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>{progress.label}…</div>
            <div style={{ height: 8, background: 'rgba(0,0,0,0.06)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`, background: '#9B1B30', transition: 'width .2s' }} />
            </div>
          </div>
        )}
        {error && <div style={{ marginTop: 12 }}><Notice tone="danger">Importul s-a oprit: {error}. Poți relua același fișier: biletele deja trimise nu se dublează.</Notice></div>}
        {log.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {log.map((l, i) => <div key={i} style={{ fontSize: 13, color: 'var(--success)' }}>✓ {l}</div>)}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Istoric importuri</div>
        {batches.length === 0 ? (
          <div style={{ fontSize: 13, color: '#999' }}>Niciun import încă.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Când</th>
                  <th style={{ textAlign: 'left' }}>Fișier</th>
                  <th style={{ textAlign: 'left' }}>Perioada</th>
                  <th style={{ textAlign: 'right' }}>Bilete noi</th>
                  <th style={{ textAlign: 'right' }}>Deja existente</th>
                  <th style={{ textAlign: 'left' }}>Stare</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(b => (
                  <tr key={b.id}>
                    <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{new Date(b.uploaded_at).toLocaleString('ro-RO', { timeZone: 'Europe/Chisinau' })}</td>
                    <td style={{ textAlign: 'left' }}>{b.file_name}<div style={{ fontSize: 11, color: '#999' }}>{b.uploaded_by}</div></td>
                    <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{b.date_min ? `${fmtDate(b.date_min)} – ${fmtDate(b.date_max!)}` : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{fmtInt(b.rows_inserted)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtInt(b.rows_sent - b.rows_inserted)}</td>
                    <td style={{ textAlign: 'left' }}>
                      {b.status === 'done' ? <span style={{ color: 'var(--success)' }}>gata</span>
                        : b.status === 'failed' ? <span style={{ color: 'var(--danger)' }}>întrerupt</span>
                        : <span style={{ color: '#8a5a00' }}>în curs</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
