/**
 * Nexus Tactical Comms Engine (Walkie-Talkie & Live Video Calling)
 * 
 * Powered by WebRTC, PeerJS & Firestore Hybrid Signaling.
 * Features:
 * - Dual-Engine Walkie-Talkie: Real-time Opus WebRTC streaming + instant voice burst packets.
 * - Hardware Echo Cancellation, Noise Suppression & Auto Gain Control.
 * - Walkie-Talkie Push-to-Talk (PTT) with instant audio streaming, squelch chirps & roger beeps.
 * - HD Live Video Calling with front/back camera toggling and Picture-in-Picture (PIP).
 * - 5-Stage Progressive Media Fallback: Guarantees calls & radio NEVER cut.
 * - Firestore Signaling Bridge: Instant audio delivery across cities and carrier networks.
 * - Automatic Peer ID Collision recovery and multiple redundant STUN servers.
 */

import { Peer, MediaConnection, DataConnection } from 'peerjs';
import { radioAudio } from './radioAudio';
import { DeviceMember } from '../types';

export type CommsMode = 'idle' | 'radio' | 'video';

export interface ActiveCommsSession {
  mode: 'radio' | 'video';
  targetMember?: DeviceMember;
  isBroadcasting?: boolean;
  status: 'connecting' | 'connected' | 'ended';
  isMuted: boolean;
  isVideoEnabled: boolean;
  facingMode: 'user' | 'environment';
  startedAt: number;
}

export interface IncomingCallInfo {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar: string;
  callerRole?: string;
  callerPeerId?: string;
  isVideo: boolean;
  mediaConnection?: MediaConnection;
}

export type CommsEventCallback = () => void;

export type SignalBridgeHandler = (data: {
  peerId?: string;
  activeCall?: {
    callerId: string;
    callerName: string;
    callerAvatar?: string;
    callerRole?: string;
    targetMemberId: string;
    type: 'video' | 'radio';
    status: 'ringing' | 'connected' | 'ended';
    callerPeerId: string;
    timestamp: number;
  } | null;
  radioBurst?: {
    senderId: string;
    senderName: string;
    audioData: string;
    timestamp: number;
    targetMemberId?: string;
  } | null;
}) => void;

export class CommsManager {
  private peer: Peer | null = null;
  private myPeerId: string | null = null;
  private circleId: string | null = null;
  private currentMember: DeviceMember | null = null;
  private membersList: DeviceMember[] = [];

  // Active Media Streams & Recorders
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private activeMediaConnection: MediaConnection | null = null;
  private broadcastMediaConnections: Map<string, MediaConnection> = new Map();
  private dataConnections: Map<string, DataConnection> = new Map();
  private mediaRecorder: MediaRecorder | null = null;
  private pttRecordedChunks: Blob[] = [];

  // Comms State
  private session: ActiveCommsSession | null = null;
  private incomingCall: IncomingCallInfo | null = null;
  private isPttPressed: boolean = false;
  private remoteSpeakerName: string | null = null;
  private isRemoteSpeaking: boolean = false;
  private permissionWarning: string | null = null;
  private handledCallTimestamps: Set<number> = new Set();
  private pttAutoTimeout: any = null;

  // Audio elements for playback
  private liveAudioElement: HTMLAudioElement | null = null;
  private voiceBurstAudioElement: HTMLAudioElement | null = null;

  // Signal Bridge to Firestore
  private signalBridge: SignalBridgeHandler | null = null;

  // Listeners for React components
  private listeners: Set<CommsEventCallback> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      this.getOrCreateLiveAudioElement();
      this.getOrCreateVoiceBurstAudioElement();
    }
  }

  private createAudioElement(): HTMLAudioElement {
    if (typeof document !== 'undefined') {
      try {
        const el = document.createElement('audio');
        el.autoplay = true;
        el.setAttribute('playsinline', 'true');
        el.style.display = 'none';
        if (document.body) {
          document.body.appendChild(el);
        } else {
          document.addEventListener('DOMContentLoaded', () => {
            if (document.body && !document.body.contains(el)) {
              document.body.appendChild(el);
            }
          });
        }
        return el;
      } catch {
        const el = new Audio();
        el.autoplay = true;
        return el;
      }
    }
    return new Audio();
  }

  public getOrCreateLiveAudioElement(): HTMLAudioElement {
    if (!this.liveAudioElement) {
      this.liveAudioElement = this.createAudioElement();
    }
    if (typeof document !== 'undefined' && document.body && !document.body.contains(this.liveAudioElement)) {
      try { document.body.appendChild(this.liveAudioElement); } catch {}
    }
    return this.liveAudioElement;
  }

  public getOrCreateVoiceBurstAudioElement(): HTMLAudioElement {
    if (!this.voiceBurstAudioElement) {
      this.voiceBurstAudioElement = this.createAudioElement();
    }
    if (typeof document !== 'undefined' && document.body && !document.body.contains(this.voiceBurstAudioElement)) {
      try { document.body.appendChild(this.voiceBurstAudioElement); } catch {}
    }
    return this.voiceBurstAudioElement;
  }

  public getOrCreateAudioElement(): HTMLAudioElement {
    return this.getOrCreateLiveAudioElement();
  }

  public setSignalBridge(bridge: SignalBridgeHandler | null) {
    this.signalBridge = bridge;
    if (bridge && this.myPeerId) {
      bridge({ peerId: this.myPeerId });
    }
  }

  public subscribe(cb: CommsEventCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    this.listeners.forEach(cb => {
      try { cb(); } catch (err) { console.warn('Comms listener err:', err); }
    });
  }

  public getSession(): ActiveCommsSession | null {
    return this.session;
  }

  public getIncomingCall(): IncomingCallInfo | null {
    return this.incomingCall;
  }

  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  public getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  public isPttActive(): boolean {
    return this.isPttPressed;
  }

  public getMyPeerId(): string | null {
    return this.myPeerId;
  }

  public getPermissionWarning(): string | null {
    return this.permissionWarning;
  }

  public getRemoteSpeaker(): { name: string; isSpeaking: boolean } | null {
    if (!this.remoteSpeakerName) return null;
    return { name: this.remoteSpeakerName, isSpeaking: this.isRemoteSpeaking };
  }

  public getPeerIdForMember(memberId: string): string {
    if (!this.circleId) return '';
    const cleanCircle = this.circleId.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const cleanMember = memberId.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    return `nxt_${cleanCircle}_${cleanMember}`;
  }

  /**
   * Initialize PeerJS with the user's circle and device credentials.
   */
  public initialize(circleId: string, member: DeviceMember, members: DeviceMember[]) {
    this.circleId = circleId;
    this.currentMember = member;
    this.membersList = members;

    const basePeerId = this.getPeerIdForMember(member.id);
    if (this.peer && this.myPeerId && !this.peer.destroyed) {
      return; // Already active
    }

    if (this.peer) {
      this.cleanup();
    }

    this.createPeer(basePeerId);
  }

  private createPeer(peerId: string) {
    this.myPeerId = peerId;

    try {
      this.peer = new Peer(peerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            { urls: 'stun:stun.services.mozilla.com' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      this.peer.on('open', (id) => {
        console.log('Nexus Tactical Comms online. Assigned peer ID:', id);
        this.myPeerId = id;
        if (this.signalBridge) {
          this.signalBridge({ peerId: id });
        }
        this.notify();
      });

      this.peer.on('call', (call) => {
        this.handleIncomingCall(call);
      });

      this.peer.on('connection', (conn) => {
        this.handleDataConnection(conn);
      });

      this.peer.on('error', (err: any) => {
        if (err.type === 'unavailable-id') {
          console.warn('Peer ID collision or open in another tab. Generating unique sub-peer ID...');
          const fallbackId = `${peerId}_${Math.random().toString(36).substring(2, 7)}`;
          if (this.peer) {
            try { this.peer.destroy(); } catch {}
          }
          this.createPeer(fallbackId);
        } else {
          console.warn('PeerJS tactical comms note:', err);
        }
        this.notify();
      });
    } catch (e) {
      console.warn('Failed to initialize PeerJS:', e);
    }
  }

  public async ensurePeerOpen(): Promise<boolean> {
    if (this.peer && this.peer.open) return true;
    if (!this.peer && this.currentMember && this.circleId) {
      this.createPeer(this.getPeerIdForMember(this.currentMember.id));
    }
    if (!this.peer) return false;

    return new Promise<boolean>((resolve) => {
      if (this.peer?.open) return resolve(true);
      const timer = setTimeout(() => resolve(false), 4000);
      this.peer?.once('open', () => {
        clearTimeout(timer);
        resolve(true);
      });
      this.peer?.once('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }

  public updateMembersList(members: DeviceMember[]) {
    this.membersList = members;
  }

  /**
   * Handle incoming call triggered via Firestore real-time signaling.
   */
  public handleRemoteIncomingCallSignal(callData: {
    callerId: string;
    callerName: string;
    callerAvatar?: string;
    callerRole?: string;
    targetMemberId: string;
    type: 'video' | 'radio';
    status: 'ringing' | 'connected' | 'ended';
    callerPeerId: string;
    timestamp: number;
  }) {
    if (this.session && (this.session.status === 'connected' || this.session.status === 'connecting')) {
      return; // Already in a call
    }

    if (this.handledCallTimestamps.has(callData.timestamp)) {
      return; // Already handled or alerted for this call
    }

    if (this.incomingCall && this.incomingCall.callerId === callData.callerId) {
      return; // Already alerting for this incoming call
    }

    this.handledCallTimestamps.add(callData.timestamp);
    radioAudio.startIncomingCallRingtone();
    this.incomingCall = {
      callId: String(callData.timestamp || callData.callerPeerId || callData.callerId),
      callerId: callData.callerId,
      callerName: callData.callerName || 'Circle Member',
      callerAvatar: callData.callerAvatar || '👤',
      callerRole: callData.callerRole,
      callerPeerId: callData.callerPeerId,
      isVideo: callData.type === 'video',
      mediaConnection: undefined
    };
    this.notify();
  }

  /**
   * When caller cancels or call terminates remotely.
   */
  public handleRemoteCallEnded() {
    radioAudio.stopIncomingCallRingtone();
    if (this.incomingCall) {
      this.incomingCall = null;
      this.notify();
    }
  }

  /**
   * Handle incoming WebRTC audio / video call directly from PeerJS.
   */
  private handleIncomingCall(call: MediaConnection) {
    const meta = call.metadata || {};
    const isVideo = meta.type === 'video';

    if (isVideo) {
      // 1. If WE are already calling this person (outgoing call in progress), auto-answer:
      if (
        this.session &&
        (this.session.status === 'connecting' || this.session.status === 'connected') &&
        this.session.targetMember &&
        (this.session.targetMember.id === meta.callerId ||
         this.session.targetMember.id.endsWith(meta.callerId || '') ||
         meta.callerId?.endsWith(this.session.targetMember.id))
      ) {
        call.answer(this.localStream || undefined);
        this.activeMediaConnection = call;
        call.on('stream', (remoteMediaStream) => {
          radioAudio.playCallConnected();
          this.remoteStream = remoteMediaStream;
          if (this.session) {
            this.session.status = 'connected';
          }
          this.notify();
        });
        call.on('close', () => {
          this.endCall();
        });
        return;
      }

      // 2. Normal incoming video call -> Trigger ringing banner
      radioAudio.startIncomingCallRingtone();
      this.incomingCall = {
        callId: call.peer,
        callerId: meta.callerId || call.peer,
        callerName: meta.callerName || 'Circle Member',
        callerAvatar: meta.callerAvatar || '👤',
        callerRole: meta.callerRole,
        callerPeerId: call.peer,
        isVideo: true,
        mediaConnection: call
      };
      this.notify();
    } else {
      // Tactical Walkie-Talkie Radio -> Auto-receive and patch audio through immediately!
      radioAudio.playPttStartChirp();
      this.remoteSpeakerName = meta.callerName || 'Tactical Radio';
      this.isRemoteSpeaking = true;

      // Answer immediately in receive-only mode (NEVER wait for mic getUserMedia!)
      try {
        call.answer();
      } catch {}

      call.on('stream', (remoteMediaStream) => {
        this.remoteStream = remoteMediaStream;
        const audio = this.getOrCreateLiveAudioElement();
        audio.srcObject = remoteMediaStream;
        audio.play().catch(() => {});
        this.notify();
      });

      call.on('close', () => {
        radioAudio.playRogerBeep();
        this.isRemoteSpeaking = false;
        this.remoteSpeakerName = null;
        this.notify();
      });

      this.notify();
    }
  }

  /**
   * Handle incoming DataConnection for Walkie-Talkie PTT signaling & voice bursts.
   */
  private handleDataConnection(conn: DataConnection) {
    conn.on('data', (data: any) => {
      if (typeof data !== 'object' || !data) return;

      if (data.type === 'PTT_START') {
        this.remoteSpeakerName = data.callerName || 'Member';
        this.isRemoteSpeaking = true;
        radioAudio.playPttStartChirp();
        this.notify();
      } else if (data.type === 'PTT_STOP') {
        radioAudio.playRogerBeep();
        this.isRemoteSpeaking = false;
        this.notify();
      } else if (data.type === 'RADIO_VOICE_BURST' && data.audioData) {
        this.playRadioAudioBurst(data.audioData, data.senderName || 'Radio Unit');
      }
    });
  }

  /**
   * Play an incoming high-fidelity radio voice transmission packet.
   */
  public playRadioAudioBurst(audioData: string, senderName: string) {
    if (!audioData) return;
    this.remoteSpeakerName = senderName;
    this.isRemoteSpeaking = true;
    radioAudio.playPttStartChirp();
    this.notify();

    const audio = this.getOrCreateVoiceBurstAudioElement();
    audio.srcObject = null;
    audio.src = audioData;
    audio.play()
      .then(() => {
        audio.onended = () => {
          radioAudio.playRogerBeep();
          this.isRemoteSpeaking = false;
          this.remoteSpeakerName = null;
          this.notify();
        };
      })
      .catch(async (err) => {
        console.warn('Audio element play note (trying AudioContext decode):', err);
        try {
          const res = await fetch(audioData);
          const buf = await res.arrayBuffer();
          const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtxClass) {
            const ctx = new AudioCtxClass();
            if (ctx.state === 'suspended') await ctx.resume();
            const decoded = await ctx.decodeAudioData(buf);
            const source = ctx.createBufferSource();
            source.buffer = decoded;
            source.connect(ctx.destination);
            source.onended = () => {
              radioAudio.playRogerBeep();
              this.isRemoteSpeaking = false;
              this.remoteSpeakerName = null;
              this.notify();
            };
            source.start(0);
            return;
          }
        } catch (ctxErr) {
          console.warn('AudioContext playback fallback note:', ctxErr);
        }

        setTimeout(() => {
          radioAudio.playRogerBeep();
          this.isRemoteSpeaking = false;
          this.remoteSpeakerName = null;
          this.notify();
        }, 1200);
      });
  }

  private sendDataToMember(member: DeviceMember, data: any) {
    const remotePeerId = member.peerId || this.getPeerIdForMember(member.id);
    if (!this.peer || this.peer.destroyed) return;

    let conn = this.dataConnections.get(remotePeerId);
    if (!conn || !conn.open) {
      try {
        conn = this.peer.connect(remotePeerId, { reliable: true });
        this.dataConnections.set(remotePeerId, conn);
        conn.on('open', () => {
          conn?.send(data);
        });
        conn.on('error', () => {});
      } catch {}
    } else {
      try {
        conn.send(data);
      } catch {}
    }
  }

  /**
   * Acquire local camera & microphone streams with progressive multi-stage fallback.
   */
  private async getLocalMedia(isVideo: boolean, facingMode: 'user' | 'environment' = 'user'): Promise<MediaStream> {
    this.permissionWarning = null;

    // 0. Proactively trigger native Android permission prompt if inside Android APK shell
    if (typeof window !== 'undefined' && (window as any).NexusNative?.ensureMediaPermissions) {
      try {
        (window as any).NexusNative.ensureMediaPermissions();
      } catch {}
    }

    // Check if existing localStream is still valid and has live tracks
    if (this.localStream) {
      const hasLiveVideo = this.localStream.getVideoTracks().some(t => t.readyState === 'live');
      const hasLiveAudio = this.localStream.getAudioTracks().some(t => t.readyState === 'live');
      if ((isVideo ? hasLiveVideo : true) && hasLiveAudio) {
        return this.localStream;
      }
      this.localStream.getTracks().forEach(t => { try { t.stop(); } catch {} });
      this.localStream = null;
    }

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      // Attempt 1: Full requested video + audio with flexible ideal constraints (safe on Android)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: isVideo ? {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          } : false
        });
        this.localStream = stream;
        return stream;
      } catch (err1) {
        console.warn('Comms: Attempt 1 getUserMedia flexible constraints note:', err1);
      }

      // Attempt 2: Simple boolean audio + video
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: isVideo
        });
        this.localStream = stream;
        return stream;
      } catch (err2) {
        console.warn('Comms: Attempt 2 simple boolean constraints note:', err2);
      }

      // Attempt 3: Separate Video & Audio track acquisition (fixes Android WebView driver contention)
      if (isVideo) {
        try {
          let videoTrack: MediaStreamTrack | null = null;
          let audioTrack: MediaStreamTrack | null = null;

          try {
            const vStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: facingMode } }
            });
            videoTrack = vStream.getVideoTracks()[0] || null;
          } catch {
            try {
              const vStreamFallback = await navigator.mediaDevices.getUserMedia({ video: true });
              videoTrack = vStreamFallback.getVideoTracks()[0] || null;
            } catch {}
          }

          try {
            const aStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioTrack = aStream.getAudioTracks()[0] || null;
          } catch {}

          if (videoTrack || audioTrack) {
            const combined = new MediaStream();
            if (videoTrack) combined.addTrack(videoTrack);
            if (audioTrack) combined.addTrack(audioTrack);
            this.localStream = combined;
            return combined;
          }
        } catch (err3) {
          console.warn('Comms: Attempt 3 separate track acquisition note:', err3);
        }
      }

      // Attempt 4: Audio-Only fallback with canvas track if camera hardware failed
      if (isVideo) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
          });

          // Create a synthetic canvas video track so WebRTC video sender doesn't fail
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 480;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, 640, 480);
            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('🎙️ Voice Relay Active', 320, 220);
            ctx.fillStyle = '#94a3b8';
            ctx.font = '16px sans-serif';
            ctx.fillText('(Camera not available on this device)', 320, 260);
          }
          const canvasStream = (canvas as any).captureStream ? (canvas as any).captureStream(5) : null;
          if (canvasStream && canvasStream.getVideoTracks().length > 0) {
            audioStream.addTrack(canvasStream.getVideoTracks()[0]);
          }

          this.localStream = audioStream;
          this.permissionWarning = 'Camera unavailable or blocked. Running in voice-call mode.';
          if (this.session) {
            this.session.isVideoEnabled = false;
          }
          this.notify();
          return audioStream;
        } catch (err4) {
          console.warn('Comms: Attempt 4 audio-only fallback failed:', err4);
        }
      }
    }

    // Attempt 5: Synthetic silent stream so call NEVER cuts even if mic is blocked
    this.permissionWarning = 'Microphone/Camera blocked in browser address bar. Operating in receive-only mode.';
    this.notify();

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        const osc = audioCtx.createOscillator();
        const dst = audioCtx.createMediaStreamDestination();
        osc.connect(dst);
        osc.start();
        const dummyStream = dst.stream;
        dummyStream.getAudioTracks().forEach(t => { t.enabled = false; });
        this.localStream = dummyStream;
        if (this.session) {
          this.session.isMuted = true;
          this.session.isVideoEnabled = false;
        }
        return dummyStream;
      }
    } catch (err5) {
      console.warn('Comms: Attempt 5 synthetic stream failed:', err5);
    }

    // Attempt 6: Blank MediaStream
    const empty = new MediaStream();
    this.localStream = empty;
    return empty;
  }

  public async retryMediaPermissions() {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        this.localStream = stream;
        this.permissionWarning = null;
        if (this.session) {
          this.session.isVideoEnabled = true;
          this.session.isMuted = false;
        }
        this.notify();
      } catch (err) {
        console.warn('Retry media permission error:', err);
      }
    }
  }

  // ==========================================
  // WALKIE-TALKIE (PUSH-TO-TALK) METHODS
  // ==========================================

  /**
   * Start Walkie-Talkie Radio Mode (Opens radio HUD / Ready state)
   */
  public async openRadio(targetMember?: DeviceMember) {
    this.session = {
      mode: 'radio',
      targetMember,
      isBroadcasting: !targetMember,
      status: 'connected',
      isMuted: true,
      isVideoEnabled: false,
      facingMode: 'user',
      startedAt: Date.now()
    };
    this.notify();
  }

  /**
   * Push-to-Talk (PTT) Key Down: Begin transmitting voice.
   */
  public async pressPtt() {
    if (this.isPttPressed) return;
    this.isPttPressed = true;
    this.notify();
    radioAudio.playPttStartChirp();
    this.pttRecordedChunks = [];

    // Auto-timeout after 20s if user forgot to click/release
    if (this.pttAutoTimeout) clearTimeout(this.pttAutoTimeout);
    this.pttAutoTimeout = setTimeout(() => {
      if (this.isPttPressed) {
        this.releasePtt();
      }
    }, 20000);

    try {
      const stream = await this.getLocalMedia(false);
      stream.getAudioTracks().forEach(t => { t.enabled = true; });

      // Start MediaRecorder for voice burst delivery
      if (typeof MediaRecorder !== 'undefined') {
        let options: any = {};
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          options = { mimeType: 'audio/webm;codecs=opus' };
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          options = { mimeType: 'audio/webm' };
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          options = { mimeType: 'audio/mp4' };
        }

        try {
          this.mediaRecorder = new MediaRecorder(stream, options);
          this.mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              this.pttRecordedChunks.push(e.data);
            }
          };
          this.mediaRecorder.start(100);
        } catch (recErr) {
          console.warn('MediaRecorder start note:', recErr);
        }
      }

      // Check if user already released while media was being acquired
      if (!this.isPttPressed) {
        setTimeout(() => {
          this.finishAndSendRecording();
        }, 350);
        return;
      }

      // Signal target peers about PTT transmission starting
      const isDirect = Boolean(this.session?.targetMember && !this.session.isBroadcasting);
      const targets = isDirect && this.session?.targetMember
        ? [this.session.targetMember]
        : this.membersList.filter(m => m.id !== this.currentMember?.id);

      targets.forEach(member => {
        this.sendDataToMember(member, {
          type: 'PTT_START',
          callerName: this.currentMember?.name || 'Radio Unit'
        });

        const remotePeerId = member.peerId || this.getPeerIdForMember(member.id);
        if (this.peer && !this.peer.destroyed) {
          try {
            const call = this.peer.call(remotePeerId, stream, {
              metadata: {
                type: 'radio',
                callerId: this.currentMember?.id,
                callerName: this.currentMember?.name || 'Radio Unit',
                callerAvatar: this.currentMember?.avatar
              }
            });
            this.broadcastMediaConnections.set(member.id, call);
          } catch {}
        }
      });

      this.notify();
    } catch (e) {
      console.warn('Microphone access failed for PTT:', e);
      this.isPttPressed = false;
      this.notify();
    }
  }

  /**
   * Push-to-Talk (PTT) Key Up: Release microphone, transmit roger beep & voice burst.
   */
  public releasePtt() {
    if (!this.isPttPressed) return;
    this.isPttPressed = false;
    this.notify();
    radioAudio.playRogerBeep();

    if (this.pttAutoTimeout) {
      clearTimeout(this.pttAutoTimeout);
      this.pttAutoTimeout = null;
    }

    this.finishAndSendRecording();
  }

  private finishAndSendRecording() {
    // Default to ALL circle members unless explicit 1-on-1 private whisper is active
    const isDirect = Boolean(this.session?.targetMember && !this.session.isBroadcasting);
    const targetMemberId = isDirect && this.session?.targetMember?.id ? this.session.targetMember.id : 'all';

    const targets = isDirect && this.session?.targetMember
      ? [this.session.targetMember]
      : this.membersList.filter(m => m.id !== this.currentMember?.id);

    // Stop recording and package the voice burst
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        const mime = this.mediaRecorder.mimeType || 'audio/webm';

        try {
          if (this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.requestData();
          }
        } catch {}

        this.mediaRecorder.onstop = () => {
          if (this.localStream) {
            this.localStream.getTracks().forEach(t => { try { t.stop(); } catch {} });
            this.localStream = null;
          }

          if (this.pttRecordedChunks.length > 0) {
            const audioBlob = new Blob(this.pttRecordedChunks, { type: mime });
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64Audio = reader.result as string;
              if (base64Audio) {
                // 1. Direct transmit over DataChannel
                targets.forEach(member => {
                  this.sendDataToMember(member, {
                    type: 'RADIO_VOICE_BURST',
                    audioData: base64Audio,
                    senderName: this.currentMember?.name || 'Radio Unit'
                  });
                });

                // 2. Transmit over Firestore signal bridge as guaranteed broadcast to ALL members!
                if (this.signalBridge && this.currentMember) {
                  this.signalBridge({
                    radioBurst: {
                      senderId: this.currentMember.id,
                      senderName: this.currentMember.name || 'Radio Unit',
                      audioData: base64Audio,
                      timestamp: Date.now(),
                      targetMemberId
                    }
                  });
                }
              }
            };
            reader.readAsDataURL(audioBlob);
          }
        };

        this.mediaRecorder.stop();
      } catch (e) {
        console.warn('MediaRecorder stop note:', e);
        if (this.localStream) {
          this.localStream.getTracks().forEach(t => { try { t.stop(); } catch {} });
          this.localStream = null;
        }
      }
    } else {
      if (this.localStream) {
        this.localStream.getTracks().forEach(t => { try { t.stop(); } catch {} });
        this.localStream = null;
      }
    }

    targets.forEach(member => {
      this.sendDataToMember(member, { type: 'PTT_STOP' });

      const activeCall = this.broadcastMediaConnections.get(member.id);
      if (activeCall) {
        try { activeCall.close(); } catch {}
        this.broadcastMediaConnections.delete(member.id);
      }
    });

    this.notify();
  }

  // ==========================================
  // LIVE VIDEO CALL METHODS
  // ==========================================

  /**
   * Initiate an HD video call to a member (e.g. Surat ⇄ Nadiad).
   */
  public async startVideoCall(targetMember: DeviceMember) {
    this.session = {
      mode: 'video',
      targetMember,
      status: 'connecting',
      isMuted: false,
      isVideoEnabled: true,
      facingMode: 'user',
      startedAt: Date.now()
    };
    this.notify();

    // 1. Publish call signal to Firestore so target phone rings instantly!
    if (this.signalBridge && this.currentMember) {
      this.signalBridge({
        activeCall: {
          callerId: this.currentMember.id,
          callerName: this.currentMember.name || 'Member',
          callerAvatar: this.currentMember.avatar || '👤',
          callerRole: this.currentMember.role,
          targetMemberId: targetMember.id,
          type: 'video',
          status: 'ringing',
          callerPeerId: this.myPeerId || this.getPeerIdForMember(this.currentMember.id),
          timestamp: Date.now()
        }
      });
    }

    // 2. Acquire local media with progressive fallback - NEVER throws or terminates call!
    const stream = await this.getLocalMedia(true, 'user');
    await this.ensurePeerOpen();

    const remotePeerId = targetMember.peerId || this.getPeerIdForMember(targetMember.id);

    if (this.peer && !this.peer.destroyed) {
      try {
        const call = this.peer.call(remotePeerId, stream, {
          metadata: {
            type: 'video',
            callerId: this.currentMember?.id,
            callerName: this.currentMember?.name || 'Member',
            callerAvatar: this.currentMember?.avatar || '👤',
            callerRole: this.currentMember?.role
          }
        });

        this.activeMediaConnection = call;

        call.on('stream', (remoteMediaStream) => {
          radioAudio.playCallConnected();
          this.remoteStream = remoteMediaStream;
          if (this.session) {
            this.session.status = 'connected';
          }
          this.notify();
        });

        call.on('close', () => {
          this.endCall();
        });

        call.on('error', (err) => {
          console.warn('Video call connect error:', err);
        });
      } catch (e) {
        console.warn('Peer call transmit error:', e);
      }
    }
  }

  /**
   * Accept an incoming video call.
   */
  public async acceptIncomingCall() {
    if (!this.incomingCall) return;
    radioAudio.stopIncomingCallRingtone();

    const incoming = this.incomingCall;
    this.incomingCall = null;

    if (incoming.callId) {
      const ts = Number(incoming.callId);
      if (!isNaN(ts)) {
        this.handledCallTimestamps.add(ts);
      }
    }

    this.session = {
      mode: 'video',
      targetMember: {
        id: incoming.callerId,
        name: incoming.callerName,
        avatar: incoming.callerAvatar,
        role: incoming.callerRole as any,
        lastLat: 0,
        lastLng: 0,
        lastUpdated: null,
        gridId: this.circleId || ''
      },
      status: 'connected',
      isMuted: false,
      isVideoEnabled: true,
      facingMode: 'user',
      startedAt: Date.now()
    };
    this.notify();

    // Signal connected state to Firestore bridge so caller knows call is answered and ringtone halts everywhere
    if (this.signalBridge && this.currentMember) {
      this.signalBridge({
        activeCall: {
          callerId: incoming.callerId,
          callerName: incoming.callerName,
          callerAvatar: incoming.callerAvatar,
          callerRole: incoming.callerRole,
          targetMemberId: this.currentMember.id,
          type: 'video',
          status: 'connected',
          callerPeerId: this.myPeerId || this.getPeerIdForMember(this.currentMember.id),
          timestamp: Date.now()
        }
      });
    }

    // Acquire local media with progressive fallback - NEVER throws!
    const stream = await this.getLocalMedia(true, 'user');

    if (incoming.mediaConnection) {
      try {
        incoming.mediaConnection.answer(stream);
        this.activeMediaConnection = incoming.mediaConnection;

        incoming.mediaConnection.on('stream', (remoteMediaStream) => {
          radioAudio.playCallConnected();
          this.remoteStream = remoteMediaStream;
          this.notify();
        });

        incoming.mediaConnection.on('close', () => {
          this.endCall();
        });
      } catch (err) {
        console.warn('Answer media connection error:', err);
      }
    } else if (incoming.callerPeerId && this.peer && !this.peer.destroyed) {
      // Answer back via caller's peer ID if signaled through Firestore
      try {
        const call = this.peer.call(incoming.callerPeerId, stream, {
          metadata: {
            type: 'video',
            callerId: this.currentMember?.id,
            callerName: this.currentMember?.name || 'Member',
            callerAvatar: this.currentMember?.avatar || '👤'
          }
        });
        this.activeMediaConnection = call;

        call.on('stream', (remoteMediaStream) => {
          radioAudio.playCallConnected();
          this.remoteStream = remoteMediaStream;
          this.notify();
        });

        call.on('close', () => {
          this.endCall();
        });
      } catch (e) {
        console.warn('Reverse peer call error:', e);
      }
    }
  }

  /**
   * Decline an incoming video call.
   */
  public declineIncomingCall() {
    radioAudio.stopIncomingCallRingtone();
    radioAudio.playCallEndTone();
    if (this.incomingCall) {
      if (this.incomingCall.callId) {
        const ts = Number(this.incomingCall.callId);
        if (!isNaN(ts)) this.handledCallTimestamps.add(ts);
      }
      try { this.incomingCall.mediaConnection?.close(); } catch {}
      this.incomingCall = null;
    }
    if (this.signalBridge) {
      this.signalBridge({ activeCall: null });
    }
    this.notify();
  }

  /**
   * Toggle Audio Mute / Unmute
   */
  public toggleMute() {
    if (!this.session || !this.localStream) return;
    const newMuted = !this.session.isMuted;
    this.session.isMuted = newMuted;
    this.localStream.getAudioTracks().forEach(t => {
      t.enabled = !newMuted;
    });
    this.notify();
  }

  /**
   * Toggle Video Camera On / Off
   */
  public toggleVideo() {
    if (!this.session || !this.localStream) return;
    const newEnabled = !this.session.isVideoEnabled;
    this.session.isVideoEnabled = newEnabled;
    this.localStream.getVideoTracks().forEach(t => {
      t.enabled = newEnabled;
    });
    this.notify();
  }

  /**
   * Flip Camera between Front ('user') and Back ('environment') on Mobile/Tablet
   */
  public async flipCamera() {
    if (!this.session || this.session.mode !== 'video') return;
    const nextFacing = this.session.facingMode === 'user' ? 'environment' : 'user';
    this.session.facingMode = nextFacing;
    this.notify();

    try {
      const stream = await this.getLocalMedia(true, nextFacing);
      const newVideoTrack = stream.getVideoTracks()[0];
      if (newVideoTrack && this.activeMediaConnection?.peerConnection) {
        const senders = this.activeMediaConnection.peerConnection.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(newVideoTrack);
        }
      }
      this.notify();
    } catch (e) {
      console.warn('Failed to flip camera:', e);
    }
  }

  /**
   * End current call or close Walkie-Talkie session.
   */
  public endCall() {
    radioAudio.stopIncomingCallRingtone();
    radioAudio.playCallEndTone();

    if (this.activeMediaConnection) {
      try { this.activeMediaConnection.close(); } catch {}
      this.activeMediaConnection = null;
    }

    this.broadcastMediaConnections.forEach(conn => {
      try { conn.close(); } catch {}
    });
    this.broadcastMediaConnections.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }

    this.remoteStream = null;
    this.session = null;
    this.incomingCall = null;
    this.isPttPressed = false;
    this.remoteSpeakerName = null;
    this.isRemoteSpeaking = false;
    this.permissionWarning = null;

    if (this.signalBridge) {
      this.signalBridge({ activeCall: null });
    }

    this.notify();
  }

  /**
   * Full cleanup on logout or unmount.
   */
  public cleanup() {
    this.endCall();
    if (this.peer) {
      try { this.peer.destroy(); } catch {}
      this.peer = null;
    }
    this.myPeerId = null;
    this.circleId = null;
  }
}

export const commsManager = new CommsManager();
