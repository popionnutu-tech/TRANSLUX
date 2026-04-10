'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Conversation } from '@elevenlabs/client';
import type { VoiceConversation } from '@elevenlabs/client';

type CallStatus = 'idle' | 'connecting' | 'active';

export function VoiceCallButton() {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [duration, setDuration] = useState(0);
  const conversationRef = useRef<VoiceConversation | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

  // Duration timer
  useEffect(() => {
    if (status === 'active') {
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status]);

  const startCall = useCallback(async () => {
    if (!agentId || status !== 'idle') return;
    setStatus('connecting');
    try {
      const conversation = await Conversation.startSession({
        agentId,
        onConnect: () => setStatus('active'),
        onDisconnect: () => {
          setStatus('idle');
          conversationRef.current = null;
        },
        onError: (error: unknown) => {
          console.error('ElevenLabs error:', error);
          setStatus('idle');
          conversationRef.current = null;
        },
      });
      conversationRef.current = conversation as VoiceConversation;
    } catch (err) {
      console.error('Failed to start call:', err);
      setStatus('idle');
    }
  }, [agentId, status]);

  const endCall = useCallback(async () => {
    if (conversationRef.current) {
      await conversationRef.current.endSession();
      conversationRef.current = null;
    }
    setStatus('idle');
  }, []);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (!agentId) return null;

  const isActive = status === 'active';
  const isConnecting = status === 'connecting';

  return (
    <>
      {/* Duration badge */}
      {isActive && (
        <div style={{
          position: 'fixed', right: 68, bottom: 72, zIndex: 4,
          background: 'rgba(0,0,0,0.75)', color: '#fff',
          fontSize: 12, fontWeight: 600, padding: '4px 10px',
          borderRadius: 12,
          fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
        }}>
          {formatDuration(duration)}
        </div>
      )}

      {/* Call button */}
      <button
        onClick={isActive ? endCall : startCall}
        disabled={isConnecting}
        aria-label={isActive ? 'End call' : 'Start voice call'}
        style={{
          position: 'fixed', right: 20, bottom: 72, zIndex: 4,
          width: 48, height: 48, borderRadius: '50%',
          border: 'none', cursor: isConnecting ? 'wait' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isActive ? '#ef4444' : isConnecting ? '#facc15' : '#22c55e',
          boxShadow: isActive
            ? '0 4px 20px rgba(239,68,68,0.4)'
            : '0 4px 20px rgba(34,197,94,0.4)',
          transition: 'all 0.2s ease',
          animation: isConnecting ? 'voicePulse 1.2s ease-in-out infinite' : undefined,
        }}
      >
        {isActive ? (
          // Hangup icon
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
            <line x1="23" y1="1" x2="1" y2="23" />
          </svg>
        ) : (
          // Phone icon
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        )}
      </button>

    </>
  );
}
