'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addIpRule, toggleIpRule, deleteIpRule, type IpRule } from './actions';
import { IP_PROTECTED_ROLES, type IpProtectedRole } from '@/lib/ip-access-roles';

const ROLE_LABELS: Record<IpProtectedRole, string> = {
  OPERATOR_CAMERE: 'Operator camere',
  ADMIN_CAMERE: 'Administrator camere',
  EVALUATOR_INCASARI: 'Evaluator încasări',
};

interface Props {
  initialRulesByRole: Record<IpProtectedRole, IpRule[]>;
  myIp: string | null;
}

export function IpAccessClient({ initialRulesByRole, myIp }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [copyHint, setCopyHint] = useState('');

  function copyMyIp() {
    if (!myIp) return;
    navigator.clipboard.writeText(myIp).then(() => {
      setCopyHint('Copiat!');
      setTimeout(() => setCopyHint(''), 1500);
    });
  }

  return (
    <>
      <div style={{
        background: '#fff7e6',
        border: '1px solid #f5d289',
        borderRadius: 8,
        padding: 14,
        marginBottom: 24,
        fontSize: 13,
        color: '#7a4e00',
      }}>
        <strong>IP-ul tău curent:</strong>{' '}
        <code style={{ background: '#fff', padding: '2px 8px', borderRadius: 4, marginRight: 8 }}>
          {myIp ?? '— (nu se poate determina, posibil rulezi local)'}
        </code>
        {myIp && (
          <button
            type="button"
            onClick={copyMyIp}
            style={{
              padding: '4px 12px',
              background: '#9B1B30',
              color: '#fff',
              border: 0,
              borderRadius: 4,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {copyHint || 'Copiază'}
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gap: 24 }}>
        {IP_PROTECTED_ROLES.map((role) => (
          <RoleBlock
            key={role}
            role={role}
            label={ROLE_LABELS[role]}
            rules={initialRulesByRole[role]}
            myIp={myIp}
            isPending={isPending}
            onAction={(fn) => {
              startTransition(async () => {
                try {
                  await fn();
                  router.refresh();
                } catch (e) {
                  alert(e instanceof Error ? e.message : 'Eroare');
                }
              });
            }}
          />
        ))}
      </div>
    </>
  );
}

function RoleBlock({
  role, label, rules, myIp, isPending, onAction,
}: {
  role: IpProtectedRole;
  label: string;
  rules: IpRule[];
  myIp: string | null;
  isPending: boolean;
  onAction: (fn: () => Promise<unknown>) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [cidr, setCidr] = useState('');
  const [labelInput, setLabelInput] = useState('');

  const restrictionActive = rules.some(r => r.active);

  return (
    <div style={{
      border: '1px solid rgba(155,27,48,0.1)',
      borderRadius: 12,
      padding: 20,
      background: '#fff',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 16, color: '#9B1B30', fontStyle: 'italic', margin: 0 }}>{label}</h3>
          <p style={{ fontSize: 11, color: '#999', margin: '4px 0 0' }}>
            {restrictionActive
              ? `🔒 Doar de la ${rules.filter(r => r.active).length} IP-uri permise`
              : '⚠️ Fără restricție (orice IP poate intra)'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(s => !s)}
          style={{
            padding: '6px 14px',
            background: showForm ? '#f3f4f6' : '#9B1B30',
            color: showForm ? '#666' : '#fff',
            border: 0,
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {showForm ? 'Anulează' : '+ Adaugă IP'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onAction(async () => {
              await addIpRule(role, cidr, labelInput);
              setCidr('');
              setLabelInput('');
              setShowForm(false);
            });
          }}
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 2fr auto auto',
            gap: 8,
            marginBottom: 16,
            padding: 12,
            background: 'rgba(155,27,48,0.03)',
            borderRadius: 8,
          }}
        >
          <input
            type="text"
            value={cidr}
            onChange={(e) => setCidr(e.target.value)}
            placeholder="93.115.10.5 sau 93.115.10.0/24"
            required
            style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}
          />
          <input
            type="text"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            placeholder="Etichetă (ex: Office Chișinău)"
            required
            style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}
          />
          {myIp && (
            <button
              type="button"
              onClick={() => setCidr(myIp)}
              style={{
                padding: '6px 12px',
                background: '#f3f4f6',
                border: '1px solid #ddd',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              IP-ul meu
            </button>
          )}
          <button
            type="submit"
            disabled={isPending}
            style={{
              padding: '6px 14px',
              background: '#16a34a',
              color: '#fff',
              border: 0,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              opacity: isPending ? 0.6 : 1,
            }}
          >
            Salvează
          </button>
        </form>
      )}

      {rules.length === 0 ? (
        <p style={{ color: '#999', fontSize: 13, fontStyle: 'italic', margin: 0 }}>
          Niciun IP setat — momentan orice IP poate intra cu acest rol.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(155,27,48,0.08)' }}>
              <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, color: 'rgba(155,27,48,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>IP / Subnet</th>
              <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, color: 'rgba(155,27,48,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Etichetă</th>
              <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, color: 'rgba(155,27,48,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Status</th>
              <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: 'rgba(155,27,48,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid rgba(155,27,48,0.04)' }}>
                <td style={{ padding: '10px 6px', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>
                  {r.cidr}
                </td>
                <td style={{ padding: '10px 6px' }}>{r.label}</td>
                <td style={{ padding: '10px 6px' }}>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: r.active ? '#16a34a' : '#999',
                  }}>
                    {r.active ? 'Activ' : 'Inactiv'}
                  </span>
                </td>
                <td style={{ padding: '10px 6px', textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => onAction(() => toggleIpRule(r.id, !r.active))}
                    disabled={isPending}
                    style={{
                      padding: '4px 10px',
                      background: 'transparent',
                      border: '1px solid rgba(155,27,48,0.2)',
                      borderRadius: 4,
                      fontSize: 11,
                      color: '#9B1B30',
                      cursor: 'pointer',
                      marginRight: 6,
                    }}
                  >
                    {r.active ? 'Dezactivează' : 'Activează'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm(`Sigur ștergi regula pentru ${r.cidr}?`)) return;
                      onAction(() => deleteIpRule(r.id));
                    }}
                    disabled={isPending}
                    style={{
                      padding: '4px 10px',
                      background: 'transparent',
                      border: '1px solid rgba(185,28,28,0.2)',
                      borderRadius: 4,
                      fontSize: 11,
                      color: '#b91c1c',
                      cursor: 'pointer',
                    }}
                  >
                    Șterge
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
