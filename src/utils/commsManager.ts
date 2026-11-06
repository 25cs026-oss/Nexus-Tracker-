/**
 * Nexus Tactical Comms Engine (Walkie-Talkie & Live Video Calling)
 * 
 * Powered by WebRTC, PeerJS & Firestore Hybrid Signaling.
 * Features:
 * - Pre-warmed microphone stream: 0ms Push-to-Talk latency without hardware lag.
 * - Redundant STUN & OpenRelay TURN servers for cross-carrier mobile/laptop traversal.
 * - Single-channel audio routing: zero feedback, echo, or doubled sound streams.
 * - Voice burst deduplication: prevents repeated or cascading audio bursts.
 * - Clean call state management: guarantees ringtones halt the instant a call is answered/ended.
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
    burstId?: string;
    senderId: string;
    senderName: string;
    audioData: string;
    timestamp: number;
    targetMemberId?: string;
  } | null;
}) => void;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:openrelay.metered.ca:80' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

const RTC_CONFIG: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

export class CommsManager {
  private peer: Peer | null = null;
  private myPeerId: string | null = null;
  private circleId: string | null = null;
  private currentMember: DeviceMember | null = null;
  private membersList: DeviceMember[] = [];

  // Active Media Streams & Recorders
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private prewarmedMicStream: MediaStream | null = null;
  private activeMediaConnection: MediaConnection | null = null;
  private broadcastMediaConnections: Map<string, MediaConnection> = new Map();
  private dataConnections: Map<string, DataConnection> = new Map();
  private mediaRecorder: MediaRecorder | null = null;
  private pttRecordedChunks: Blob[] = [];

  // Pending call handshake state
  private pendingAnswerStream: MediaStream | null = null;
  private pendingCallerId: string | null = null;
  private pendingCallerPeerId: string | null = null;

  // Comms State
  private session: ActiveCommsSession | null = null;
  private incomingCall: IncomingCallInfo | null = null;
  private isPttPressed: boolean = false;
  private remoteSpeakerName: string | null = null;
  private isRemoteSpeaking: boolean = false;
  private permissionWarning: string | null = null;
  private handledCallTimestamps: Set<number> = new Set();
  private handledBurstIds: Set<string> = new Set();
  private pttAutoTimeout: any = null;

  // Single dedicated audio element for radio voice burst playback
  private radioAudioElement: HTMLAudioElement | null = null;

  // Signal Bridge to Firestore
  private signalBridge: SignalBridgeHandler | null = null;

  // Listeners for React components
  private listeners: Set<CommsEventCallback> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      this.getOrCreateRadioAudioElement();
    }
  }

  private getOrCreateRadioAudioElement(): HTMLAudioElement {
    if (!this.radioAudioElement && typeof document !== 'undefined') {
      try {
        const el = document.createElement('audio');
        el.autoplay = true;
        el.setAttribute('playsinline', 'true');
        el.style.display = 'none';
        if (document.body) {
          document.body.appendChild(el);
        }
        this.radioAudioElement = el;
      } catch {
        this.radioAudioElement = new Audio();
      }
    }
    return this.radioAudioElement || new Audio();
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
    const cleanCircle = this.circleId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 16) || 'grid';
    let idPart = memberId || 'unit';
    if (this.circleId && idPart.startsWith(this.circleId)) {
      idPart = idPart.slice(this.circleId.length);
    }
    let cleanMember = idPart.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 24);
    cleanMember = cleanMember.replace(/^_+|_+$/g, '');
    if (!cleanMember) cleanMember = 'unit';
    return `nxt_${cleanCircle}_${cleanMember}`;
  }

  /**
   * Pre-warm microphone in advance so PTT triggers immediately with ZERO hardware spin-up latency.
   */
  public async prewarmMic(): Promise<MediaStream | null> {
    if (this.prewarmedMicStream && this.prewarmedMicStream.getAudioTracks().some(t => t.readyState === 'live')) {
      return this.prewarmedMicStream;
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
        // Keep track alive but muted until PTT is held
        stream.getAudioTracks().forEach(t => { t.enabled = false; });
        this.prewarmedMicStream = stream;
        return stream;
      }
    } catch (e) {
      console.warn('Pre-warming microphone skipped:', e);
    }
    return null;
  }

  /**
   * Initialize PeerJS with the user's circle and device credentials.
   * Safe to call repeatedly: will NOT destroy existing open peer if credentials match!
   */
  public initialize(circleId: string, member: DeviceMember, members: DeviceMember[]) {
    this.circleId = circleId;
    this.currentMember = member;
    this.membersList = members;

    // If peer is already open and valid, just update members
    if (this.peer && !this.peer.destroyed && this.peer.open) {
      return;
    }

    const basePeerId = this.getPeerIdForMember(member.id);
    this.createPeer(basePeerId);
  }

  public updateMembersList(members: DeviceMember[]) {
    this.membersList = members;
  }

  public markSessionConnected() {
    radioAudio.stopIncomingCallRingtone();
    if (this.session && this.session.status === 'connecting') {
      this.session.status = 'connected';
      this.notify();
    }
  }

  private createPeer(peerId: string) {
    if (this.peer && !this.peer.destroyed) {
      try { this.peer.destroy(); } catch {}
    }

    this.myPeerId = peerId;

    try {
      this.peer = new Peer(peerId, {
        debug: 1,
        config: RTC_CONFIG
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
          console.warn('Peer ID collision. Generating unique sub-peer ID...');
          const fallbackId = `${peerId}_${Math.random().toString(36).substring(2, 7)}`;
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
    if (this.peer && this.peer.open && !this.peer.destroyed) return true;
    if ((!this.peer || this.peer.destroyed) && this.currentMember && this.circleId) {
      this.createPeer(this.getPeerIdForMember(this.currentMember.id));
    }
    if (!this.peer) return false;

    return new Promise<boolean>((resolve) => {
      if (this.peer?.open && !this.peer.destroyed) return resolve(true);
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
      return; // Already handled
    }

    if (this.incomingCall && this.incomingCall.callerId === callData.callerId) {
      return;
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
      mediaConnection: this.incomingCall?.mediaConnection || undefined
    };
    this.notify();
  }

  /**
   * Universal handler to bind incoming WebRTC MediaStream.
   */
  private setupRemoteStream(remoteMediaStream: MediaStream) {
    if (!remoteMediaStream) return;
    radioAudio.stopIncomingCallRingtone();
    radioAudio.playCallConnected();
    this.remoteStream = remoteMediaStream;
    if (this.session) {
      this.session.status = 'connected';
    }

    // Ensure all remote tracks are enabled and live
    try {
      remoteMediaStream.getTracks().forEach(t => {
        t.enabled = true;
      });
    } catch {}

    const notifyTracks = () => {
      try {
        remoteMediaStream.getTracks().forEach(t => { t.enabled = true; });
      } catch {}
      this.notify();
    };

    try {
      remoteMediaStream.onaddtrack = notifyTracks;
      remoteMediaStream.onremovetrack = notifyTracks;
      remoteMediaStream.getVideoTracks().forEach(t => {
        t.onunmute = notifyTracks;
        t.onended = notifyTracks;
      });
      remoteMediaStream.getAudioTracks().forEach(t => {
        t.onunmute = notifyTracks;
        t.onended = notifyTracks;
      });
    } catch {}

    this.notify();
  }

  /**
   * Bind event listeners to MediaConnection and its underlying RTCPeerConnection.
   */
  private bindMediaConnectionEvents(call: MediaConnection) {
    call.on('stream', (remoteMediaStream) => {
      console.log('MediaConnection stream received, total tracks:', remoteMediaStream.getTracks().length);
      this.setupRemoteStream(remoteMediaStream);
    });

    if ((call as any).remoteStream) {
      this.setupRemoteStream((call as any).remoteStream);
    }

    const pc = call.peerConnection;
    if (pc) {
      try {
        pc.ontrack = (evt) => {
          console.log('RTCPeerConnection ontrack received:', evt.track.kind);
          if (evt.streams && evt.streams[0]) {
            this.setupRemoteStream(evt.streams[0]);
          } else {
            if (!this.remoteStream) {
              this.remoteStream = new MediaStream();
            }
            if (!this.remoteStream.getTracks().some(t => t.id === evt.track.id)) {
              this.remoteStream.addTrack(evt.track);
            }
            this.setupRemoteStream(this.remoteStream);
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log('ICE connection state:', pc.iceConnectionState);
          if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            if (this.session && this.session.status !== 'connected') {
              this.session.status = 'connected';
              this.notify();
            }
          }
        };
      } catch (pcErr) {
        console.warn('Error attaching RTCPeerConnection listeners:', pcErr);
      }
    }

    call.on('close', () => {
      if (this.activeMediaConnection === call) {
        this.endCall();
      }
    });

    call.on('error', (err) => {
      console.warn('MediaConnection error note:', err);
    });
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
      const targetId = this.session?.targetMember?.id;
      const targetPeerId = this.session?.targetMember?.peerId;
      const callerId = meta.callerId || '';
      const callerPeer = call.peer;

      const isMatchingSession = Boolean(
        this.session &&
        (this.session.status === 'connecting' || this.session.status === 'connected') &&
        (
          (targetId && (callerId === targetId || targetId.includes(callerId) || callerId.includes(targetId))) ||
          (targetPeerId && targetPeerId === callerPeer) ||
          (this.pendingCallerId && (callerId === this.pendingCallerId || callerPeer === this.pendingCallerPeerId)) ||
          (this.getPeerIdForMember(targetId || '') === callerPeer)
        )
      );

      if (isMatchingSession) {
        console.log('Incoming call matches active session. Auto-answering...');
        radioAudio.stopIncomingCallRingtone();
        const answerStream = this.pendingAnswerStream || this.localStream;
        if (!answerStream) {
          this.getLocalMedia(true, 'user').then(s => {
            call.answer(s);
          }).catch(() => {
            call.answer();
          });
        } else {
          call.answer(answerStream);
        }

        this.pendingAnswerStream = null;
        this.pendingCallerId = null;
        this.pendingCallerPeerId = null;

        this.activeMediaConnection = call;
        this.bindMediaConnectionEvents(call);
        return;
      }

      // Normal incoming video call -> Trigger ringing banner
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
      this.bindMediaConnectionEvents(call);
      this.notify();
    } else {
      // Tactical Walkie-Talkie Radio -> Auto-receive and patch audio through
      this.remoteSpeakerName = meta.callerName || 'Tactical Radio';
      this.isRemoteSpeaking = true;

      try {
        call.answer();
      } catch {}

      call.on('stream', (remoteMediaStream) => {
        // Play directly through dedicated radio audio element
        const audio = this.getOrCreateRadioAudioElement();
        if (audio.srcObject !== remoteMediaStream) {
          audio.srcObject = remoteMediaStream;
        }
        audio.play().catch(() => {});
      });

      call.on('close', () => {
        if (this.activeMediaConnection === call) {
          radioAudio.playRogerBeep();
          this.isRemoteSpeaking = false;
          this.remoteSpeakerName = null;
          this.notify();
        }
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
        this.notify();
      } else if (data.type === 'PTT_STOP') {
        radioAudio.playRogerBeep();
        this.isRemoteSpeaking = false;
        this.notify();
      } else if (data.type === 'RADIO_VOICE_BURST' && data.audioData) {
        this.playRadioAudioBurst(data.audioData, data.senderName || 'Radio Unit', data.burstId);
      }
    });
  }

  /**
   * Play an incoming high-fidelity radio voice transmission packet with deduplication.
   */
  public playRadioAudioBurst(audioData: string, senderName: string, burstId?: string) {
    if (!audioData) return;

    // Deduplicate so burst is NEVER played twice
    const idKey = burstId || `${senderName}_${audioData.slice(0, 32)}`;
    if (this.handledBurstIds.has(idKey)) return;
    this.handledBurstIds.add(idKey);

    // Keep handledBurstIds bounded to last 100 items
    if (this.handledBurstIds.size > 100) {
      const first = Array.from(this.handledBurstIds)[0];
      this.handledBurstIds.delete(first);
    }

    this.remoteSpeakerName = senderName;
    this.isRemoteSpeaking = true;
    radioAudio.playPttStartChirp();
    this.notify();

    const audio = this.getOrCreateRadioAudioElement();
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

    // Release pre-warmed mic so microphone hardware is 100% unlocked for camera/mic streams
    if (this.prewarmedMicStream) {
      try {
        this.prewarmedMicStream.getTracks().forEach(t => t.stop());
      } catch {}
      this.prewarmedMicStream = null;
    }

    if (typeof window !== 'undefined' && (window as any).NexusNative?.ensureMediaPermissions) {
      try { (window as any).NexusNative.ensureMediaPermissions(); } catch {}
    }

    // Reuse existing localStream if active and live
    if (this.localStream) {
      const liveVideo = this.localStream.getVideoTracks().filter(t => t.readyState === 'live');
      const liveAudio = this.localStream.getAudioTracks().filter(t => t.readyState === 'live');
      if ((isVideo ? liveVideo.length > 0 : true) && liveAudio.length > 0) {
        liveVideo.forEach(t => { t.enabled = this.session ? this.session.isVideoEnabled : true; });
        liveAudio.forEach(t => { t.enabled = this.session ? !this.session.isMuted : true; });
        return this.localStream;
      }
      this.localStream.getTracks().forEach(t => { try { t.stop(); } catch {} });
      this.localStream = null;
    }

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      // Stage 1: Flexible ideal constraints
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: isVideo ? {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 }
          } : false
        });
        stream.getAudioTracks().forEach(t => { t.enabled = true; });
        stream.getVideoTracks().forEach(t => { t.enabled = true; });
        this.localStream = stream;
        return stream;
      } catch (err1) {
        console.warn('Comms: Attempt 1 getUserMedia flexible constraints note:', err1);
      }

      // Stage 2: Standard constraints with facingMode
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: isVideo ? { facingMode } : false
        });
        stream.getAudioTracks().forEach(t => { t.enabled = true; });
        stream.getVideoTracks().forEach(t => { t.enabled = true; });
        this.localStream = stream;
        return stream;
      } catch (err2) {
        console.warn('Comms: Attempt 2 simple constraints note:', err2);
      }

      // Stage 3: Simple boolean audio + video
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: isVideo
        });
        stream.getAudioTracks().forEach(t => { t.enabled = true; });
        stream.getVideoTracks().forEach(t => { t.enabled = true; });
        this.localStream = stream;
        return stream;
      } catch (err3) {
        console.warn('Comms: Attempt 3 simple boolean note:', err3);
      }

      // Stage 4: Separate Video & Audio track acquisition
      if (isVideo) {
        try {
          let videoTrack: MediaStreamTrack | null = null;
          let audioTrack: MediaStreamTrack | null = null;

          try {
            const vStream = await navigator.mediaDevices.getUserMedia({ video: true });
            videoTrack = vStream.getVideoTracks()[0] || null;
          } catch {}

          try {
            const aStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioTrack = aStream.getAudioTracks()[0] || null;
          } catch {}

          if (videoTrack || audioTrack) {
            const combined = new MediaStream();
            if (videoTrack) combined.addTrack(videoTrack);
            if (audioTrack) combined.addTrack(audioTrack);
            combined.getTracks().forEach(t => { t.enabled = true; });
            this.localStream = combined;
            return combined;
          }
        } catch (err4) {
          console.warn('Comms: Attempt 4 separate track acquisition note:', err4);
        }
      }

      // Stage 5: Audio-Only with synthetic tactical video canvas (for devices without camera)
      if (isVideo) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 480;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#090d16';
            ctx.fillRect(0, 0, 640, 480);
            ctx.fillStyle = '#10b981';
            ctx.font = 'bold 22px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('⚡ NEXUS SECURE COMMS', 320, 210);
            ctx.fillStyle = '#94a3b8';
            ctx.font = '16px monospace';
            ctx.fillText('Live Tactical Audio Stream', 320, 250);
            ctx.font = '12px monospace';
            ctx.fillStyle = '#64748b';
            ctx.fillText('(Camera unavailable on this device)', 320, 280);
          }
          const canvasStream = (canvas as any).captureStream ? (canvas as any).captureStream(5) : null;
          if (canvasStream && canvasStream.getVideoTracks().length > 0) {
            audioStream.addTrack(canvasStream.getVideoTracks()[0]);
          }

          audioStream.getTracks().forEach(t => { t.enabled = true; });
          this.localStream = audioStream;
          this.permissionWarning = 'Camera unavailable. Live audio calling active.';
          if (this.session) {
            this.session.isVideoEnabled = false;
          }
          this.notify();
          return audioStream;
        } catch (err5) {
          console.warn('Comms: Attempt 5 canvas fallback note:', err5);
        }
      }
    }

    // Blank fallback MediaStream so app never crashes
    this.permissionWarning = 'Microphone/Camera access required. Please allow permissions in browser or app settings.';
    this.notify();
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
   * Start Walkie-Talkie Radio Mode (Opens radio HUD & pre-warms mic for instantaneous response)
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
    // Pre-warm mic in background so 0 latency occurs when user presses PTT
    this.prewarmMic().catch(() => {});
  }

  /**
   * Push-to-Talk (PTT) Key Down: Begin transmitting voice.
   */
  public async pressPtt() {
    if (this.isPttPressed) return;
    this.isPttPressed = true;
    this.notify();
    this.pttRecordedChunks = [];

    // Auto-timeout after 20s if user forgot to release
    if (this.pttAutoTimeout) clearTimeout(this.pttAutoTimeout);
    this.pttAutoTimeout = setTimeout(() => {
      if (this.isPttPressed) {
        this.releasePtt();
      }
    }, 20000);

    try {
      // Use pre-warmed mic stream if available (0ms instant recording!)
      let stream = this.prewarmedMicStream;
      if (!stream || !stream.getAudioTracks().some(t => t.readyState === 'live')) {
        stream = await this.prewarmMic();
      }
      if (!stream) {
        stream = await this.getLocalMedia(false);
      }

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

      // Subtle tactile click tone (does not bleed into mic)
      radioAudio.playPttStartChirp();

      // Check if user already released while media was being acquired
      if (!this.isPttPressed) {
        this.finishAndSendRecording();
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

    if (this.pttAutoTimeout) {
      clearTimeout(this.pttAutoTimeout);
      this.pttAutoTimeout = null;
    }

    this.finishAndSendRecording();
  }

  private finishAndSendRecording() {
    // Mute mic track immediately so roger beep is NOT recorded
    if (this.prewarmedMicStream) {
      this.prewarmedMicStream.getAudioTracks().forEach(t => { t.enabled = false; });
    }

    // Play tactile roger beep to sender
    radioAudio.playRogerBeep();

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
          if (this.pttRecordedChunks.length > 0) {
            const audioBlob = new Blob(this.pttRecordedChunks, { type: mime });
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64Audio = reader.result as string;
              if (base64Audio) {
                const burstId = `${this.currentMember?.id || 'unit'}_${Date.now()}`;
                this.handledBurstIds.add(burstId);

                // 1. Direct transmit over DataChannel
                targets.forEach(member => {
                  this.sendDataToMember(member, {
                    type: 'RADIO_VOICE_BURST',
                    burstId,
                    audioData: base64Audio,
                    senderName: this.currentMember?.name || 'Radio Unit'
                  });
                });

                // 2. Transmit over Firestore signal bridge as guaranteed fallback to ALL members!
                if (this.signalBridge && this.currentMember) {
                  this.signalBridge({
                    radioBurst: {
                      burstId,
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
      }
    }

    targets.forEach(member => {
      this.sendDataToMember(member, { type: 'PTT_STOP' });
    });

    this.notify();
  }

  // ==========================================
  // LIVE VIDEO CALL METHODS
  // ==========================================

  /**
   * Initiate an HD video call to a member.
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

    // Release prewarmed mic so hardware mic is fully unlocked
    if (this.prewarmedMicStream) {
      try { this.prewarmedMicStream.getTracks().forEach(t => t.stop()); } catch {}
      this.prewarmedMicStream = null;
    }

    // 1. Acquire local media FIRST with progressive fallback
    const stream = await this.getLocalMedia(true, 'user');
    await this.ensurePeerOpen();

    const targetPeerId = targetMember.peerId || this.getPeerIdForMember(targetMember.id);

    // 2. Publish call signal to Firestore so target device receives notification with caller's peer ID
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

    if (this.peer && !this.peer.destroyed) {
      try {
        const call = this.peer.call(targetPeerId, stream, {
          metadata: {
            type: 'video',
            callerId: this.currentMember?.id,
            callerName: this.currentMember?.name || 'Member',
            callerAvatar: this.currentMember?.avatar || '👤',
            callerRole: this.currentMember?.role,
            callerPeerId: this.myPeerId || this.getPeerIdForMember(this.currentMember?.id || '')
          }
        });

        this.activeMediaConnection = call;
        this.bindMediaConnectionEvents(call);
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

    // Release pre-warmed mic so hardware mic is fully unlocked
    if (this.prewarmedMicStream) {
      try { this.prewarmedMicStream.getTracks().forEach(t => t.stop()); } catch {}
      this.prewarmedMicStream = null;
    }

    // 1. Acquire local media
    const stream = await this.getLocalMedia(true, 'user');

    // 2. Signal connected state to Firestore bridge so caller stops ringing
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
          callerPeerId: incoming.callerPeerId || '',
          timestamp: Date.now()
        }
      });
    }

    if (incoming.mediaConnection) {
      try {
        incoming.mediaConnection.answer(stream);
        this.activeMediaConnection = incoming.mediaConnection;
        this.bindMediaConnectionEvents(incoming.mediaConnection);
      } catch (err) {
        console.warn('Answer media connection error:', err);
      }
    } else {
      // Store pending stream so when incoming call arrives from PeerJS within milliseconds, it auto-answers immediately!
      this.pendingAnswerStream = stream;
      this.pendingCallerId = incoming.callerId;
      this.pendingCallerPeerId = incoming.callerPeerId || '';

      setTimeout(() => {
        if (!this.activeMediaConnection && this.session && this.session.status === 'connected' && incoming.callerPeerId && this.peer && !this.peer.destroyed) {
          console.log('Fallback: Dialing caller directly...');
          try {
            const call = this.peer.call(incoming.callerPeerId, stream, {
              metadata: {
                type: 'video',
                callerId: this.currentMember?.id,
                callerName: this.currentMember?.name || 'Member',
                callerAvatar: this.currentMember?.avatar || '👤',
                callerPeerId: this.myPeerId || this.getPeerIdForMember(this.currentMember?.id || '')
              }
            });
            this.activeMediaConnection = call;
            this.bindMediaConnectionEvents(call);
          } catch (e) {
            console.warn('Fallback dial error:', e);
          }
        }
      }, 3500);
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

    this.pendingAnswerStream = null;
    this.pendingCallerId = null;
    this.pendingCallerPeerId = null;

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

    if (this.radioAudioElement) {
      try {
        this.radioAudioElement.srcObject = null;
        this.radioAudioElement.pause();
      } catch {}
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
    if (this.prewarmedMicStream) {
      this.prewarmedMicStream.getTracks().forEach(t => t.stop());
      this.prewarmedMicStream = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch {}
      this.peer = null;
    }
    this.myPeerId = null;
    this.circleId = null;
  }
}

export const commsManager = new CommsManager();
