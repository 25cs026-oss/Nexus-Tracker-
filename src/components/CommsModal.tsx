/**
 * Nexus Tactical Comms Modal & HUD
 * 
 * Provides:
 * 1. Tactical Walkie-Talkie (Push-to-Talk) with live wave meter & roger beeps.
 * 2. HD Live Video Calling with dual feed, PIP, camera flipping & military HUD.
 * 3. Incoming Call Toast with interactive Accept / Decline triggers.
 */

import React, { useEffect, useRef, useState } from 'react';
import { 
  commsManager, 
  ActiveCommsSession, 
  IncomingCallInfo 
} from '../utils/commsManager';
import { DeviceMember } from '../types';
import { 
  Radio, 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  PhoneOff, 
  PhoneCall, 
  SwitchCamera, 
  X, 
  Users, 
  Activity, 
  Maximize2, 
  Minimize2,
  Volume2,
  AlertTriangle
} from 'lucide-react';

interface CommsModalProps {
  currentMember: DeviceMember;
  circleName: string;
  members: DeviceMember[];
  isOpen: boolean;
  onClose: () => void;
}

export const CommsModal: React.FC<CommsModalProps> = ({
  currentMember,
  circleName,
  members,
  isOpen,
  onClose
}) => {
  const [session, setSession] = useState<ActiveCommsSession | null>(commsManager.getSession());
  const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(commsManager.getIncomingCall());
  const [isPttPressed, setIsPttPressed] = useState<boolean>(commsManager.isPttActive());
  const [remoteSpeaker, setRemoteSpeaker] = useState<{ name: string; isSpeaking: boolean } | null>(commsManager.getRemoteSpeaker());
  const [callDuration, setCallDuration] = useState<number>(0);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [permissionWarning, setPermissionWarning] = useState<string | null>(commsManager.getPermissionWarning());
  const [streamTick, setStreamTick] = useState<number>(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pttButtonRef = useRef<HTMLButtonElement>(null);

  // Sync state with commsManager
  useEffect(() => {
    const unsubscribe = commsManager.subscribe(() => {
      setSession(commsManager.getSession());
      setIncomingCall(commsManager.getIncomingCall());
      setIsPttPressed(commsManager.isPttActive());
      setRemoteSpeaker(commsManager.getRemoteSpeaker());
      setPermissionWarning(commsManager.getPermissionWarning());
      setStreamTick(t => t + 1);
    });
    return () => unsubscribe();
  }, []);

  // Attach local and remote video streams
  useEffect(() => {
    const localStream = commsManager.getLocalStream();
    if (localVideoRef.current && localStream) {
      if (localVideoRef.current.srcObject !== localStream) {
        localVideoRef.current.srcObject = localStream;
      }
      localVideoRef.current.play().catch(() => {});
    }

    const remoteStream = commsManager.getRemoteStream();
    if (remoteVideoRef.current && remoteStream) {
      if (remoteVideoRef.current.srcObject !== remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [session, session?.status, streamTick]);

  // Call duration timer
  useEffect(() => {
    if (!session || session.status !== 'connected' || session.mode !== 'video') {
      setCallDuration(0);
      return;
    }

    const interval = window.setInterval(() => {
      setCallDuration(Math.floor((Date.now() - session.startedAt) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [session?.status, session?.mode]);

  // Spacebar hotkey for Walkie-Talkie Push-to-Talk
  useEffect(() => {
    if (!isOpen || session?.mode !== 'radio') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        commsManager.pressPtt();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT') {
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
  }, [isOpen, session?.mode]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Other circle members
  const targetCandidates = members.filter(m => m.id !== currentMember.id);

  // Render Incoming Call Toast (always visible on screen when ringing)
  const renderIncomingCallBanner = () => {
    if (!incomingCall) return null;

    return (
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] w-[92%] max-w-md bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-xl border border-blue-500/50 rounded-2xl shadow-2xl p-4 animate-bounce-slow text-white">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-blue-600/30 flex items-center justify-center text-2xl border border-blue-400">
              {incomingCall.callerAvatar || '👤'}
            </div>
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full animate-ping"></span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                Incoming {incomingCall.isVideo ? 'Video Call' : 'Radio Signal'}
              </span>
            </div>
            <h4 className="font-bold text-base text-slate-100 truncate mt-0.5">
              {incomingCall.callerName}
            </h4>
            <p className="text-xs text-slate-400">Connecting from {circleName} grid…</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => commsManager.declineIncomingCall()}
              className="p-3 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 transition-all cursor-pointer"
              title="Decline"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
            <button
              onClick={() => commsManager.acceptIncomingCall()}
              className="p-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 transition-all cursor-pointer animate-pulse"
              title="Accept Video"
            >
              <Video className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  // If no session and no incoming call and not explicitly opened, render nothing
  if (!isOpen && !incomingCall && !session) {
    return null;
  }

  return (
    <>
      {/* 1. Global Incoming Call Toast */}
      {renderIncomingCallBanner()}

      {/* 2. Minimized Comms Widget Floating Pill */}
      {isMinimized && session && (
        <div 
          onClick={() => setIsMinimized(false)}
          className="fixed bottom-24 right-5 z-[9990] bg-slate-900/90 dark:bg-slate-950/90 backdrop-blur-md border border-blue-500/40 shadow-xl rounded-full px-4 py-2 flex items-center gap-3 cursor-pointer text-white hover:scale-105 transition-all"
        >
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-xs font-semibold">
            {session.mode === 'video' ? `Video Call (${formatTimer(callDuration)})` : 'Tactical Walkie-Talkie'}
          </span>
          <Maximize2 className="w-4 h-4 text-slate-400" />
        </div>
      )}

      {/* 3. Main Comms Modal / Full HUD */}
      {isOpen && !isMinimized && (
        <div className="fixed inset-0 z-[9980] flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-md">
          <div className="w-full max-w-2xl bg-slate-900 dark:bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Top Tactical Header */}
            <div className="px-5 py-3.5 bg-slate-800/60 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                  {session?.mode === 'video' ? <Video className="w-5 h-5" /> : <Radio className="w-5 h-5" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-100 text-sm tracking-wide">
                      {session?.mode === 'video' ? 'TACTICAL VIDEO CALL' : 'TACTICAL WALKIE-TALKIE'}
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-md font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      ENCRYPTED P2P
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Frequency: {circleName} GRID // STUN RELAY ACTIVE
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {session && (
                  <button
                    onClick={() => setIsMinimized(true)}
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    title="Minimize"
                  >
                    <Minimize2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => {
                    if (session) commsManager.endCall();
                    onClose();
                  }}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Mode Switcher Tabs if no active session */}
            {!session && (
              <div className="p-5 flex-1 overflow-y-auto">
                <div className="text-center max-w-md mx-auto py-4">
                  <div className="w-16 h-16 rounded-3xl bg-blue-600/10 text-blue-400 flex items-center justify-center mx-auto mb-3 border border-blue-500/30">
                    <Radio className="w-8 h-8" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-100">Tactical Circle Comms</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Instant sub-second audio & HD live video direct to circle members across cities or in the same room without 3rd party apps.
                  </p>

                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => commsManager.openRadio()}
                      className="p-4 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-left flex flex-col gap-2 hover:border-blue-500 transition-all cursor-pointer group"
                    >
                      <div className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 w-fit group-hover:scale-110 transition-transform">
                        <Radio className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-200 text-sm">Circle Walkie-Talkie</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">Broadcast push-to-talk audio to all circle members</div>
                      </div>
                    </button>

                    <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-800 text-left flex flex-col gap-2">
                      <div className="p-2.5 rounded-xl bg-purple-600/20 text-purple-400 w-fit">
                        <Video className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-200 text-sm">Direct Video Call</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">Pick any member below to initiate direct HD video</div>
                      </div>
                    </div>
                  </div>

                  {/* Target Member Quick Selection */}
                  <div className="mt-6 text-left">
                    <label className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
                      Circle Members Online ({targetCandidates.length})
                    </label>
                    <div className="mt-2 space-y-2">
                      {targetCandidates.length === 0 ? (
                        <div className="text-center py-6 text-xs text-slate-500">
                          Waiting for other circle members to join grid…
                        </div>
                      ) : (
                        targetCandidates.map(m => (
                          <div
                            key={m.id}
                            className="p-3 rounded-2xl bg-slate-800/50 border border-slate-800 flex items-center justify-between hover:border-slate-700 transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center text-xl">
                                {m.avatar || '👤'}
                              </div>
                              <div>
                                <h5 className="font-bold text-sm text-slate-200">{m.name}</h5>
                                <span className="text-[11px] text-slate-400">{m.role || 'Member'}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => commsManager.openRadio(m)}
                                className="px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white text-xs font-semibold border border-blue-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
                                title="Open Walkie-Talkie Channel"
                              >
                                <Radio className="w-3.5 h-3.5" />
                                <span>Radio</span>
                              </button>
                              <button
                                onClick={() => commsManager.startVideoCall(m)}
                                className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white text-xs font-semibold border border-emerald-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
                                title="Start Video Call"
                              >
                                <Video className="w-3.5 h-3.5" />
                                <span>Video</span>
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* LIVE VIDEO CALL VIEW */}
            {session && session.mode === 'video' && (
              <div className="relative flex-1 bg-black min-h-[380px] sm:min-h-[460px] flex items-center justify-center overflow-hidden">
                {/* Remote Video Stream (Main Feed) */}
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />

                {/* Connecting / No Feed Fallback */}
                {session.status === 'connecting' && (
                  <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center z-10">
                    <div className="w-20 h-20 rounded-full bg-blue-600/20 border-2 border-blue-500/50 flex items-center justify-center text-4xl mb-4 animate-pulse">
                      {session.targetMember?.avatar || '👤'}
                    </div>
                    <h4 className="text-xl font-bold text-white">Calling {session.targetMember?.name || 'Member'}…</h4>
                    <p className="text-xs text-blue-400 mt-1 font-mono">ESTABLISHING WEBRTC PEER CONNECTION</p>
                    <div className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
                      <Activity className="w-4 h-4 text-emerald-400 animate-spin" />
                      <span>Negotiating STUN traversal between cities…</span>
                    </div>
                  </div>
                )}

                {/* Local Video Stream (PIP Feed in bottom right corner) */}
                <div className="absolute bottom-20 right-4 w-32 h-44 sm:w-36 sm:h-48 rounded-2xl overflow-hidden border-2 border-slate-700 bg-slate-900 shadow-2xl z-20">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover mirror"
                  />
                  <div className="absolute top-1.5 left-2 px-1.5 py-0.5 rounded bg-black/60 text-[9px] text-white font-mono">
                    YOU
                  </div>
                </div>

                {/* HUD Top Left: Telemetry & Duration */}
                <div className="absolute top-4 left-4 z-20 bg-slate-950/70 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-800 flex items-center gap-3 text-white text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                    <span className="font-mono font-bold text-emerald-400">{formatTimer(callDuration)}</span>
                  </div>
                  <span className="text-slate-600">|</span>
                  <span className="font-semibold">{session.targetMember?.name || 'Peer'}</span>
                </div>

                {/* Non-intrusive Media Permission Notice */}
                {permissionWarning && (
                  <div className="absolute top-16 left-4 right-4 z-30 p-2.5 rounded-2xl bg-amber-950/90 border border-amber-500/50 text-amber-200 text-xs backdrop-blur-md flex items-center justify-between gap-2 shadow-2xl animate-fade-in">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                      <span className="truncate">{permissionWarning}</span>
                    </div>
                    <button
                      onClick={() => commsManager.retryMediaPermissions()}
                      className="px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] shrink-0 transition-all cursor-pointer shadow-sm active:scale-95"
                    >
                      Enable Mic/Cam
                    </button>
                  </div>
                )}

                {/* Bottom Call Controls HUD */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-slate-950/80 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-800 flex items-center gap-3">
                  {/* Mute Mic */}
                  <button
                    onClick={() => commsManager.toggleMute()}
                    className={`p-3 rounded-xl transition-all cursor-pointer ${
                      session.isMuted
                        ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                        : 'bg-slate-800 hover:bg-slate-700 text-white'
                    }`}
                    title={session.isMuted ? 'Unmute Mic' : 'Mute Mic'}
                  >
                    {session.isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>

                  {/* Toggle Camera */}
                  <button
                    onClick={() => commsManager.toggleVideo()}
                    className={`p-3 rounded-xl transition-all cursor-pointer ${
                      !session.isVideoEnabled
                        ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                        : 'bg-slate-800 hover:bg-slate-700 text-white'
                    }`}
                    title={session.isVideoEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
                  >
                    {!session.isVideoEnabled ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                  </button>

                  {/* Flip Camera (Front/Back) */}
                  <button
                    onClick={() => commsManager.flipCamera()}
                    className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-all cursor-pointer"
                    title="Flip Camera (Front/Back)"
                  >
                    <SwitchCamera className="w-5 h-5" />
                  </button>

                  {/* End Call Button */}
                  <button
                    onClick={() => commsManager.endCall()}
                    className="p-3 rounded-xl bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 transition-all cursor-pointer"
                    title="End Video Call"
                  >
                    <PhoneOff className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}

            {/* WALKIE-TALKIE (PUSH-TO-TALK) VIEW */}
            {session && session.mode === 'radio' && (
              <div className="p-6 flex-1 flex flex-col items-center justify-between text-center bg-slate-950">
                {/* Channel Header Banner */}
                <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center text-xl border border-blue-500/30">
                      {session.targetMember?.avatar || '📡'}
                    </div>
                    <div className="text-left">
                      <div className="text-xs font-mono text-blue-400 uppercase tracking-wider">
                        {session.isBroadcasting ? 'ALL-CALL BROADCAST' : 'DIRECT RADIO CHANNEL'}
                      </div>
                      <div className="font-bold text-slate-100 text-sm">
                        {session.targetMember ? session.targetMember.name : `${circleName} Emergency Grid`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => commsManager.openRadio(session.targetMember ? undefined : targetCandidates[0])}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      {session.isBroadcasting ? 'Switch to 1-on-1' : 'Switch to Broadcast'}
                    </button>
                  </div>
                </div>

                {/* Tactical Status & Wave Visualizer */}
                <div className="my-8 flex flex-col items-center">
                  {remoteSpeaker?.isSpeaking ? (
                    <div className="flex flex-col items-center animate-pulse">
                      <div className="px-4 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs font-bold font-mono tracking-wider mb-3">
                        RADIO INCOMING // {remoteSpeaker.name.toUpperCase()} SPEAKING
                      </div>
                      {/* Audio Waves */}
                      <div className="flex items-center gap-1.5 h-12">
                        {[40, 70, 90, 50, 85, 100, 60, 95, 45, 80].map((h, i) => (
                          <span
                            key={i}
                            className="w-1.5 bg-emerald-400 rounded-full transition-all duration-75 animate-pulse"
                            style={{ height: `${h}%`, animationDelay: `${i * 60}ms` }}
                          />
                        ))}
                      </div>
                    </div>
                  ) : isPttPressed ? (
                    <div className="flex flex-col items-center">
                      <div className="px-4 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 text-xs font-bold font-mono tracking-wider mb-3 animate-pulse">
                        TRANSMITTING LIVE AUDIO // MIC OPEN
                      </div>
                      {/* Red Audio Waves */}
                      <div className="flex items-center gap-1.5 h-12">
                        {[60, 90, 100, 75, 95, 85, 100, 70, 90, 65].map((h, i) => (
                          <span
                            key={i}
                            className="w-1.5 bg-red-500 rounded-full transition-all duration-75 animate-pulse"
                            style={{ height: `${h}%`, animationDelay: `${i * 50}ms` }}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <div className="px-4 py-1 rounded-full bg-slate-800 text-slate-400 text-xs font-mono tracking-wider mb-3">
                        STANDBY // CHANNEL CLEAR
                      </div>
                      <div className="flex items-center gap-1.5 h-12 opacity-30">
                        {[20, 20, 20, 20, 20, 20, 20, 20, 20, 20].map((h, i) => (
                          <span key={i} className="w-1.5 bg-slate-500 rounded-full" style={{ height: `${h}%` }} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* BIG PUSH-TO-TALK BUTTON */}
                <div className="flex flex-col items-center">
                  <button
                    ref={pttButtonRef}
                    onPointerDown={() => {
                      radioAudio.resumeContext();
                      commsManager.pressPtt();
                    }}
                    onPointerUp={() => commsManager.releasePtt()}
                    onPointerCancel={() => commsManager.releasePtt()}
                    className={`relative w-40 h-40 sm:w-48 sm:h-48 rounded-full flex flex-col items-center justify-center transition-all cursor-pointer select-none active:scale-95 shadow-2xl touch-none ${
                      isPttPressed
                        ? 'bg-gradient-to-b from-red-600 to-red-700 text-white ring-8 ring-red-500/30 shadow-red-600/50'
                        : 'bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white ring-8 ring-blue-500/20 shadow-blue-600/30'
                    }`}
                  >
                    <Radio className={`w-12 h-12 mb-2 ${isPttPressed ? 'animate-bounce' : ''}`} />
                    <span className="font-extrabold text-sm sm:text-base tracking-wider uppercase">
                      {isPttPressed ? 'TRANSMITTING' : 'PUSH TO TALK'}
                    </span>
                    <span className="text-[10px] text-blue-200 mt-0.5">
                      {isPttPressed ? 'Release to End (Roger)' : 'Press & Hold or Spacebar'}
                    </span>
                  </button>

                  <p className="text-[11px] text-slate-500 mt-4">
                    Sub-second OPUS audio • Hardware noise cancellation • Tactical squelch chirps
                  </p>
                </div>

                {/* Bottom Session Exit */}
                <div className="w-full mt-6 pt-4 border-t border-slate-900 flex justify-between items-center">
                  <div className="text-xs text-slate-400">
                    Active unit: <span className="text-slate-200 font-semibold">{currentMember.name}</span>
                  </div>
                  <button
                    onClick={() => commsManager.endCall()}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-red-600/20 hover:text-red-400 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Disconnect Channel
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </>
  );
};
