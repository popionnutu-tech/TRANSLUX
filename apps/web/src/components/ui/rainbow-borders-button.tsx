"use client";

import React from 'react';

export const RainbowButton = ({ label = "Caută cursă" }: { label?: string }) => {
  return (
    <>
      <style>{`
        .cta-search-btn {
          transition: all 0.2s ease;
        }
        .cta-search-btn:hover {
          background: #9B1B30 !important;
          color: white !important;
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(155,27,48,0.3);
        }
        .cta-search-btn:active {
          transform: translateY(0);
        }
      `}</style>
      <button type="submit" className="cta-search-btn" style={{
        flexShrink: 0, height: 48, border: '2px solid #9B1B30', borderRadius: 12,
        background: 'rgba(255,255,255,0.9)', color: '#9B1B30',
        fontWeight: 700, fontSize: 14, fontStyle: 'italic',
        padding: '0 24px', cursor: 'pointer', whiteSpace: 'nowrap' as const,
        fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
        letterSpacing: '0.02em',
      }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: 'middle', display: 'inline-block' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        {label}
      </button>
    </>
  );
};
