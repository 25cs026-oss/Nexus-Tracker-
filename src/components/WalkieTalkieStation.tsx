/**
 * Nexus Tactical Walkie-Talkie Station & Comms Deck
 * 
 * Embedded directly in Nexus Tracker main dashboard (Tabs & Dock).
 * Features:
 * - Large tactile PUSH TO TALK button (Mouse, Touch, or Spacebar).
 * - Authentic Motorola/Mil-Spec squelch chirps & roger beeps.
 * - Circle Broadcast (All members) & 1-on-1 direct private radio channels.
 * - HD Live Video Call 1-touch dialer for members.
 * - Microphone test mode & live audio visualizer waves.
 */

import React, { useState, useEffect, useRef } from 'react';
import { DeviceMember } from '../types';
import { commsManager } from '../utils/commsManager';
import { radioAudio } from '../utils/radioAudio';
import { 
  Radio, 
  Video, 
  Users, 
  Mic, 
  Volume2, 
  Sparkles,
  Signal, 
  ShieldCheck, 
  Activity 
} from 'lucide-react';

interface WalkieTalkieStationProps {
  currentMember: DeviceMember;
  circleName: string;
  circlePin: string;
  members: DeviceMember[];
  onStartVideoCall?: (member: DeviceMember) => void;
}

export const WalkieTalkieStation: React.FC<WalkieTalkieStationProps> = ({
  currentMember,
  circleName,
  circlePin,
  members,
  onStartVideoCall
}) => {
  const [isPttPressed, setIsPttPressed] = useState<boolean>(commsManager.isPttActive());
  const [selectedTargetId, setSelectedTargetId] = useState<string>('all'); // 'all' or member.id
  const [remoteSpeaker, setRemoteSpeaker] = useState<{ name: string; isSpeaking: boolean } | null>(commsManager.getRemoteSpeaker());
  const [transmissionCount, setTransmissionCount] = useState<number>(0);

  const isPointerDownRef = useRef<boolean>(false);
  const pressStartTimeRef = useRef<number>(0);

  // Sync state with commsManager
  useEffect(() => {
    const unsub = commsManager.subscribe(() => {
      setIsPttPressed(commsManager.isPttActive());
      setRemoteSpeaker(commsManager.getRemoteSpeaker());
    });
    return () => unsub();
  }, []);

  // Global pointer release listener (guarantees PTT stops even if released outside button)
  useEffect(() => {
    const handleGlobalRelease = () => {
      if (isPointerDownRef.current) {
        isPointerDownRef.current = false;
        const duration = Date.now() - pressStartTimeRef.current;
        if (duration >= 250) {
          handlePttEnd();
        }
      }
    };
    window.addEventListener('pointerup', handleGlobalRelease);
    window.addEventListener('mouseup', handleGlobalRelease);
    window.addEventListener('touchend', handleGlobalRelease);
    window.addEventListener('touchcancel', handleGlobalRelease);
    return () => {
      window.removeEventListener('pointerup', handleGlobalRelease);
      window.removeEventListener('mouseup', handleGlobalRelease);
      window.removeEventListener('touchend', handleGlobalRelease);
      window.removeEventListener('touchcancel', handleGlobalRelease);
    };
  }, []);

  // Keyboard spacebar listener for PTT
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName || '';
      if (e.code === 'Space' && !e.repeat && !['INPUT', 'TEXTAREA'].includes(tag)) {
        e.preventDefault();
        handlePttStart();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName || '';
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(tag)) {
        e.preventDefault();
        handlePttEnd();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedTargetId, members]);

  const handlePttStart = async () => {
    radioAudio.resumeContext();
    if (typeof window !== 'undefined' && (window as any).NexusNative?.ensureMediaPermissions) {
      try { (window as any).NexusNative.ensureMediaPermissions(); } catch {}
    }
    const target = selectedTargetId === 'all' 
      ? undefined 
      : members.find(m => m.id === selectedTargetId);
    await commsManager.openRadio(target);
    await commsManager.pressPtt();
    setIsPttPressed(true);
    setTransmissionCount(c => c + 1);
  };

  const handlePttEnd = () => {
    commsManager.releasePtt();
    setIsPttPressed(false);
  };

  const handlePointerDownAction = (e: React.SyntheticEvent | Event) => {
    try {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    } catch {}

    if (isPointerDownRef.current) return;
    isPointerDownRef.current = true;
    pressStartTimeRef.current = Date.now();

    if (commsManager.isPttActive()) {
      handlePttEnd();
    } else {
      handlePttStart();
    }
  };

  const handlePointerUpAction = (e: React.SyntheticEvent | Event) => {
    try {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    } catch {}

    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;

    const duration = Date.now() - pressStartTimeRef.current;
    if (duration >= 250) {
      handlePttEnd();
    }
  };

  // Other circle members
  const otherMembers = members.filter(m => m.id !== currentMember.id);
  const targetMember = selectedTargetId === 'all' 
    ? null 
    : members.find(m => m.id === selectedTargetId);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 flex flex-col h-full max-h-[580px] shadow-xs overflow-y-auto">
      
      {/* Station Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="font-extrabold text-slate-800 dark:text-slate-100 text-sm">
                Tactical Walkie-Talkie
              </h4>
              <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                P2P LIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Frequency: {circleName} • PIN {circlePin}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
          <Signal className="w-3.5 h-3.5 text-emerald-500" />
          <span>STUN ACTIVE</span>
        </div>
      </div>

      {/* Channel Selector Chips */}
      <div className="mt-3">
        <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
          <span>Active Radio Channel:</span>
          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
            {selectedTargetId === 'all' ? 'All-Call Broadcast' : `Private: ${targetMember?.name}`}
          </span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            type="button"
            onClick={() => setSelectedTargetId('all')}
            className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 font-bold transition-all cursor-pointer whitespace-nowrap text-xs ${
              selectedTargetId === 'all'
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Circle All-Call ({members.length})</span>
          </button>

          {otherMembers.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedTargetId(m.id)}
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 font-bold transition-all cursor-pointer whitespace-nowrap text-xs ${
                selectedTargetId === m.id
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400'
              }`}
            >
              <span>{m.avatar || '👤'}</span>
              <span>{m.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Tactical Radio Visualizer Deck */}
      <div className="my-auto py-4 flex flex-col items-center justify-center text-center">
        {/* Status Callout Banner */}
        {remoteSpeaker?.isSpeaking ? (
          <div className="mb-3 px-3.5 py-1 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 text-xs font-bold font-mono animate-pulse">
            RADIO RECEIVING // {remoteSpeaker.name.toUpperCase()} SPEAKING
          </div>
        ) : isPttPressed ? (
          <div className="mb-3 px-3.5 py-1 rounded-full bg-red-600/20 text-red-600 dark:text-red-400 border border-red-500/40 text-xs font-bold font-mono animate-pulse">
            TRANSMITTING AUDIO // MIC LIVE
          </div>
        ) : (
          <div className="mb-3 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-mono">
            RADIO STANDBY // CHANNEL CLEAR
          </div>
        )}

        {/* Live Audio Waves */}
        <div className="flex items-center gap-1.5 h-10 mb-4">
          {[35, 65, 95, 50, 85, 100, 75, 90, 45, 80].map((h, i) => (
            <span
              key={i}
              className={`w-1.5 rounded-full transition-all duration-75 ${
                isPttPressed
                  ? 'bg-red-500 animate-pulse'
                  : remoteSpeaker?.isSpeaking
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-slate-300 dark:bg-slate-700 opacity-40'
              }`}
              style={{ 
                height: isPttPressed || remoteSpeaker?.isSpeaking ? `${h}%` : '20%',
                animationDelay: `${i * 50}ms` 
              }}
            />
          ))}
        </div>

        {/* THE BIG PUSH-TO-TALK BUTTON */}
        <button
          type="button"
          onPointerDown={handlePointerDownAction}
          onPointerUp={handlePointerUpAction}
          onPointerCancel={handlePointerUpAction}
          onTouchStart={handlePointerDownAction}
          onTouchEnd={handlePointerUpAction}
          onTouchCancel={handlePointerUpAction}
          onMouseDown={handlePointerDownAction}
          onMouseUp={handlePointerUpAction}
          onContextMenu={(e) => e.preventDefault()}
          className={`relative w-40 h-40 sm:w-44 sm:h-44 rounded-full flex flex-col items-center justify-center transition-all cursor-pointer select-none active:scale-95 shadow-2xl touch-none ${
            isPttPressed
              ? 'bg-gradient-to-b from-red-600 to-red-700 text-white ring-8 ring-red-500/30 shadow-red-600/50 scale-102'
              : 'bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white ring-8 ring-blue-500/20 shadow-blue-600/30'
          }`}
          style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
        >
          <Radio className={`w-11 h-11 mb-1.5 pointer-events-none ${isPttPressed ? 'animate-bounce' : ''}`} />
          <span className="font-black text-sm tracking-wider uppercase pointer-events-none">
            {isPttPressed ? 'TRANSMITTING' : 'PUSH TO TALK'}
          </span>
          <span className="text-[10px] text-blue-200 mt-0.5 pointer-events-none">
            {isPttPressed ? 'Release or Tap to End' : 'Press & Hold or Tap to Talk'}
          </span>
        </button>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 max-w-xs">
          Direct P2P audio • Sub-100ms latency across cities or room • Synthesized roger beeps
        </p>
      </div>

      {/* Member Video & Direct Comms Quick Panel */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
        <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center justify-between">
          <span>Circle Members ({members.length})</span>
          <span className="text-[10px] text-slate-400 font-normal">Direct Video & Audio</span>
        </div>

        <div className="space-y-1.5">
          {members.map(m => {
            const isSelf = m.id === currentMember.id;
            return (
              <div
                key={m.id}
                className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-white dark:bg-slate-700 flex items-center justify-center text-base shadow-xs shrink-0">
                    {m.avatar || '👤'}
                  </div>
                  <div className="truncate">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">{m.name}</span>
                      {isSelf && (
                        <span className="text-[9px] px-1 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-600 font-bold">You</span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 block truncate">
                      {m.role || 'Member'} {m.currentPlace ? `• At ${m.currentPlace}` : ''}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {!isSelf && onStartVideoCall && (
                    <button
                      type="button"
                      onClick={() => onStartVideoCall(m)}
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 shadow-sm cursor-pointer transition-all active:scale-95"
                      title={`Start HD Video Call with ${m.name}`}
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Video</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTargetId(m.id);
                      radioAudio.playPttStartChirp();
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                      selectedTargetId === m.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 hover:bg-blue-100 text-slate-700 dark:text-slate-200'
                    }`}
                    title={`Select Radio Channel for ${m.name}`}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>{isSelf ? 'Test' : 'Radio'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};
