export default function Loading() {
  return (
    <div className="page-wide">
      <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: 13 }}>
        Se încarcă Moneyball...
      </div>
      <div
        style={{
          height: 180,
          borderRadius: 'var(--radius)',
          background:
            'linear-gradient(90deg, rgba(155,27,48,0.04), rgba(155,27,48,0.08), rgba(155,27,48,0.04))',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.4s infinite',
        }}
      />
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
    </div>
  );
}
