"use client";

import React from 'react';

export const RainbowButton = ({ label = "Sună șoferul" }: { label?: string }) => {
  return (
    <button type="submit" style={{
      flexShrink: 0, height: 44, border: 'none', borderRadius: 10,
      background: 'rgba(255,255,255,0.92)', color: '#9B1B30',
      fontWeight: 900, fontSize: 13, fontStyle: 'italic',
      padding: '0 28px', cursor: 'pointer', whiteSpace: 'nowrap' as const,
      fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
    }}>
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: 'middle', display: 'inline-block' }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
      {label}
    </button>
  );
};
