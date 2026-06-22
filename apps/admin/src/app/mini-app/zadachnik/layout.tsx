import Script from 'next/script';

export const metadata = { title: 'Задачник · TRANSLUX' };

export default function ZadachnikLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
      <div
        style={{
          minHeight: '100vh',
          background: '#faf8f7',
          color: '#2a2024',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <div style={{ maxWidth: 620, margin: '0 auto', padding: '14px 14px 48px' }}>{children}</div>
      </div>
    </>
  );
}
