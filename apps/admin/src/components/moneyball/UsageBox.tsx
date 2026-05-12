export function UsageBox({
  title,
  what,
  howToUse,
}: {
  title: string;
  what: string;
  howToUse: string[];
}) {
  return (
    <div
      className="card"
      style={{
        padding: '16px 20px',
        background: 'var(--primary-dim)',
        border: '1px solid var(--border-accent)',
        boxShadow: 'none',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)' }}>{title}</div>
      <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{what}</p>
      <div style={{ marginTop: 12 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--primary)',
            marginBottom: 6,
          }}
        >
          Cum folosești
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {howToUse.map((item, i) => (
            <li
              key={i}
              style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text)', padding: '3px 0' }}
            >
              <span style={{ color: 'var(--primary)', fontWeight: 700 }}>·</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
