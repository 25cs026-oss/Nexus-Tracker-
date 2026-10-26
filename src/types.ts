export type MemberRole = 'Mom' | 'Dad' | 'Son' | 'Daughter' | 'Grandparent' | 'Partner' | 'Friend' | 'Pet' | 'Other';

export interface GridCircle {
  id: string; // The PIN / Invite Code
  name: string;
  createdAt: any;
  ownerId?: string;
  requireApproval?: boolean;
  safeZones?: SafeZone[];
}

export interface DeviceMember {
  id: string;
  name: string;
  role?: MemberRole;
  avatar?: string; // emoji or icon name
  lastLat: number;
  lastLng: number;
  lastUpdated: any;
  gridId: string;
  battery?: number;
  isCharging?: boolean;
  speed?: number; // km/h or m/s
  accuracy?: number; // meters
  signal?: number;
  isSosActive?: boolean;
  sosMessage?: string;
  statusMessage?: string;
  statusUpdatedAt?: any;
  currentPlace?: string; // Name of safe zone if inside
  isSharingPaused?: boolean;
  status?: 'pending' | 'approved' | 'declined';
  isApproved?: boolean;
  latestCheckIn?: CheckInPing;
  recentCheckIns?: CheckInPing[];
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
}

export interface SafeZone {
  id: string;
  name: string;
  icon: string; // emoji e.g. 🏠, 🏫, 🏢, 🏥, 🌳
  lat: number;
  lng: number;
  radius: number; // in meters (e.g. 200m)
}

export interface HistoryPoint {
  lat: number;
  lng: number;
  timestamp: any;
  accuracy?: number;
  speed?: number;
  placeName?: string;
}

export interface CheckInPing {
  id: string;
  deviceId: string;
  memberName: string;
  avatar: string;
  message: string;
  timestamp: any;
  lat?: number;
  lng?: number;
  place?: string;
}

export interface SystemLog {
  id?: string;
  message: string;
  timestamp: Date | string | number;
  type: 'info' | 'warning' | 'error' | 'success';
}

export interface SavedCircleSummary {
  id: string; // The PIN
  name: string;
  joinedAt: string;
  role?: MemberRole;
  avatar?: string;
  memberName?: string;
}

export type ActiveTab = 'map' | 'members' | 'places' | 'history' | 'checkins' | 'radio';
export type AppTheme = 'light' | 'dark' | 'midnight';
