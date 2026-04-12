export default function Loading() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #fff 0%, #f5f5f6 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Header skeleton */}
      <div style={{
        position: 'absolute', top: 18, left: 40,
        width: 120, height: 36,
        background: 'rgba(155,27,48,0.08)',
        borderRadius: 8,
      }} />
      {/* Hero card skeleton */}
      <div style={{
        width: '100%', maxWidth: 720,
        background: 'rgba(255,255,255,0.6)',
        borderRadius: 24,
        padding: '40px 36px 32px',
        border: '1px solid rgba(255,255,255,0.5)',
      }}>
        <div style={{
          height: 28, width: '60%', margin: '0 auto 28px',
          background: 'rgba(155,27,48,0.06)', borderRadius: 8,
        }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, height: 48, background: 'rgba(155,27,48,0.04)', borderRadius: 12 }} />
          <div style={{ width: 32, height: 48 }} />
          <div style={{ flex: 1, height: 48, background: 'rgba(155,27,48,0.04)', borderRadius: 12 }} />
          <div style={{ width: 120, height: 48, background: 'rgba(155,27,48,0.04)', borderRadius: 12 }} />
          <div style={{ width: 130, height: 48, background: 'rgba(155,27,48,0.08)', borderRadius: 12 }} />
        </div>
      </div>
      {/* Routes card skeleton */}
      <div style={{
        width: '100%', maxWidth: 720, marginTop: 28,
        background: 'rgba(255,255,255,0.5)',
        borderRadius: 24, padding: '24px 36px 28px',
        border: '1px solid rgba(255,255,255,0.4)',
      }}>
        <div style={{
          height: 17, width: '40%', margin: '0 auto 18px',
          background: 'rgba(155,27,48,0.06)', borderRadius: 6,
        }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 48px', maxWidth: 520, margin: '0 auto' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '9px 4px', borderBottom: '1px solid rgba(155,27,48,0.06)',
            }}>
              <div style={{ height: 10, width: '70%', background: 'rgba(155,27,48,0.04)', borderRadius: 4 }} />
              <div style={{ height: 11, width: 50, background: 'rgba(155,27,48,0.06)', borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
