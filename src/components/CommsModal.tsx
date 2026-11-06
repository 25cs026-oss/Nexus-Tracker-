/**
 * Nexus Tactical Comms Modal & Video Call HUD
 * 
 * Provides:
 * 1. HD Live Video Calling with dual video feeds (Main + PIP), flip camera & controls.
 * 2. Tactical Walkie-Talkie with instant pre-warmed PTT & live wave meter.
 * 3. Incoming Call Toast with interactive Accept / Decline triggers.
 * 4. Single-channel audio routing preventing echoing, screeching, and feedback loops.
 */

import React, { useEffect, useRef, useState } from 'react';
import { 
  commsManager, 
  ActiveCommsSession, 
  IncomingCallInfo 
} from '../utils/commsManager';
import { radioAudio } from '../utils/radioAudio';
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
  AlertTriangle,
  RadioTower,
  Sparkles
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
  const [isToggleMode, setIsToggleMode] = useState<boolean>(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const isPttPointerDown = useRef<boolean>(false);
  const pttPressStartTime = useRef<number>(0);
  const lastPttActionTime = useRef<number>(0);

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

  // Global window release listener for safe PTT release
  useEffect(() => {
    const handleGlobalPttRelease = () => {
      if (!isToggleMode && isPttPointerDown.current) {
        isPttPointerDown.current = false;
        const duration = Date.now() - pttPressStartTime.current;
        if (duration >= 200) {
          commsManager.releasePtt();
        }
      }
    };
    window.addEventListener('pointerup', handleGlobalPttRelease);
    window.addEventListener('mouseup', handleGlobalPttRelease);
    window.addEventListener('touchend', handleGlobalPttRelease);
    window.addEventListener('touchcancel', handleGlobalPttRelease);
    return () => {
      window.removeEventListener('pointerup', handleGlobalPttRelease);
      window.removeEventListener('mouseup', handleGlobalPttRelease);
      window.removeEventListener('touchend', handleGlobalPttRelease);
      window.removeEventListener('touchcancel', handleGlobalPttRelease);
    };
  }, [isToggleMode]);

  const handlePttDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    try {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    } catch {}

    const now = Date.now();
    if (now - lastPttActionTime.current < 200) return;
    lastPttActionTime.current = now;

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

    isPttPointerDown.current = true;
    pttPressStartTime.current = now;
    commsManager.pressPtt();
  };

  const handlePttUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    try {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    } catch {}

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    if (isToggleMode) return;

    if (!isPttPointerDown.current) return;
    isPttPointerDown.current = false;
    const duration = Date.now() - pttPressStartTime.current;

    if (duration >= 200) {
      commsManager.releasePtt();
    }
  };

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
      remoteVideoRef.current.play().catch((err) => {
        console.warn('Remote video playback note:', err);
      });
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

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const targetCandidates = members.filter(m => m.id !== currentMember.id);

  // Render Incoming Call Toast Banner
  const renderIncomingCallBanner = () => {
    if (!incomingCall) return null;

    return (
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] w-[92%] max-w-md bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-xl border border-indigo-500/50 rounded-3xl shadow-2xl p-4 text-white animate-bounce-slow">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/30 flex items-center justify-center text-2xl border border-indigo-400 shadow-xs">
              {incomingCall.callerAvatar || '👤'}
            </div>
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full animate-ping"></span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                Incoming {incomingCall.isVideo ? 'Video Call' : 'Radio Signal'}
              </span>
            </div>
            <h4 className="font-bold text-base text-slate-100 truncate mt-0.5">
              {incomingCall.callerName}
            </h4>
            <p className="text-xs text-slate-400">Connecting in {circleName}…</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => commsManager.declineIncomingCall()}
              className="p-3 rounded-2xl bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 transition-all cursor-pointer shadow-xs active:scale-95"
              title="Decline"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
            <button
              onClick={() => commsManager.acceptIncomingCall()}
              className="p-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 transition-all cursor-pointer animate-pulse active:scale-95"
              title="Accept Call"
            >
              <Video className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen && !incomingCall && !session) {
    return null;
  }

  const remoteStream = commsManager.getRemoteStream();
  const hasRemoteVideo = Boolean(remoteStream && remoteStream.getVideoTracks().some(t => t.readyState === 'live' && t.enabled));

  return (
    <>
      {/* 1. Global Incoming Call Toast */}
      {renderIncomingCallBanner()}

      {/* 2. Minimized Comms Widget Floating Pill */}
      {isMinimized && session && (
        <div 
          onClick={() => setIsMinimized(false)}
          className="fixed bottom-24 right-5 z-[9990] bg-slate-900/95 backdrop-blur-md border border-indigo-500/40 shadow-2xl rounded-full px-4 py-2 flex items-center gap-3 cursor-pointer text-white hover:scale-105 transition-all"
        >
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-xs font-bold">
            {session.mode === 'video' ? `Live Video (${formatTimer(callDuration)})` : 'Tactical Radio Active'}
          </span>
          <Maximize2 className="w-4 h-4 text-slate-400" />
        </div>
      )}

      {/* 3. Main Fullscreen Tactical Modal / HUD */}
      {!isMinimized && (isOpen || session) && (
        <div className="fixed inset-0 z-[9980] bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-fade-in">
          <div className="relative w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            
            {/* Modal Top Bar */}
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 text-white">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  {session?.mode === 'video' ? <Video className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-100 flex items-center gap-2">
                    {session?.mode === 'video' ? 'HD Live Video Comms' : 'Tactical Walkie-Talkie'}
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      SECURE P2P
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">{circleName} Emergency Grid</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {session && (
                  <button
                    onClick={() => setIsMinimized(true)}
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    title="Minimize to floating widget"
                  >
                    <Minimize2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => {
                    if (session) {
                      commsManager.endCall();
                    }
                    onClose();
                  }}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title="Close Comms"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Mode Selection Screen if no session active */}
            {!session && (
              <div className="p-6 flex-1 overflow-y-auto">
                <div className="text-center max-w-md mx-auto py-2">
                  <div className="w-16 h-16 rounded-3xl bg-indigo-600/15 text-indigo-400 flex items-center justify-center mx-auto mb-3 border border-indigo-500/30">
                    <RadioTower className="w-8 h-8" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-100">Direct Family Comms Deck</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Instant sub-second walkie-talkie audio & HD live video direct between members without external apps.
                  </p>

                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => commsManager.openRadio()}
                      className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 hover:border-indigo-500 text-left flex flex-col gap-2 transition-all cursor-pointer group shadow-xs"
                    >
                      <div className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 w-fit group-hover:scale-110 transition-transform">
                        <Radio className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-200 text-sm">Circle Walkie-Talkie</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">Broadcast push-to-talk audio to everyone</div>
                      </div>
                    </button>

                    <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 text-left flex flex-col gap-2">
                      <div className="p-2.5 rounded-xl bg-emerald-600/20 text-emerald-400 w-fit">
                        <Video className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-200 text-sm">Direct HD Video</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">Select any online member below to call</div>
                      </div>
                    </div>
                  </div>

                  {/* Members Selection List */}
                  <div className="mt-5 text-left">
                    <label className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                      Circle Members ({targetCandidates.length})
                    </label>
                    <div className="mt-2 space-y-2">
                      {targetCandidates.length === 0 ? (
                        <div className="text-center py-6 text-xs text-slate-500">
                          Waiting for family members to join circle…
                        </div>
                      ) : (
                        targetCandidates.map(m => (
                          <div
                            key={m.id}
                            className="p-3 rounded-2xl bg-slate-900 border border-slate-800/80 flex items-center justify-between hover:border-slate-700 transition-all"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-2xl bg-slate-800 flex items-center justify-center text-xl shrink-0">
                                {m.avatar || '👤'}
                              </div>
                              <div className="truncate">
                                <h5 className="font-bold text-sm text-slate-200 truncate">{m.name}</h5>
                                <span className="text-[11px] text-slate-400 block truncate">
                                  {m.role || 'Member'} {m.currentPlace ? `• At ${m.currentPlace}` : ''}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => commsManager.openRadio(m)}
                                className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 text-indigo-400 hover:text-white text-xs font-semibold border border-indigo-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
                                title="Open Radio"
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
              <div className="relative flex-1 bg-black min-h-[400px] sm:min-h-[480px] flex items-center justify-center overflow-hidden">
                {/* Main Remote Video Element */}
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />

                {/* Connecting Screen */}
                {session.status === 'connecting' && (
                  <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center z-10">
                    <div className="w-20 h-20 rounded-3xl bg-indigo-600/20 border-2 border-indigo-500/50 flex items-center justify-center text-4xl mb-4 animate-pulse">
                      {session.targetMember?.avatar || '👤'}
                    </div>
                    <h4 className="text-xl font-bold text-white">Calling {session.targetMember?.name || 'Member'}…</h4>
                    <p className="text-xs text-indigo-400 mt-1 font-mono">ESTABLISHING ENCRYPTED WEBRTC P2P</p>
                    <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                      <Activity className="w-4 h-4 text-emerald-400 animate-spin" />
                      <span>Negotiating STUN/TURN connection…</span>
                    </div>
                  </div>
                )}

                {/* Connected with no camera feed */}
                {session.status === 'connected' && !hasRemoteVideo && (
                  <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center p-6 text-center z-10 pointer-events-none">
                    <div className="w-20 h-20 rounded-3xl bg-indigo-600/20 border-2 border-indigo-500/50 flex items-center justify-center text-4xl mb-4 animate-pulse">
                      {session.targetMember?.avatar || '👤'}
                    </div>
                    <h4 className="text-xl font-bold text-white">{session.targetMember?.name || 'Member'}</h4>
                    <p className="text-xs text-emerald-400 mt-1 font-mono">LIVE CALL CONNECTED</p>
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
                      <Activity className="w-4 h-4 text-emerald-400 animate-spin" />
                      <span>Streaming live audio • Video activating…</span>
                    </div>
                  </div>
                )}

                {/* Local Video Stream (PIP in bottom right) */}
                <div className="absolute bottom-20 right-4 w-28 h-38 sm:w-36 sm:h-48 rounded-2xl overflow-hidden border-2 border-slate-700 bg-slate-900 shadow-2xl z-20">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover -scale-x-100"
                  />
                  <div className="absolute top-1.5 left-2 px-1.5 py-0.5 rounded-md bg-black/60 text-[9px] text-white font-mono font-bold">
                    YOU
                  </div>
                </div>

                {/* Telemetry Bar (Top Left) */}
                <div className="absolute top-4 left-4 z-20 bg-slate-950/80 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-800 flex items-center gap-3 text-white text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                    <span className="font-mono font-bold text-emerald-400">{formatTimer(callDuration)}</span>
                  </div>
                  <span className="text-slate-600">|</span>
                  <span className="font-bold">{session.targetMember?.name || 'Peer'}</span>
                </div>

                {/* Permission Warning */}
                {permissionWarning && (
                  <div className="absolute top-16 left-4 right-4 z-30 p-2.5 rounded-2xl bg-amber-950/90 border border-amber-500/50 text-amber-200 text-xs backdrop-blur-md flex items-center justify-between gap-2 shadow-2xl">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                      <span className="truncate">{permissionWarning}</span>
                    </div>
                    <button
                      onClick={() => commsManager.retryMediaPermissions()}
                      className="px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] shrink-0"
                    >
                      Allow
                    </button>
                  </div>
                )}

                {/* Bottom Call Action HUD */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-slate-950/85 backdrop-blur-md px-4 py-2.5 rounded-3xl border border-slate-800 flex items-center gap-3 shadow-2xl">
                  {/* Mute Mic */}
                  <button
                    onClick={() => commsManager.toggleMute()}
                    className={`p-3 rounded-2xl transition-all cursor-pointer ${
                      session.isMuted
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        : 'bg-slate-800 hover:bg-slate-700 text-white'
                    }`}
                    title={session.isMuted ? 'Unmute Mic' : 'Mute Mic'}
                  >
                    {session.isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>

                  {/* Toggle Camera */}
                  <button
                    onClick={() => commsManager.toggleVideo()}
                    className={`p-3 rounded-2xl transition-all cursor-pointer ${
                      !session.isVideoEnabled
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        : 'bg-slate-800 hover:bg-slate-700 text-white'
                    }`}
                    title={session.isVideoEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
                  >
                    {!session.isVideoEnabled ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                  </button>

                  {/* Flip Camera */}
                  <button
                    onClick={() => commsManager.flipCamera()}
                    className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white transition-all cursor-pointer"
                    title="Flip Camera (Front/Back)"
                  >
                    <SwitchCamera className="w-5 h-5" />
                  </button>

                  {/* End Call */}
                  <button
                    onClick={() => commsManager.endCall()}
                    className="p-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-all cursor-pointer active:scale-95"
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
                    <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-xl border border-indigo-500/30">
                      {session.targetMember?.avatar || '📡'}
                    </div>
                    <div className="text-left">
                      <div className="text-[10px] font-mono text-indigo-400 uppercase tracking-wider font-bold">
                        {session.isBroadcasting ? 'ALL-CALL BROADCAST' : 'DIRECT UNIT CHANNEL'}
                      </div>
                      <div className="font-bold text-slate-100 text-sm">
                        {session.targetMember ? session.targetMember.name : `${circleName} Grid`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsToggleMode(prev => !prev)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
                        isToggleMode
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {isToggleMode ? 'Click Mode' : 'Hold Mode'}
                    </button>
                  </div>
                </div>

                {/* Channel Selector Chips */}
                <div className="w-full mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
                  <button
                    type="button"
                    onClick={() => commsManager.openRadio(undefined)}
                    className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 font-bold transition-all cursor-pointer whitespace-nowrap text-xs ${
                      session.isBroadcasting || !session.targetMember
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>All Members ({members.length})</span>
                  </button>
                  {targetCandidates.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => commsManager.openRadio(m)}
                      className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 font-bold transition-all cursor-pointer whitespace-nowrap text-xs ${
                        !session.isBroadcasting && session.targetMember?.id === m.id
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span>{m.avatar || '👤'}</span>
                      <span>{m.name}</span>
                    </button>
                  ))}
                </div>

                {/* Tactical Status & Wave Visualizer */}
                <div className="my-6 flex flex-col items-center">
                  {remoteSpeaker?.isSpeaking ? (
                    <div className="flex flex-col items-center animate-pulse">
                      <div className="px-4 py-1.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs font-bold font-mono tracking-wider mb-3">
                        RADIO INCOMING // {remoteSpeaker.name.toUpperCase()} SPEAKING
                      </div>
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
                      <div className="px-4 py-1.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 text-xs font-bold font-mono tracking-wider mb-3 animate-pulse">
                        TRANSMITTING LIVE // MIC OPEN
                      </div>
                      <div className="flex items-center gap-1.5 h-12">
                        {[60, 90, 100, 75, 95, 85, 100, 70, 90, 65].map((h, i) => (
                          <span
                            key={i}
                            className="w-1.5 bg-rose-500 rounded-full transition-all duration-75 animate-pulse"
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

                {/* THE BIG PUSH-TO-TALK BUTTON */}
                <div className="flex flex-col items-center">
                  <button
                    type="button"
                    onPointerDown={handlePttDown}
                    onPointerUp={handlePttUp}
                    onPointerCancel={handlePttUp}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`relative w-40 h-40 sm:w-48 sm:h-48 rounded-full flex flex-col items-center justify-center transition-all cursor-pointer select-none active:scale-95 shadow-2xl touch-none ${
                      isPttPressed
                        ? 'bg-gradient-to-b from-rose-600 to-rose-700 text-white ring-8 ring-rose-500/30 shadow-rose-600/50 scale-102'
                        : 'bg-gradient-to-b from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white ring-8 ring-indigo-500/20 shadow-indigo-600/30'
                    }`}
                    style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
                  >
                    <Radio className={`w-12 h-12 mb-2 pointer-events-none ${isPttPressed ? 'animate-bounce' : ''}`} />
                    <span className="font-extrabold text-sm sm:text-base tracking-wider uppercase pointer-events-none">
                      {isPttPressed ? 'TRANSMITTING' : 'PUSH TO TALK'}
                    </span>
                    <span className="text-[10px] text-indigo-200 mt-0.5 pointer-events-none font-medium">
                      {isPttPressed 
                        ? (isToggleMode ? 'Click to Finish' : 'Release to Send')
                        : (isToggleMode ? 'Click to Talk' : 'Hold to Speak')}
                    </span>
                  </button>

                  <p className="text-[11px] text-slate-500 mt-4 font-medium">
                    Sub-second OPUS audio • Hardware echo cancellation • Automatic roger beeps
                  </p>
                </div>

                {/* Bottom Disconnect Button */}
                <div className="w-full mt-6 pt-4 border-t border-slate-900 flex justify-between items-center">
                  <div className="text-xs text-slate-400">
                    Unit: <span className="text-slate-200 font-semibold">{currentMember.name}</span>
                  </div>
                  <button
                    onClick={() => commsManager.endCall()}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-rose-600/20 hover:text-rose-400 text-slate-300 text-xs font-semibold transition-colors cursor-pointer border border-slate-800"
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
