/**
 * Nexus Tactical Walkie-Talkie Station & Comms Deck
 * 
 * Embedded in Nexus Tracker main dashboard (Tabs & Dock).
 * Features:
 * - Instant PTT with pre-warmed audio engine (Zero start lag).
 * - Dual PTT Mode: "Hold to Speak" & "Click to Talk" (Hands-free toggle).
 * - Real-time channel switching: Circle Broadcast & 1-on-1 private unit channels.
 * - 1-Touch HD Video Call initiator for members.
 * - Dynamic Tactical audio wave visualizer.
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
  Signal, 
  AlertTriangle,
  RadioTower,
  Headphones
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
  const [selectedTargetId, setSelectedTargetId] = useState<string>('all');
  const [remoteSpeaker, setRemoteSpeaker] = useState<{ name: string; isSpeaking: boolean } | null>(commsManager.getRemoteSpeaker());
  const [isToggleMode, setIsToggleMode] = useState<boolean>(false);
  const [permissionWarning, setPermissionWarning] = useState<string | null>(commsManager.getPermissionWarning());

  const isPointerDownRef = useRef<boolean>(false);
  const pressStartTimeRef = useRef<number>(0);
  const lastActionTimeRef = useRef<number>(0);

  // Pre-warm microphone on station load only if not already in an active video call
  useEffect(() => {
    const currentSession = commsManager.getSession();
    if (!currentSession || currentSession.mode !== 'video') {
      commsManager.openRadio(selectedTargetId === 'all' ? undefined : members.find(m => m.id === selectedTargetId));
    }
  }, [selectedTargetId]);

  // Sync state with commsManager
  useEffect(() => {
    const unsub = commsManager.subscribe(() => {
      setIsPttPressed(commsManager.isPttActive());
      setRemoteSpeaker(commsManager.getRemoteSpeaker());
      setPermissionWarning(commsManager.getPermissionWarning());
    });
    return () => unsub();
  }, []);

  // Global pointer release listener (guarantees PTT stops even if released outside button)
  useEffect(() => {
    const handleGlobalRelease = () => {
      if (!isToggleMode && isPointerDownRef.current) {
        isPointerDownRef.current = false;
        const duration = Date.now() - pressStartTimeRef.current;
        if (duration >= 200) {
          commsManager.releasePtt();
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
  }, [isToggleMode]);

  // Keyboard spacebar listener for PTT
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName || '';
      if (e.code === 'Space' && !e.repeat && !['INPUT', 'TEXTAREA'].includes(tag)) {
        e.preventDefault();
        radioAudio.resumeContext();
        commsManager.pressPtt();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName || '';
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(tag)) {
        e.preventDefault();
        commsManager.releasePtt();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    try {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    } catch {}

    const now = Date.now();
    if (now - lastActionTimeRef.current < 200) return;
    lastActionTimeRef.current = now;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    radioAudio.resumeContext();

    if (isToggleMode) {
      if (commsManager.isPttActive()) {
        commsManager.releasePtt();
      } else {
        commsManager.pressPtt();
      }
      return;
    }

    isPointerDownRef.current = true;
    pressStartTimeRef.current = now;
    commsManager.pressPtt();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    try {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    } catch {}

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    if (isToggleMode) return;

    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;
    const duration = Date.now() - pressStartTimeRef.current;

    if (duration >= 200) {
      commsManager.releasePtt();
    }
  };

  const otherMembers = members.filter(m => m.id !== currentMember.id);
  const targetMember = selectedTargetId === 'all' 
    ? null 
    : members.find(m => m.id === selectedTargetId);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 flex flex-col h-full max-h-[620px] shadow-xs overflow-y-auto">
      
      {/* Station Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/80 shadow-xs">
            <RadioTower className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="font-extrabold text-slate-800 dark:text-slate-100 text-sm tracking-tight">
                Tactical Walkie-Talkie
              </h4>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                P2P LIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {circleName} • Room #{circlePin}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode Switcher: Hold vs Click Toggle */}
          <button
            type="button"
            onClick={() => setIsToggleMode(prev => !prev)}
            className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border transition-all cursor-pointer ${
              isToggleMode
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
            }`}
            title="Switch between Hold to Speak and 1-Click Hands-free mode"
          >
            {isToggleMode ? 'Mode: Click to Talk' : 'Mode: Hold to Talk'}
          </button>
        </div>
      </div>

      {/* Permission Warning Notice if mic blocked */}
      {permissionWarning && (
        <div className="mt-2.5 p-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800/80 text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="truncate text-[11px]">{permissionWarning}</span>
          </div>
          <button
            type="button"
            onClick={() => commsManager.retryMediaPermissions()}
            className="px-2 py-0.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] shrink-0 transition-colors"
          >
            Allow Mic
          </button>
        </div>
      )}

      {/* Channel Selector Chips */}
      <div className="mt-3">
        <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Headphones className="w-3.5 h-3.5 text-indigo-500" />
            <span>Target Channel:</span>
          </span>
          <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
            {selectedTargetId === 'all' ? 'All Members Broadcast' : `Private: ${targetMember?.name}`}
          </span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedTargetId('all')}
            className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 font-bold transition-all cursor-pointer whitespace-nowrap text-xs ${
              selectedTargetId === 'all'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
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
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
              }`}
            >
              <span>{m.avatar || '👤'}</span>
              <span>{m.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Tactical Radio Deck */}
      <div className="my-auto py-4 flex flex-col items-center justify-center text-center">
        {/* Status Callout Banner */}
        {remoteSpeaker?.isSpeaking ? (
          <div className="mb-3 px-4 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 text-xs font-bold font-mono tracking-wide animate-pulse">
            RADIO RECEIVING // {remoteSpeaker.name.toUpperCase()} SPEAKING
          </div>
        ) : isPttPressed ? (
          <div className="mb-3 px-4 py-1.5 rounded-full bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-800 text-xs font-bold font-mono tracking-wide animate-pulse">
            TRANSMITTING LIVE // MIC OPEN
          </div>
        ) : (
          <div className="mb-3 px-3.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 text-xs font-mono">
            CHANNEL STANDBY // READY TO TRANSMIT
          </div>
        )}

        {/* Live Audio Wave Visualizer */}
        <div className="flex items-center gap-1.5 h-10 mb-4">
          {[35, 65, 95, 50, 85, 100, 75, 90, 45, 80].map((h, i) => (
            <span
              key={i}
              className={`w-1.5 rounded-full transition-all duration-75 ${
                isPttPressed
                  ? 'bg-rose-500 animate-pulse'
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

        {/* THE PUSH-TO-TALK BUTTON */}
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onContextMenu={(e) => e.preventDefault()}
          className={`relative w-40 h-40 sm:w-44 sm:h-44 rounded-full flex flex-col items-center justify-center transition-all cursor-pointer select-none active:scale-95 shadow-xl touch-none ${
            isPttPressed
              ? 'bg-gradient-to-b from-rose-600 to-rose-700 text-white ring-8 ring-rose-500/30 shadow-rose-600/40 scale-102'
              : 'bg-gradient-to-b from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white ring-8 ring-indigo-500/20 shadow-indigo-600/30'
          }`}
          style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
        >
          <Radio className={`w-11 h-11 mb-1.5 pointer-events-none ${isPttPressed ? 'animate-bounce' : ''}`} />
          <span className="font-black text-sm tracking-wider uppercase pointer-events-none">
            {isPttPressed ? 'TRANSMITTING' : 'PUSH TO TALK'}
          </span>
          <span className="text-[10px] text-indigo-200 mt-0.5 pointer-events-none font-medium">
            {isPttPressed 
              ? (isToggleMode ? 'Click to Finish' : 'Release to Send')
              : (isToggleMode ? 'Click to Start' : 'Hold to Speak')}
          </span>
        </button>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 max-w-xs font-medium">
          Instant voice bursts across cities & rooms • Auto-squelch roger beeps
        </p>
      </div>

      {/* Member Video & Comms Quick Panel */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
        <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center justify-between">
          <span>Circle Members ({members.length})</span>
          <span className="text-[10px] text-slate-400 font-normal">HD Video & Radio Channels</span>
        </div>

        <div className="space-y-1.5">
          {members.map(m => {
            const isSelf = m.id === currentMember.id;
            return (
              <div
                key={m.id}
                className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-2"
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
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer transition-all active:scale-95"
                      title={`Start HD Video Call with ${m.name}`}
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Video</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedTargetId(m.id)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                      selectedTargetId === m.id
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-200 dark:bg-slate-700 hover:bg-indigo-100 dark:hover:bg-indigo-950 text-slate-700 dark:text-slate-200'
                    }`}
                    title={`Select Radio Channel for ${m.name}`}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>{isSelf ? 'My Mic' : 'Radio'}</span>
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
