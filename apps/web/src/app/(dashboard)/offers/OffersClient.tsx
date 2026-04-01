'use client';

import { useState } from 'react';
import type { Offer } from '@translux/db';
import { createOffer, toggleOffer, deleteOffer } from './actions';

interface Props {
  initialOffers: Offer[];
  localities: { name_ro: string }[];
}

export default function OffersClient({ initialOffers, localities }: Props) {
  const [offers, setOffers] = useState(initialOffers);
  const [showForm, setShowForm] = useState(false);
  const [fromLoc, setFromLoc] = useState('');
  const [toLoc, setToLoc] = useState('');
  const [origPrice, setOrigPrice] = useState('');
  const [offerPrice, setOfferPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!fromLoc || !toLoc || !origPrice || !offerPrice) return;
    setSaving(true);
    setError('');
    try {
      await createOffer(fromLoc, toLoc, Number(origPrice), Number(offerPrice));
      // Refresh by adding to local state
      setOffers(prev => [{
        id: Date.now(),
        from_locality: fromLoc,
        to_locality: toLoc,
        original_price: Number(origPrice),
        offer_price: Number(offerPrice),
        active: true,
        created_at: new Date().toISOString(),
      }, ...prev]);
      setShowForm(false);
      setFromLoc(''); setToLoc(''); setOrigPrice(''); setOfferPrice('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: number, active: boolean) {
    try {
      await toggleOffer(id, !active);
      setOffers(prev => prev.map(o => o.id === id ? { ...o, active: !active } : o));
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Ștergeți oferta?')) return;
    try {
      await deleteOffer(id);
      setOffers(prev => prev.filter(o => o.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: '#9B1B30', fontStyle: 'italic' }}>Oferte</h1>
        <button
          className="btn-primary"
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '8px 20px', borderRadius: 10, border: 'none',
            background: '#9B1B30', color: '#fff', fontSize: 13,
            fontWeight: 600, cursor: 'pointer', fontStyle: 'italic',
            fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
          }}
        >
          {showForm ? 'Anulează' : '+ Ofertă nouă'}
        </button>
      </div>

      {error && (
        <div style={{ color: '#b91c1c', background: 'rgba(185,28,28,0.08)', padding: '10px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} style={{
          background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(16px)',
          borderRadius: 16, padding: 24, marginBottom: 24,
          border: '1px solid rgba(155,27,48,0.06)',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
        }}>
          <div className="form-group">
            <label style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 4, display: 'block' }}>De la</label>
            <select
              value={fromLoc} onChange={e => setFromLoc(e.target.value)} required
              style={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid rgba(155,27,48,0.15)', padding: '0 12px', fontSize: 14, background: '#fff' }}
            >
              <option value="">Selectează</option>
              {localities.map(l => <option key={l.name_ro} value={l.name_ro}>{l.name_ro}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 4, display: 'block' }}>Spre</label>
            <select
              value={toLoc} onChange={e => setToLoc(e.target.value)} required
              style={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid rgba(155,27,48,0.15)', padding: '0 12px', fontSize: 14, background: '#fff' }}
            >
              <option value="">Selectează</option>
              {localities.map(l => <option key={l.name_ro} value={l.name_ro}>{l.name_ro}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 4, display: 'block' }}>Preț original (LEI)</label>
            <input
              type="number" value={origPrice} onChange={e => setOrigPrice(e.target.value)} required min="1"
              style={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid rgba(155,27,48,0.15)', padding: '0 12px', fontSize: 14 }}
            />
          </div>
          <div className="form-group">
            <label style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 4, display: 'block' }}>Preț ofertă (LEI)</label>
            <input
              type="number" value={offerPrice} onChange={e => setOfferPrice(e.target.value)} required min="1"
              style={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid rgba(155,27,48,0.15)', padding: '0 12px', fontSize: 14 }}
            />
          </div>
          <div style={{ gridColumn: '1 / -1', textAlign: 'right' }}>
            <button type="submit" disabled={saving} style={{
              padding: '10px 28px', borderRadius: 10, border: 'none',
              background: '#16a34a', color: '#fff', fontSize: 14,
              fontWeight: 600, cursor: 'pointer', fontStyle: 'italic',
              fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
              opacity: saving ? 0.6 : 1,
            }}>
              {saving ? 'Se salvează...' : 'Salvează'}
            </button>
          </div>
        </form>
      )}

      {/* Offers table */}
      <div style={{
        background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(16px)',
        borderRadius: 16, overflow: 'hidden',
        border: '1px solid rgba(155,27,48,0.06)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid rgba(155,27,48,0.08)', textAlign: 'left' }}>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#666', fontSize: 12 }}>Direcția</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#666', fontSize: 12 }}>Preț original</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#666', fontSize: 12 }}>Preț ofertă</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#666', fontSize: 12 }}>Status</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#666', fontSize: 12 }}>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {offers.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#999' }}>Nu sunt oferte</td></tr>
            )}
            {offers.map(offer => (
              <tr key={offer.id} style={{ borderBottom: '1px solid rgba(155,27,48,0.04)' }}>
                <td style={{ padding: '12px 16px', fontWeight: 500 }}>
                  {offer.from_locality} → {offer.to_locality}
                </td>
                <td style={{ padding: '12px 16px', color: '#999', textDecoration: 'line-through' }}>
                  {offer.original_price} LEI
                </td>
                <td style={{ padding: '12px 16px', fontWeight: 700, color: '#16a34a' }}>
                  {offer.offer_price} LEI
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    display: 'inline-block', padding: '3px 10px', borderRadius: 20,
                    fontSize: 11, fontWeight: 600,
                    background: offer.active ? 'rgba(22,163,74,0.1)' : 'rgba(0,0,0,0.05)',
                    color: offer.active ? '#16a34a' : '#999',
                  }}>
                    {offer.active ? 'Activă' : 'Inactivă'}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleToggle(offer.id, offer.active)}
                    style={{
                      padding: '5px 12px', borderRadius: 8,
                      border: '1px solid rgba(155,27,48,0.15)', background: '#fff',
                      fontSize: 12, cursor: 'pointer', color: '#666',
                    }}
                  >
                    {offer.active ? 'Dezactivează' : 'Activează'}
                  </button>
                  <button
                    onClick={() => handleDelete(offer.id)}
                    style={{
                      padding: '5px 12px', borderRadius: 8,
                      border: '1px solid rgba(185,28,28,0.2)', background: '#fff',
                      fontSize: 12, cursor: 'pointer', color: '#b91c1c',
                    }}
                  >
                    Șterge
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
