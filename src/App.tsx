/**
 * Nexus Tracker — Family & Group GPS Location Safety
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  GridCircle, 
  DeviceMember, 
  SafeZone, 
  CheckInPing, 
  HistoryPoint, 
  MemberRole, 
  AppTheme,
  ActiveTab,
  SavedCircleSummary
} from './types';
import { 
  db, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs, 
  serverTimestamp, 
  deleteDoc,
  writeBatch 
} from './firebase';
import { 
  findCurrentPlace, 
  getLiveBattery, 
  formatRelativeTime 
} from './utils/geo';
import { 
  geoService, 
  GeoLocationResult, 
  GpsStatus 
} from './utils/geolocation';
import { 
  DEMO_PIN, 
  createDemoDataForLocation 
} from './utils/demoData';

import { Map } from './components/Map';
import { FamilyMemberCard } from './components/FamilyMemberCard';
import { SafeZonesModal } from './components/SafeZonesModal';
import { SosModal } from './components/SosModal';
import { CheckInModal } from './components/CheckInModal';
import { SettingsModal } from './components/SettingsModal';
import { TripTimeline } from './components/TripTimeline';
import { OnboardingModal } from './components/OnboardingModal';
import { NavigationModal } from './components/NavigationModal';
import { InstallAppModal } from './components/InstallAppModal';
import { BackgroundGuideModal } from './components/BackgroundGuideModal';
import { CommsModal } from './components/CommsModal';
import { WalkieTalkieStation } from './components/WalkieTalkieStation';
import { backgroundRunner } from './utils/backgroundRunner';
import { notificationManager } from './utils/notificationManager';
import { sirenAudio } from './utils/sirenAudio';
import { radioAudio } from './utils/radioAudio';
import { commsManager } from './utils/commsManager';

import { 
  Users, 
  MapPin, 
  ShieldAlert,
  ShieldCheck, 
  MessageSquare, 
  Settings, 
  Navigation, 
  Copy, 
  Check, 
  Radio, 
  CloudSun, 
  Share2, 
  Plus, 
  Sparkles,
  Crosshair,
  LocateFixed,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Download,
  Smartphone,
  Sun,
  History,
  Clock,
  X,
  Send,
  Video,
  Map as MapIcon
} from 'lucide-react';

const DEVICE_ID_KEY = 'nexus_device_id';
const TAB_DEVICE_ID_KEY = 'nexus_tab_id';
const CIRCLE_PIN_KEY = 'nexus_circle_pin';
const CIRCLE_DATA_KEY = 'nexus_circle_data';
const SAVED_CIRCLES_KEY = 'nexus_saved_circles';
const MEMBER_NAME_KEY = 'nexus_member_name';
const MEMBER_ROLE_KEY = 'nexus_member_role';
const MEMBER_AVATAR_KEY = 'nexus_member_avatar';
const THEME_KEY = 'nexus_theme';

const getDeviceId = () => {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `usr_${Math.random().toString(36).substring(2, 8)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
};

// Strict sanitizer to guarantee 100% serializable Firestore objects without undefined values
const sanitizeCheckIn = (item: any): CheckInPing => {
  const id = String(item?.id || `chk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const deviceId = String(item?.deviceId || '');
  const memberName = String(item?.memberName || 'Family Member');
  const avatar = String(item?.avatar || '👤');
  const message = String(item?.message || '').trim();

  let timestamp: string;
  if (typeof item?.timestamp === 'string' && item.timestamp.length > 0) {
    timestamp = item.timestamp;
  } else if (item?.timestamp?.toDate) {
    timestamp = item.timestamp.toDate().toISOString();
  } else if (item?.timestamp?.toMillis) {
    timestamp = new Date(item.timestamp.toMillis()).toISOString();
  } else if (item?.timestamp instanceof Date) {
    timestamp = item.timestamp.toISOString();
  } else if (typeof item?.timestamp === 'number') {
    timestamp = new Date(item.timestamp).toISOString();
  } else {
    timestamp = new Date().toISOString();
  }

  const clean: CheckInPing = {
    id,
    deviceId,
    memberName,
    avatar,
    message,
    timestamp
  };

  if (typeof item?.lat === 'number' && !isNaN(item.lat)) {
    clean.lat = item.lat;
  }
  if (typeof item?.lng === 'number' && !isNaN(item.lng)) {
    clean.lng = item.lng;
  }
  if (item?.place && typeof item.place === 'string' && item.place.trim().length > 0) {
    clean.place = item.place.trim();
  }

  return clean;
};

export default function App() {
  // Persistent User Profile
  const [deviceId] = useState<string>(getDeviceId);
  const [memberName, setMemberName] = useState<string>(() => localStorage.getItem(MEMBER_NAME_KEY) || '');
  const [memberRole, setMemberRole] = useState<MemberRole>(() => (localStorage.getItem(MEMBER_ROLE_KEY) as MemberRole) || 'Mom');
  const [memberAvatar, setMemberAvatar] = useState<string>(() => localStorage.getItem(MEMBER_AVATAR_KEY) || '👩');
  const [theme, setTheme] = useState<AppTheme>(() => (localStorage.getItem(THEME_KEY) as AppTheme) || 'light');

  // Circle State
  const [currentCircle, setCurrentCircle] = useState<GridCircle | null>(() => {
    const saved = localStorage.getItem(CIRCLE_DATA_KEY);
    return saved ? JSON.parse(saved) : null;
  });
  const [savedCircles, setSavedCircles] = useState<SavedCircleSummary[]>(() => {
    try {
      const raw = localStorage.getItem(SAVED_CIRCLES_KEY);
      if (raw) return JSON.parse(raw);
      const singleData = localStorage.getItem(CIRCLE_DATA_KEY);
      if (singleData) {
        const parsed = JSON.parse(singleData);
        return [{
          id: parsed.id,
          name: parsed.name,
          joinedAt: new Date().toISOString()
        }];
      }
    } catch {}
    return [];
  });
  const [showCircleSwitcher, setShowCircleSwitcher] = useState<boolean>(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('map');
  const [copiedCode, setCopiedCode] = useState(false);

  // Mobile Native App State
  const [mobileSheetExpanded, setMobileSheetExpanded] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<'members' | 'radio' | 'history' | 'checkins'>('members');
  const [inlineFeedMsg, setInlineFeedMsg] = useState<string>('');

  // Pending Join Requests (Host Approval Queue)
  const [pendingJoinRequests, setPendingJoinRequests] = useState<DeviceMember[]>([]);

  // Mobile Bottom Sheet Gesture Tracking
  const touchStartY = useRef<number>(0);
  const touchCurrentY = useRef<number>(0);

  const handleSheetTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
  };

  const handleSheetTouchMove = (e: React.TouchEvent) => {
    touchCurrentY.current = e.touches[0].clientY;
  };

  const handleSheetTouchEnd = () => {
    const deltaY = touchStartY.current - touchCurrentY.current;
    if (deltaY > 30) {
      // Swiped UP -> expand bottom sheet
      setMobileSheetExpanded(true);
    } else if (deltaY < -30) {
      // Swiped DOWN -> collapse bottom sheet to peek
      setMobileSheetExpanded(false);
    }
  };

  // Live Data
  const [members, setMembers] = useState<DeviceMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<DeviceMember | null>(null);
  const [safeZones, setSafeZones] = useState<SafeZone[]>([]);
  const [checkIns, setCheckIns] = useState<CheckInPing[]>(() => {
    try {
      const saved = localStorage.getItem('nexus_cached_checkins');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      // Clean and remove any legacy automated arrival spam
      const cleaned = Array.isArray(parsed) 
        ? parsed.filter(c => c && !String(c.id).startsWith('auto_') && !String(c.message).includes('Arrived at') && !String(c.message).includes('Left '))
        : [];
      localStorage.setItem('nexus_cached_checkins', JSON.stringify(cleaned));
      return cleaned;
    } catch {
      return [];
    }
  });
  const seenAlertedCheckInIds = useRef<Set<string>>(new Set());
  const seenRadioBurstTimestamps = useRef<Set<number>>(new Set());
  const handledCallTimestamps = useRef<Set<number>>(new Set());
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [weather, setWeather] = useState<{ temp: number; condition: string } | null>(null);

  // Geolocation State
  const [isTracking, setIsTracking] = useState<boolean>(true);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('searching');
  const [gpsMessage, setGpsMessage] = useState<string>('Finding your location...');
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [currentSpeed, setCurrentSpeed] = useState<number>(0);
  const [gpsAccuracy, setGpsAccuracy] = useState<number>(0);
  const [currentBattery, setCurrentBattery] = useState<{ level: number; isCharging: boolean } | null>(null);
  const [isSharingPaused, setIsSharingPaused] = useState<boolean>(false);
  const [mapFocusOverride, setMapFocusOverride] = useState<{ lat: number; lng: number } | null>(null);

  // Modals State
  const [showSafeZonesModal, setShowSafeZonesModal] = useState(false);
  const [showSosModal, setShowSosModal] = useState(false);
  const [dismissedSosMemberId, setDismissedSosMemberId] = useState<string | null>(null);
  const [isSirenMuted, setIsSirenMuted] = useState<boolean>(false);
  const lastAlertedSosId = useRef<string | null>(null);
  const [circleActiveSos, setCircleActiveSos] = useState<any>(null);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showCommsModal, setShowCommsModal] = useState<boolean>(false);
  const [navigatingMember, setNavigatingMember] = useState<DeviceMember | null>(null);

  // PWA & Mobile Installation State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
  });

  // Screen WakeLock (Trip Mode - Keeps phone screen awake while tracking)
  const [isWakeLockActive, setIsWakeLockActive] = useState<boolean>(false);
  const wakeLockRef = useRef<any>(null);

  // 24/7 Background Tracking Service (Audio lock + WakeLock + MediaSession)
  const [isBackgroundActive, setIsBackgroundActive] = useState<boolean>(false);
  const [showBackgroundModal, setShowBackgroundModal] = useState<boolean>(false);

  // Battery Optimization: 10-second smart rate-limiter & Eco Background Mode
  const lastFirestoreSyncRef = useRef<number>(0);
  const lastSavedCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const isAppHiddenRef = useRef<boolean>(false);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const lastPlaceNameRef = useRef<string | null | undefined>(undefined);

  // Dedicated Heartbeat sync: ensures Mom, Dad & all members' lastUpdated in Firestore
  // is continuously updated every 15-25 seconds even when device is stationary (desk, pocket).
  const sendHeartbeat = useCallback(async (forced = false) => {
    if (!currentCircle || isDemoMode || isSharingPaused) return;

    const coords = currentCoords || geoService.lastKnownPosition;
    if (!coords) return;

    const now = Date.now();
    const minInterval = 9000; // 9-10s interval guarantees members continuously stay "Live"
    const elapsed = now - lastFirestoreSyncRef.current;

    if (!forced && lastFirestoreSyncRef.current > 0 && elapsed < minInterval) {
      return;
    }

    lastFirestoreSyncRef.current = now;
    lastSavedCoordsRef.current = { lat: coords.lat, lng: coords.lng };

    const memberDocId = `${currentCircle.id}_${deviceId}`;
    const currentPlace = findCurrentPlace(coords.lat, coords.lng, safeZones);
    const liveBattery = await getLiveBattery();

    const payload: Record<string, any> = {
      id: memberDocId,
      name: memberName || 'Family Member',
      role: memberRole,
      avatar: memberAvatar,
      lastLat: coords.lat,
      lastLng: coords.lng,
      lastUpdated: serverTimestamp(),
      gridId: currentCircle.id,
      speed: coords.speed || currentSpeed || 0,
      accuracy: coords.accuracy || gpsAccuracy || 10,
      isSharingPaused: false,
      battery: liveBattery.level,
      isCharging: liveBattery.isCharging
    };

    if (currentPlace?.name) {
      payload.currentPlace = currentPlace.name;
    }

    try {
      await setDoc(doc(db, 'devices', memberDocId), payload, { merge: true });
    } catch (err) {
      console.warn('Heartbeat firestore sync failed:', err);
    }

    // Background Active SOS Poller (guarantees screen-off / background notification delivery)
    try {
      const sosQ = query(
        collection(db, 'devices'),
        where('gridId', '==', currentCircle.id),
        where('isSosActive', '==', true)
      );
      const sosSnap = await getDocs(sosQ);
      if (!sosSnap.empty) {
        for (const docSnap of sosSnap.docs) {
          const sosMember = docSnap.data() as DeviceMember;
          if (sosMember.id !== memberDocId) {
            // Another member triggered SOS!
            notificationManager.showSosAlertNotification(sosMember.name, sosMember.currentPlace);
            sirenAudio.start();
            setShowSosModal(true);
          }
        }
      }
    } catch {}
  }, [currentCircle, isDemoMode, isSharingPaused, currentCoords, deviceId, safeZones, memberName, memberRole, memberAvatar, currentSpeed, gpsAccuracy]);

  // Auto-switch to Eco-Mode when user locks screen, minimizes, or switches apps + wake up on resume
  useEffect(() => {
    const handleVisibility = () => {
      const isHidden = document.visibilityState === 'hidden';
      isAppHiddenRef.current = isHidden;
      geoService.setEcoMode(isHidden);
      if (!isHidden) {
        geoService.forceRefresh();
        sendHeartbeat(true);
      }
    };

    const handleFocus = () => {
      isAppHiddenRef.current = false;
      geoService.setEcoMode(false);
      lastFirestoreSyncRef.current = 0;
      geoService.forceRefresh();
      sendHeartbeat(true);
    };

    const handleOnline = () => {
      geoService.forceRefresh();
      sendHeartbeat(true);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', () => {
      isAppHiddenRef.current = true;
      geoService.setEcoMode(true);
    });
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    const handleSwMessage = (e: MessageEvent) => {
      if (e.data?.type === 'SYNC_LOCATION' || e.data?.type === 'PERIODIC_SYNC_LOCATION') {
        geoService.forceRefresh();
        sendHeartbeat(true);
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
    };
  }, [sendHeartbeat]);

  // Zero-click Auto-Start Background Runner & Sync state
  useEffect(() => {
    backgroundRunner.autoStart();

    backgroundRunner.onStateChange((active) => {
      setIsBackgroundActive(active);
      setIsWakeLockActive(active);
    });

    backgroundRunner.onHeartbeat(() => {
      sendHeartbeat();
    });

    // Zero-click fallback: on first user touch anywhere, start background runner & push heartbeat
    const onUserTouch = () => {
      backgroundRunner.start().catch(() => {});
      sendHeartbeat(true);
    };

    window.addEventListener('pointerdown', onUserTouch, { once: true, passive: true });
    window.addEventListener('touchstart', onUserTouch, { once: true, passive: true });
    window.addEventListener('click', onUserTouch, { once: true, passive: true });
  }, [sendHeartbeat]);

  // Ensure background runner starts as soon as circle is active
  useEffect(() => {
    if (currentCircle) {
      backgroundRunner.autoStart();
      sendHeartbeat(true);
      notificationManager.showLiveTrackingNotification(currentCircle.name, members.length);
    }
  }, [currentCircle, sendHeartbeat, members.length]);

  const toggleBackgroundTracking = async () => {
    if (isBackgroundActive) {
      backgroundRunner.stop();
      setIsBackgroundActive(false);
      setIsWakeLockActive(false);
      notificationManager.clearNotification();
    } else {
      const ok = await backgroundRunner.start();
      if (ok) {
        setIsBackgroundActive(true);
        setIsWakeLockActive(true);
        sendHeartbeat(true);
        notificationManager.showLiveTrackingNotification(currentCircle?.name, members.length);
      } else {
        setShowBackgroundModal(true);
      }
    }
  };

  // Listen for native PWA installation event
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Screen WakeLock Toggle (Trip Mode)
  const toggleWakeLock = async () => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      alert('Screen Wake Lock is not supported on this browser. Keeping screen awake requires Chrome or an installed PWA.');
      return;
    }

    try {
      if (isWakeLockActive) {
        if (wakeLockRef.current) {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        }
        setIsWakeLockActive(false);
      } else {
        const lock = await (navigator as any).wakeLock.request('screen');
        wakeLockRef.current = lock;
        setIsWakeLockActive(true);
        lock.addEventListener('release', () => {
          setIsWakeLockActive(false);
          wakeLockRef.current = null;
        });
      }
    } catch (err) {
      console.warn('Wake Lock error:', err);
    }
  };

  // Refs
  const historyIntervalId = useRef<number | null>(null);
  const demoIntervalRef = useRef<number | null>(null);
  const hasCenteredInitialPos = useRef<boolean>(false);

  // Apply Theme
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark' || theme === 'midnight') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // Battery detection
  useEffect(() => {
    const updateBattery = async () => {
      const bat = await getLiveBattery();
      if (bat) setCurrentBattery(bat);
    };
    updateBattery();
    const interval = setInterval(updateBattery, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch weather for selected member
  useEffect(() => {
    if (!selectedMember) {
      setWeather(null);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${selectedMember.lastLat.toFixed(2)}&longitude=${selectedMember.lastLng.toFixed(2)}&current_weather=true`
        );
        const data = await res.json();
        if (data.current_weather) {
          const code = data.current_weather.weathercode;
          let cond = 'Clear';
          if (code > 0 && code <= 3) cond = 'Partly Cloudy';
          else if (code <= 48) cond = 'Foggy';
          else if (code <= 67) cond = 'Rainy';
          else if (code <= 82) cond = 'Showers';
          else if (code <= 99) cond = 'Thunderstorm';

          setWeather({
            temp: Math.round(data.current_weather.temperature),
            condition: cond
          });
        }
      } catch {}
    }, 400);

    return () => clearTimeout(timeout);
  }, [selectedMember?.id, selectedMember?.lastLat, selectedMember?.lastLng]);

  // Handle position update from geolocation service
  const handlePositionUpdate = useCallback(async (res: GeoLocationResult) => {
    setCurrentCoords({ lat: res.lat, lng: res.lng });
    setCurrentSpeed(res.speed || 0);
    setGpsAccuracy(res.accuracy);

    // Auto-focus map on user's live position upon first lock
    if (!hasCenteredInitialPos.current) {
      hasCenteredInitialPos.current = true;
      setMapFocusOverride({ lat: res.lat, lng: res.lng });
    }

    // In Demo Mode: update "You (Me)" member location live
    if (isDemoMode) {
      setMembers(prev => prev.map(m => {
        if (m.id === 'demo-you' || m.id === `${DEMO_PIN}_${deviceId}`) {
          return {
            ...m,
            lastLat: res.lat,
            lastLng: res.lng,
            speed: res.speed || 0,
            lastUpdated: new Date()
          };
        }
        return m;
      }));

      setSelectedMember(prev => {
        if (prev?.id === 'demo-you') {
          return {
            ...prev,
            lastLat: res.lat,
            lastLng: res.lng,
            speed: res.speed || 0,
            lastUpdated: new Date()
          };
        }
        return prev;
      });
      return;
    }

    // In Live Mode: sync position to Firestore
    if (!currentCircle) return;

    const currentPlace = findCurrentPlace(res.lat, res.lng, safeZones);
    const memberDocId = `${currentCircle.id}_${deviceId}`;
    const baseId = localStorage.getItem(DEVICE_ID_KEY);

    const payload: Record<string, any> = {
      id: memberDocId,
      name: memberName || 'Family Member',
      role: memberRole,
      avatar: memberAvatar,
      lastLat: res.lat,
      lastLng: res.lng,
      lastUpdated: serverTimestamp(),
      gridId: currentCircle.id,
      speed: res.speed || 0,
      accuracy: res.accuracy || 10,
      isSharingPaused: isSharingPaused
    };

    if (currentPlace?.name) {
      payload.currentPlace = currentPlace.name;
    }

    if (currentBattery) {
      payload.battery = currentBattery.level;
      payload.isCharging = currentBattery.isCharging;
    }

    // Immediately update local members state with live position for zero-latency response!
    const selfItem: DeviceMember = {
      id: memberDocId,
      name: memberName || 'Family Member',
      role: memberRole,
      avatar: memberAvatar,
      lastLat: res.lat,
      lastLng: res.lng,
      lastUpdated: new Date(),
      gridId: currentCircle.id,
      speed: res.speed || 0,
      accuracy: res.accuracy || 10,
      currentPlace: currentPlace ? currentPlace.name : undefined,
      battery: currentBattery?.level || 100,
      isCharging: currentBattery?.isCharging || false,
      isSharingPaused
    };

    setMembers(prev => {
      const existingIdx = prev.findIndex(m => m.id === memberDocId || (m.name && m.name === memberName));
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = { ...copy[existingIdx], ...selfItem, id: memberDocId };
        return copy;
      } else {
        return [selfItem, ...prev];
      }
    });

    // Auto-select self if no member or previous was self
    setSelectedMember(prev => {
      if (!prev || prev.id === memberDocId || (prev.name && prev.name === memberName)) {
        return selfItem;
      }
      return prev;
    });

    // Battery Guard: Throttle Firestore transmissions to 10s in foreground, 25s in background
    const now = Date.now();
    const isHidden = isAppHiddenRef.current;
    const minSyncInterval = isHidden ? 25000 : 9800; // 10s foreground, 25s background
    const elapsedSinceLastSync = now - lastFirestoreSyncRef.current;

    let distanceMoved = 999;
    if (lastSavedCoordsRef.current) {
      const dLat = (res.lat - lastSavedCoordsRef.current.lat) * 111320;
      const dLng = (res.lng - lastSavedCoordsRef.current.lng) * 111320 * Math.cos(res.lat * Math.PI / 180);
      distanceMoved = Math.sqrt(dLat * dLat + dLng * dLng);
    }

    if (lastFirestoreSyncRef.current > 0 && elapsedSinceLastSync < minSyncInterval && distanceMoved < 10 && (!res.speed || res.speed < 1)) {
      return;
    }

    lastFirestoreSyncRef.current = now;
    lastSavedCoordsRef.current = { lat: res.lat, lng: res.lng };

    try {
      await setDoc(doc(db, 'devices', memberDocId), payload, { merge: true });
    } catch (err) {
      console.warn('Location sync to firestore failed:', err);
    }
  }, [currentCircle, deviceId, memberName, memberRole, memberAvatar, safeZones, isDemoMode, isSharingPaused, currentBattery]);

  const handleStatusUpdate = useCallback((status: GpsStatus, errorMsg?: string) => {
    setGpsStatus(status);
    setGpsMessage(errorMsg || '');
  }, []);

  // Tracking control functions
  const startTracking = useCallback(() => {
    setIsTracking(true);
    geoService.startTracking(handlePositionUpdate, handleStatusUpdate);

    // Guaranteed 10s Heartbeat transmitter (eliminates stationary "9h ago" & background disconnects)
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    heartbeatIntervalRef.current = window.setInterval(() => {
      sendHeartbeat();
    }, 10000);

    if (historyIntervalId.current) clearInterval(historyIntervalId.current);
    historyIntervalId.current = window.setInterval(async () => {
      if (currentCoords && currentCircle && !isDemoMode && !isSharingPaused) {
        try {
          const currentPlace = findCurrentPlace(currentCoords.lat, currentCoords.lng, safeZones);
          const memberDocId = `${currentCircle.id}_${deviceId}`;
          const historyPayload: Record<string, any> = {
            lat: currentCoords.lat,
            lng: currentCoords.lng,
            timestamp: serverTimestamp(),
            speed: currentSpeed
          };
          if (currentPlace?.name) {
            historyPayload.placeName = currentPlace.name;
          }
          await addDoc(collection(db, `devices/${memberDocId}/history`), historyPayload);
        } catch {}
      }
    }, 30000);
  }, [handlePositionUpdate, handleStatusUpdate, currentCoords, currentCircle, isDemoMode, isSharingPaused, safeZones, deviceId, currentSpeed, sendHeartbeat]);

  const stopTracking = useCallback(() => {
    geoService.stopTracking();
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (historyIntervalId.current) {
      clearInterval(historyIntervalId.current);
      historyIntervalId.current = null;
    }
    setIsTracking(false);
    setGpsStatus('idle');
  }, []);

  // AUTO-START Live Tracking upon app launch
  useEffect(() => {
    startTracking();
    return () => {
      stopTracking();
    };
  }, []);

  // Real-time Firestore Listeners
  useEffect(() => {
    if (!currentCircle || isDemoMode) return;

    // Circle listener
    const memberDocId = `${currentCircle.id}_${deviceId}`;
    const circleDocRef = doc(db, 'grids', currentCircle.id);
    const unsubCircle = onSnapshot(circleDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as any;
        if (data.safeZones) setSafeZones(data.safeZones);
        setCircleActiveSos(data.activeSos || null);

        // Immediate Circle-Level SOS Broadcast Detection
        if (data.activeSos && data.activeSos.memberId !== memberDocId) {
          notificationManager.showSosAlertNotification(data.activeSos.memberName, data.activeSos.place);
          if (!isSirenMuted) {
            sirenAudio.start();
          }
          setShowSosModal(true);
        } else if (!data.activeSos && (!activeSosMember || activeSosMember.id === memberDocId)) {
          sirenAudio.stop();
          notificationManager.clearSosNotification();
        }
      }
    }, (err) => {
      console.warn('Circle listener error:', err);
    });

    // Devices in circle listener
    const devicesQuery = query(collection(db, 'devices'), where('gridId', '==', currentCircle.id));
    const unsubDevices = onSnapshot(devicesQuery, (snap) => {
      const rawList = snap.docs.map(d => ({ id: d.id, ...d.data() } as DeviceMember));
      
      const memberDocId = `${currentCircle.id}_${deviceId}`;

      // 1. Unified Real-Time Family Activity Feed across all members
      const aggregatedCheckIns: CheckInPing[] = [];
      const seenCheckInIds = new Set<string>();

      for (const m of rawList) {
        if (Array.isArray(m.recentCheckIns)) {
          for (const item of m.recentCheckIns) {
            if (item && item.id && !String(item.id).startsWith('auto_') && !String(item.message).includes('Arrived at') && !String(item.message).includes('Left ') && !seenCheckInIds.has(item.id)) {
              seenCheckInIds.add(item.id);
              aggregatedCheckIns.push(sanitizeCheckIn(item));
            }
          }
        }
        if (m.latestCheckIn && m.latestCheckIn.id && !String(m.latestCheckIn.id).startsWith('auto_') && !String(m.latestCheckIn.message).includes('Arrived at') && !String(m.latestCheckIn.message).includes('Left ') && !seenCheckInIds.has(m.latestCheckIn.id)) {
          seenCheckInIds.add(m.latestCheckIn.id);
          aggregatedCheckIns.push(sanitizeCheckIn(m.latestCheckIn));
        }

        // Live Comms & Video Call Signaling Detection
        if (m.activeCall && m.activeCall.targetMemberId === memberDocId) {
          const callTime = m.activeCall.timestamp || 0;
          if (m.activeCall.status === 'ringing') {
            const ageMs = Date.now() - callTime;
            if (ageMs < 45000 && !handledCallTimestamps.current.has(callTime)) {
              const currentSession = commsManager.getSession();
              if (!currentSession || currentSession.status !== 'connected') {
                handledCallTimestamps.current.add(callTime);
                commsManager.handleRemoteIncomingCallSignal(m.activeCall);
                setShowCommsModal(true);
                notificationManager.showImportantNotification(
                  `📹 Live Video Call: ${m.activeCall.callerName}`,
                  'Incoming call. Tap to answer.'
                );
              }
            }
          } else if (m.activeCall.status === 'connected') {
            handledCallTimestamps.current.add(callTime);
            radioAudio.stopIncomingCallRingtone();
          } else if (m.activeCall.status === 'ended') {
            handledCallTimestamps.current.add(callTime);
            radioAudio.stopIncomingCallRingtone();
            commsManager.handleRemoteCallEnded();
          }
        }

        // If I am caller and remote party accepted or ended
        if (m.activeCall && m.activeCall.callerId === memberDocId) {
          if (m.activeCall.status === 'connected') {
            radioAudio.stopIncomingCallRingtone();
            const session = commsManager.getSession();
            if (session && session.status === 'connecting') {
              session.status = 'connected';
            }
          } else if (m.activeCall.status === 'ended') {
            radioAudio.stopIncomingCallRingtone();
            commsManager.endCall();
          }
        }

        // Live Walkie-Talkie Voice Burst Reception
        if (m.radioBurst && m.radioBurst.senderId !== memberDocId) {
          const burstTime = m.radioBurst.timestamp || 0;
          const ageMs = Date.now() - burstTime;
          if (ageMs < 25000 && !seenRadioBurstTimestamps.current.has(burstTime)) {
            seenRadioBurstTimestamps.current.add(burstTime);
            const target = m.radioBurst.targetMemberId;
            const isForMe = !target || 
                            target === 'all' || 
                            target === memberDocId ||
                            target === deviceId ||
                            (typeof target === 'string' && (
                              memberDocId.includes(target) || 
                              target.includes(memberDocId)
                            ));
            if (isForMe) {
              commsManager.playRadioAudioBurst(m.radioBurst.audioData, m.radioBurst.senderName);
            }
          }
        }
      }

      setCheckIns(prev => {
        const full = [...aggregatedCheckIns];
        for (const item of prev) {
          if (item && item.id && !String(item.id).startsWith('auto_') && !String(item.message).includes('Arrived at') && !String(item.message).includes('Left ') && !seenCheckInIds.has(item.id)) {
            seenCheckInIds.add(item.id);
            full.push(sanitizeCheckIn(item));
          }
        }
        full.sort((a, b) => {
          const tA = new Date(a.timestamp || 0).getTime();
          const tB = new Date(b.timestamp || 0).getTime();
          return tB - tA;
        });
        const result = full.slice(0, 50);

        // Notify user if a NEW check-in from another member arrived
        const newest = result[0];
        if (newest && newest.deviceId !== memberDocId && !seenAlertedCheckInIds.current.has(newest.id)) {
          seenAlertedCheckInIds.current.add(newest.id);
          const ageSec = (Date.now() - new Date(newest.timestamp || 0).getTime()) / 1000;
          if (ageSec < 300) {
            notificationManager.showImportantNotification(
              `💬 ${newest.memberName}: Check-in`,
              newest.message || 'Shared a status update'
            );
            sirenAudio.playChime();
          }
        }

        try {
          localStorage.setItem('nexus_cached_checkins', JSON.stringify(result));
        } catch {}
        return result;
      });

      // 2. Separate pending join requests (Host approval queue)
      const pending = rawList.filter(m => m.status === 'pending' && m.id !== memberDocId);
      setPendingJoinRequests(pending);

      // Only approved members are shown in live tracking
      const approvedOnly = rawList.filter(m => m.status !== 'pending' || m.id === memberDocId);

      // 3. Real-time detection of external SOS alert
      const otherSos = approvedOnly.find(m => m.isSosActive && m.id !== memberDocId);
      if (otherSos) {
        if (dismissedSosMemberId !== otherSos.id) {
          setShowSosModal(true);
          if (!isSirenMuted) {
            sirenAudio.start();
          }
        }
        if (lastAlertedSosId.current !== otherSos.id) {
          lastAlertedSosId.current = otherSos.id;
          notificationManager.showSosAlertNotification(otherSos.name, otherSos.currentPlace);
        }
      }

      // Deduplicate: Each physical device has its own unique memberDocId
      const seenIds = new Set<string>();
      const list: DeviceMember[] = [];

      // Give priority to the current user's document
      const selfDoc = approvedOnly.find(m => m.id === memberDocId);
      if (selfDoc) {
        seenIds.add(selfDoc.id);
        list.push({
          ...selfDoc,
          id: memberDocId,
          name: memberName || selfDoc.name,
          role: memberRole || selfDoc.role,
          avatar: memberAvatar || selfDoc.avatar,
          lastLat: currentCoords?.lat || selfDoc.lastLat,
          lastLng: currentCoords?.lng || selfDoc.lastLng,
          lastUpdated: new Date()
        });
      } else if (currentCoords) {
        seenIds.add(memberDocId);
        list.push({
          id: memberDocId,
          name: memberName || 'You (Me)',
          role: memberRole,
          avatar: memberAvatar,
          lastLat: currentCoords.lat,
          lastLng: currentCoords.lng,
          lastUpdated: new Date(),
          gridId: currentCircle.id,
          speed: currentSpeed,
          accuracy: gpsAccuracy,
          battery: currentBattery?.level || 100,
          isCharging: currentBattery?.isCharging || false
        });
      }

      for (const m of approvedOnly) {
        if (m.id === memberDocId) continue;
        if (seenIds.has(m.id)) continue;
        seenIds.add(m.id);
        list.push(m);
      }

      setMembers(list);

      // Default selected member to self
      setSelectedMember(prev => {
        const selfMember = list.find(m => m.id === memberDocId);
        if (!prev) return selfMember || list[0] || null;
        const updated = list.find(m => m.id === prev.id);
        return updated || selfMember || list[0] || null;
      });
    }, (err) => {
      console.warn('Devices listener error:', err);
    });

    return () => {
      unsubCircle();
      unsubDevices();
    };
  }, [currentCircle?.id, isDemoMode, deviceId, dismissedSosMemberId, isSirenMuted]);

  // History listener
  useEffect(() => {
    if (!selectedMember || !currentCircle) return;

    if (isDemoMode) {
      return;
    }

    const historyQuery = query(
      collection(db, `devices/${selectedMember.id}/history`),
      orderBy('timestamp', 'desc'),
      limit(40)
    );
    const unsubHistory = onSnapshot(historyQuery, (snap) => {
      const list = snap.docs.map(d => d.data() as HistoryPoint);
      setHistory(list);
    }, () => {});

    return () => unsubHistory();
  }, [selectedMember?.id, currentCircle?.id, isDemoMode]);

  // Tactical Comms (Walkie-Talkie & Live Video) Initialization
  useEffect(() => {
    if (!currentCircle || !deviceId) return;
    const selfId = `${currentCircle.id}_${deviceId}`;
    const myMember = members.find(m => m.id === selfId || m.id === 'demo-you') || {
      id: selfId,
      name: memberName || 'Family Member',
      role: memberRole,
      avatar: memberAvatar,
      lastLat: currentCoords?.lat || 0,
      lastLng: currentCoords?.lng || 0,
      lastUpdated: null,
      gridId: currentCircle.id
    };
    commsManager.initialize(currentCircle.id, myMember, members);
  }, [currentCircle?.id, deviceId, members, memberName, memberRole, memberAvatar, currentCoords]);

  // Firestore Real-Time Signaling Bridge for Comms & Video Calling
  useEffect(() => {
    if (!currentCircle || isDemoMode) return;
    const memberDocId = `${currentCircle.id}_${deviceId}`;
    commsManager.setSignalBridge((payload) => {
      try {
        setDoc(doc(db, 'devices', memberDocId), {
          ...payload,
          lastUpdated: serverTimestamp()
        }, { merge: true }).catch(() => {});
      } catch {}
    });
    return () => {
      commsManager.setSignalBridge(null);
    };
  }, [currentCircle?.id, deviceId, isDemoMode]);

  // Auto-display Comms Modal on incoming call or session activation
  useEffect(() => {
    const unsub = commsManager.subscribe(() => {
      const incoming = commsManager.getIncomingCall();
      const session = commsManager.getSession();
      if (incoming || session) {
        setShowCommsModal(true);
      }
    });
    return () => unsub();
  }, []);

  // Center on Me Handler
  const handleCenterOnMe = () => {
    if (currentCoords) {
      setMapFocusOverride({ lat: currentCoords.lat, lng: currentCoords.lng });
      // Also select self
      const selfMember = members.find(m => 
        m.id === `${currentCircle?.id}_${deviceId}` || 
        m.id === 'demo-you'
      );
      if (selfMember) {
        setSelectedMember(selfMember);
      }
    } else {
      startTracking();
    }
  };

  // Simulated Walk Step (Instant Movement Test)
  const handleSimulateWalk = () => {
    const baseLat = currentCoords?.lat || 19.0760;
    const baseLng = currentCoords?.lng || 72.8777;

    const nextLat = baseLat + (Math.random() - 0.45) * 0.0012;
    const nextLng = baseLng + (Math.random() - 0.45) * 0.0012;

    handlePositionUpdate({
      lat: nextLat,
      lng: nextLng,
      accuracy: 6,
      speed: 1.5,
      heading: null
    });
    setMapFocusOverride({ lat: nextLat, lng: nextLng });
  };

  // Demo Circle Initializer positioned around User's Real Location
  const startDemoCircle = async () => {
    setIsDemoMode(true);

    // Get live position or fallback IP location
    let userLat = currentCoords?.lat || geoService.lastKnownPosition?.lat;
    let userLng = currentCoords?.lng || geoService.lastKnownPosition?.lng;

    if (!userLat || !userLng) {
      const ipPos = await geoService.getFastIpLocation();
      userLat = ipPos ? ipPos.lat : 19.0760;
      userLng = ipPos ? ipPos.lng : 72.8777;
    }

    const demoData = createDemoDataForLocation(userLat, userLng);
    setCurrentCircle(demoData.circle);
    setSafeZones(demoData.safeZones);
    setMembers(demoData.members);
    setSelectedMember(demoData.members[0]);
    setCheckIns(demoData.checkIns);
    setHistory(demoData.history);
    setMemberName(memberName || 'Alex (Me)');
    setMemberRole('Son');
    setMemberAvatar('🧑');
    setCurrentCoords({ lat: userLat, lng: userLng });
    setMapFocusOverride({ lat: userLat, lng: userLng });
    setGpsStatus('active');

    // Simulate smooth movement for Dad
    if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
    demoIntervalRef.current = window.setInterval(() => {
      setMembers(prev =>
        prev.map(m => {
          if (m.id === 'demo-dad') {
            return {
              ...m,
              lastLat: m.lastLat + (Math.random() - 0.5) * 0.0006,
              lastLng: m.lastLng + (Math.random() - 0.5) * 0.0006,
              lastUpdated: new Date()
            };
          }
          return m;
        })
      );
    }, 8000);
  };

  // Saved Circles Helper Methods
  const saveCircleToStorage = useCallback((circle: GridCircle, role?: MemberRole, avatar?: string, name?: string) => {
    setSavedCircles(prev => {
      const existingIndex = prev.findIndex(c => c.id === circle.id);
      const item: SavedCircleSummary = {
        id: circle.id,
        name: circle.name,
        joinedAt: new Date().toISOString(),
        role: role || memberRole,
        avatar: avatar || memberAvatar,
        memberName: name || memberName
      };
      let updated: SavedCircleSummary[];
      if (existingIndex >= 0) {
        updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], ...item };
      } else {
        updated = [item, ...prev];
      }
      try {
        localStorage.setItem(SAVED_CIRCLES_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, [memberRole, memberAvatar, memberName]);

  const handleSelectSavedCircle = useCallback(async (circleId: string) => {
    notificationManager.requestPermission().catch(() => {});
    if (circleId === DEMO_PIN) {
      startDemoCircle();
      return;
    }

    try {
      const circleDoc = await getDoc(doc(db, 'grids', circleId));
      let circleData: GridCircle;

      if (circleDoc.exists()) {
        circleData = circleDoc.data() as GridCircle;
      } else {
        const q = query(collection(db, 'grids'), where('id', '==', circleId));
        const snap = await getDocs(q);
        if (!snap.empty) {
          circleData = snap.docs[0].data() as GridCircle;
        } else {
          const found = savedCircles.find(c => c.id === circleId);
          circleData = {
            id: circleId,
            name: found?.name || `Circle ${circleId}`,
            createdAt: new Date().toISOString(),
            safeZones: []
          };
        }
      }

      localStorage.setItem(CIRCLE_PIN_KEY, circleId);
      localStorage.setItem(CIRCLE_DATA_KEY, JSON.stringify(circleData));
      setCurrentCircle(circleData);
      setIsDemoMode(false);
      saveCircleToStorage(circleData);

      let userLat = currentCoords?.lat || geoService.lastKnownPosition?.lat;
      let userLng = currentCoords?.lng || geoService.lastKnownPosition?.lng;
      if (!userLat || !userLng) {
        const ip = await geoService.getFastIpLocation();
        userLat = ip?.lat || 19.0760;
        userLng = ip?.lng || 72.8777;
      }

      const memberDocId = `${circleId}_${deviceId}`;
      await setDoc(doc(db, 'devices', memberDocId), {
        id: memberDocId,
        name: memberName || 'Family Member',
        role: memberRole,
        avatar: memberAvatar,
        lastLat: userLat,
        lastLng: userLng,
        lastUpdated: serverTimestamp(),
        gridId: circleId,
        status: 'approved',
        battery: currentBattery?.level || 100,
        isCharging: currentBattery?.isCharging || false
      }, { merge: true });

      setMapFocusOverride({ lat: userLat, lng: userLng });
    } catch (err) {
      console.warn('Could not connect to circle:', err);
    }
  }, [deviceId, memberName, memberRole, memberAvatar, currentCoords, currentBattery, savedCircles, saveCircleToStorage]);

  const handleRemoveSavedCircle = useCallback((circleId: string) => {
    setSavedCircles(prev => {
      const updated = prev.filter(c => c.id !== circleId);
      try {
        localStorage.setItem(SAVED_CIRCLES_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
    if (currentCircle?.id === circleId) {
      localStorage.removeItem(CIRCLE_PIN_KEY);
      localStorage.removeItem(CIRCLE_DATA_KEY);
      setCurrentCircle(null);
    }
  }, [currentCircle?.id]);

  // Join Circle Handler (Immediate entrance for anyone with the circle PIN)
  const handleJoinCircle = async (
    pin: string, 
    name: string, 
    role: MemberRole, 
    avatar: string
  ): Promise<boolean> => {
    notificationManager.requestPermission().catch(() => {});
    const cleanPin = pin.trim().toUpperCase();
    if (cleanPin === DEMO_PIN) {
      startDemoCircle();
      return true;
    }

    try {
      const circleDoc = await getDoc(doc(db, 'grids', cleanPin));
      let circleData: GridCircle;

      if (circleDoc.exists()) {
        circleData = circleDoc.data() as GridCircle;
      } else {
        const q = query(collection(db, 'grids'), where('id', '==', cleanPin));
        const snap = await getDocs(q);
        if (snap.empty) return false;
        circleData = snap.docs[0].data() as GridCircle;
      }

      const memberDocId = `${cleanPin}_${deviceId}`;

      let userLat = currentCoords?.lat || geoService.lastKnownPosition?.lat;
      let userLng = currentCoords?.lng || geoService.lastKnownPosition?.lng;
      if (!userLat || !userLng) {
        const ip = await geoService.getFastIpLocation();
        userLat = ip?.lat || 19.0760;
        userLng = ip?.lng || 72.8777;
      }

      // Enter circle immediately with approved status
      localStorage.setItem(MEMBER_NAME_KEY, name);
      localStorage.setItem(MEMBER_ROLE_KEY, role);
      localStorage.setItem(MEMBER_AVATAR_KEY, avatar);
      localStorage.setItem(CIRCLE_PIN_KEY, cleanPin);
      localStorage.setItem(CIRCLE_DATA_KEY, JSON.stringify(circleData));

      setMemberName(name);
      setMemberRole(role);
      setMemberAvatar(avatar);
      setCurrentCircle(circleData);
      setIsDemoMode(false);
      saveCircleToStorage(circleData, role, avatar, name);

      await setDoc(doc(db, 'devices', memberDocId), {
        id: memberDocId,
        name,
        role,
        avatar,
        lastLat: userLat,
        lastLng: userLng,
        lastUpdated: serverTimestamp(),
        gridId: cleanPin,
        status: 'approved',
        battery: currentBattery?.level || 100,
        isCharging: currentBattery?.isCharging || false
      }, { merge: true });

      setMapFocusOverride({ lat: userLat, lng: userLng });
      return true;
    } catch (err) {
      console.error('Failed to join circle:', err);
      return false;
    }
  };

  // Create Circle Handler (Uses live location, NOT San Francisco!)
  const handleCreateCircle = async (
    name: string, 
    pin: string, 
    creatorName: string, 
    role: MemberRole, 
    avatar: string
  ): Promise<boolean> => {
    notificationManager.requestPermission().catch(() => {});
    try {
      // Determine real live coordinates
      let userLat = currentCoords?.lat || geoService.lastKnownPosition?.lat;
      let userLng = currentCoords?.lng || geoService.lastKnownPosition?.lng;
      if (!userLat || !userLng) {
        const ip = await geoService.getFastIpLocation();
        userLat = ip?.lat || 19.0760;
        userLng = ip?.lng || 72.8777;
      }

      const newCircle: GridCircle = {
        id: pin,
        name,
        createdAt: serverTimestamp(),
        ownerId: deviceId,
        safeZones: [
          { id: 'zone-home', name: 'Home', icon: '🏠', lat: userLat, lng: userLng, radius: 250 }
        ]
      };

      await setDoc(doc(db, 'grids', pin), newCircle);

      localStorage.setItem(MEMBER_NAME_KEY, creatorName);
      localStorage.setItem(MEMBER_ROLE_KEY, role);
      localStorage.setItem(MEMBER_AVATAR_KEY, avatar);
      localStorage.setItem(CIRCLE_PIN_KEY, pin);
      localStorage.setItem(CIRCLE_DATA_KEY, JSON.stringify(newCircle));

      setMemberName(creatorName);
      setMemberRole(role);
      setMemberAvatar(avatar);
      setCurrentCircle(newCircle);
      setSafeZones(newCircle.safeZones || []);
      setIsDemoMode(false);
      saveCircleToStorage(newCircle, role, avatar, creatorName);

      const memberDocId = `${pin}_${deviceId}`;
      await setDoc(doc(db, 'devices', memberDocId), {
        id: memberDocId,
        name: creatorName,
        role,
        avatar,
        lastLat: userLat,
        lastLng: userLng,
        lastUpdated: serverTimestamp(),
        gridId: pin,
        status: 'approved',
        battery: currentBattery?.level || 100,
        isCharging: currentBattery?.isCharging || false
      }, { merge: true });

      setMapFocusOverride({ lat: userLat, lng: userLng });
      return true;
    } catch {
      const fallbackCircle: GridCircle = {
        id: pin,
        name,
        createdAt: new Date().toISOString(),
        safeZones: []
      };
      setCurrentCircle(fallbackCircle);
      setIsDemoMode(true);
      return true;
    }
  };

  // Safe zones handlers
  const handleAddSafeZone = async (zone: Omit<SafeZone, 'id'>) => {
    const newZone: SafeZone = { id: `zone_${Date.now()}`, ...zone };
    const updated = [...safeZones, newZone];
    setSafeZones(updated);

    if (currentCircle && !isDemoMode) {
      try {
        await updateDoc(doc(db, 'grids', currentCircle.id), { safeZones: updated });
      } catch {}
    }
  };

  const handleDeleteSafeZone = async (zoneId: string) => {
    const updated = safeZones.filter(z => z.id !== zoneId);
    setSafeZones(updated);

    if (currentCircle && !isDemoMode) {
      try {
        await updateDoc(doc(db, 'grids', currentCircle.id), { safeZones: updated });
      } catch {}
    }
  };

  // SOS handlers
  const handleTriggerSos = async () => {
    if (!currentCircle) return;
    const memberDocId = `${currentCircle.id}_${deviceId}`;
    const myName = memberName || 'Family Member';
    const placeName = currentPlace?.name || '';
    const userLat = currentCoords?.lat || geoService.lastKnownPosition?.lat || 19.0760;
    const userLng = currentCoords?.lng || geoService.lastKnownPosition?.lng || 72.8777;

    setMembers(prev =>
      prev.map(m => m.id === memberDocId || m.id === 'demo-you' ? { ...m, isSosActive: true } : m)
    );
    setCircleActiveSos({
      memberId: memberDocId,
      memberName: myName,
      place: placeName,
      lat: userLat,
      lng: userLng,
      timestamp: Date.now()
    });

    if (!isDemoMode) {
      try {
        // 1. Broadcast active SOS to member device document
        await setDoc(doc(db, 'devices', memberDocId), {
          id: memberDocId,
          name: myName,
          role: memberRole,
          avatar: memberAvatar,
          lastLat: userLat,
          lastLng: userLng,
          lastUpdated: serverTimestamp(),
          gridId: currentCircle.id,
          status: 'approved',
          isSosActive: true,
          sosMessage: placeName ? `Near ${placeName}` : 'Emergency SOS',
          sosTimestamp: serverTimestamp()
        }, { merge: true });

        // 2. Broadcast active SOS to Circle document so ALL circle listeners wake up instantly!
        await setDoc(doc(db, 'grids', currentCircle.id), {
          activeSos: {
            memberId: memberDocId,
            memberName: myName,
            place: placeName,
            lat: userLat,
            lng: userLng,
            timestamp: Date.now()
          }
        }, { merge: true });
      } catch (err) {
        console.warn('Failed to broadcast SOS to Firestore:', err);
      }
    }
    setDismissedSosMemberId(null);
    setIsSirenMuted(false);
    sirenAudio.start();
    notificationManager.showSosAlertNotification(myName, placeName);
    setShowSosModal(true);
  };

  const handleCancelSos = async () => {
    if (!currentCircle) return;
    const memberDocId = `${currentCircle.id}_${deviceId}`;
    const userLat = currentCoords?.lat || geoService.lastKnownPosition?.lat || 19.0760;
    const userLng = currentCoords?.lng || geoService.lastKnownPosition?.lng || 72.8777;

    setMembers(prev =>
      prev.map(m => m.id === memberDocId || m.id === 'demo-you' ? { ...m, isSosActive: false } : m)
    );
    setCircleActiveSos(null);

    if (!isDemoMode) {
      try {
        await setDoc(doc(db, 'devices', memberDocId), { 
          name: memberName || 'Family Member',
          lastLat: userLat,
          lastLng: userLng,
          lastUpdated: serverTimestamp(),
          gridId: currentCircle.id,
          isSosActive: false 
        }, { merge: true });

        await setDoc(doc(db, 'grids', currentCircle.id), { 
          activeSos: null 
        }, { merge: true });
      } catch {}
    }
    sirenAudio.stop();
    setShowSosModal(false);
    setDismissedSosMemberId(null);
    notificationManager.clearSosNotification();
  };

  // Any member or host can mark an emergency SOS as resolved/safe
  const handleResolveSos = async (targetMemberDocId: string) => {
    try {
      setMembers(prev =>
        prev.map(m => m.id === targetMemberDocId || m.id === 'demo-you' ? { ...m, isSosActive: false } : m)
      );
      setCircleActiveSos(null);

      if (!isDemoMode && currentCircle) {
        const targetMember = members.find(m => m.id === targetMemberDocId);
        await setDoc(doc(db, 'devices', targetMemberDocId), { 
          name: targetMember?.name || 'Family Member',
          lastLat: targetMember?.lastLat || 19.0760,
          lastLng: targetMember?.lastLng || 72.8777,
          lastUpdated: serverTimestamp(),
          gridId: currentCircle.id,
          isSosActive: false 
        }, { merge: true });

        await setDoc(doc(db, 'grids', currentCircle.id), { 
          activeSos: null 
        }, { merge: true });
      }
      sirenAudio.stop();
      setShowSosModal(false);
      setDismissedSosMemberId(null);
      notificationManager.clearSosNotification();
    } catch (err) {
      console.warn('Failed to resolve SOS in Firestore:', err);
    }
  };

  const handleDismissSosModal = () => {
    setShowSosModal(false);
    if (activeSosMember) {
      setDismissedSosMemberId(activeSosMember.id);
    }
    sirenAudio.stop();
  };

  // Approve a pending member (Grant permission to enter room)
  const handleApproveMember = async (memberId: string) => {
    try {
      await updateDoc(doc(db, 'devices', memberId), {
        status: 'approved',
        lastUpdated: serverTimestamp()
      });
      setPendingJoinRequests(prev => prev.filter(m => m.id !== memberId));
    } catch (err) {
      console.error('Failed to approve member:', err);
    }
  };

  // Decline a pending member
  const handleDeclineMember = async (memberId: string) => {
    try {
      await deleteDoc(doc(db, 'devices', memberId));
      setPendingJoinRequests(prev => prev.filter(m => m.id !== memberId));
    } catch (err) {
      console.error('Failed to decline member:', err);
    }
  };

  // Delete/Remove member from circle
  const handleDeleteMember = async (memberId: string) => {
    setMembers(prev => prev.filter(m => m.id !== memberId));
    if (selectedMember?.id === memberId) {
      setSelectedMember(null);
    }
    if (!isDemoMode && currentCircle) {
      try {
        await deleteDoc(doc(db, 'devices', memberId));
      } catch (err) {
        console.warn('Could not delete member doc:', err);
      }
    }
  };

  // Check-In handler
  const handleSendCheckIn = async (message: string) => {
    if (!currentCircle) return;
    const cleanMsg = (message || '').trim();
    if (!cleanMsg) return;

    const memberDocId = `${currentCircle.id}_${deviceId}`;
    const checkInId = `chk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const sender = memberName || 'Family Member';
    const avatar = memberAvatar || '👤';

    const userLat = currentCoords?.lat || geoService.lastKnownPosition?.lat || currentMember?.lastLat || 19.0760;
    const userLng = currentCoords?.lng || geoService.lastKnownPosition?.lng || currentMember?.lastLng || 72.8777;

    const newCheckIn: CheckInPing = {
      id: checkInId,
      deviceId: memberDocId,
      memberName: sender,
      avatar,
      message: cleanMsg,
      timestamp: new Date().toISOString(),
      lat: userLat,
      lng: userLng
    };

    if (currentPlace?.name) {
      newCheckIn.place = currentPlace.name;
    }

    const sanitizedNew = sanitizeCheckIn(newCheckIn);

    // Collect all past check-ins for this member from doc & local state
    const currentMemberDoc = members.find(m => m.id === memberDocId);
    const existingFromDoc = Array.isArray(currentMemberDoc?.recentCheckIns) ? currentMemberDoc.recentCheckIns : [];
    const existingFromState = (checkIns || []).filter(c => c.deviceId === memberDocId);

    const existingMap = new Map<string, CheckInPing>();
    for (const c of [...existingFromDoc, ...existingFromState]) {
      if (c && c.id && c.id !== checkInId && !String(c.id).startsWith('auto_') && !String(c.message).includes('Arrived at') && !String(c.message).includes('Left ')) {
        existingMap.set(c.id, sanitizeCheckIn(c));
      }
    }
    const updatedMemberFeed = [sanitizedNew, ...Array.from(existingMap.values())].slice(0, 25);

    // Optimistically update full circle feed state
    setCheckIns(prev => {
      const merged = [sanitizedNew, ...prev.filter(c => c.id !== checkInId)].slice(0, 50);
      try { localStorage.setItem('nexus_cached_checkins', JSON.stringify(merged)); } catch {}
      return merged;
    });

    // Mark as seen so sender isn't alerted for their own post
    seenAlertedCheckInIds.current.add(checkInId);

    // Notification visual feedback on sender device
    notificationManager.showImportantNotification(`💬 ${sender} (You)`, cleanMsg);

    if (!isDemoMode) {
      try {
        // Save directly to devices collection (100% permitted by security rules)
        await setDoc(doc(db, 'devices', memberDocId), {
          id: memberDocId,
          name: sender,
          role: memberRole,
          avatar,
          lastLat: userLat,
          lastLng: userLng,
          lastUpdated: serverTimestamp(),
          gridId: currentCircle.id,
          status: 'approved',
          latestCheckIn: sanitizedNew,
          recentCheckIns: updatedMemberFeed
        }, { merge: true });
      } catch (err) {
        console.error('Failed to sync check-in to Firestore devices:', err);
      }
    }
    setShowCheckInModal(false);
  };

  // Activity Feed Item Click Handler -> Centering & Selecting Member on Map
  const handleFeedItemClick = (item: CheckInPing) => {
    // 1. Flexible match by exact ID, suffix, or trimmed lower-case name
    const poster = members.find(m => 
      m.id === item.deviceId ||
      (item.deviceId && m.id.endsWith(item.deviceId)) ||
      (item.deviceId && item.deviceId.endsWith(m.id)) ||
      (m.name && item.memberName && m.name.trim().toLowerCase() === item.memberName.trim().toLowerCase())
    );

    if (poster && typeof poster.lastLat === 'number' && typeof poster.lastLng === 'number') {
      setSelectedMember(poster);
      setMapFocusOverride({ lat: poster.lastLat, lng: poster.lastLng });
    } else if (typeof item.lat === 'number' && typeof item.lng === 'number') {
      setMapFocusOverride({ lat: item.lat, lng: item.lng });
      if (poster) setSelectedMember(poster);
    } else if (poster) {
      setSelectedMember(poster);
    }

    // Collapse sheet on mobile and switch to members map view
    setMobileSheetExpanded(false);
    setMobileTab('members');
  };

  // Clear history handler
  const handleClearHistory = async () => {
    if (!currentCircle) return;
    const memberDocId = `${currentCircle.id}_${deviceId}`;

    if (!isDemoMode) {
      try {
        const snap = await getDocs(collection(db, `devices/${memberDocId}/history`));
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        setHistory([]);
      } catch {}
    } else {
      setHistory([]);
    }
  };

  // Profile update
  const handleUpdateProfile = async (name: string, role: MemberRole, avatar: string) => {
    setMemberName(name);
    setMemberRole(role);
    setMemberAvatar(avatar);
    localStorage.setItem(MEMBER_NAME_KEY, name);
    localStorage.setItem(MEMBER_ROLE_KEY, role);
    localStorage.setItem(MEMBER_AVATAR_KEY, avatar);

    if (currentCircle && !isDemoMode) {
      const memberDocId = `${currentCircle.id}_${deviceId}`;
      try {
        await updateDoc(doc(db, 'devices', memberDocId), { name, role, avatar });
      } catch {}
    }
    setShowSettingsModal(false);
  };

  // Leave circle
  const handleLeaveCircle = () => {
    stopTracking();
    localStorage.removeItem(CIRCLE_PIN_KEY);
    localStorage.removeItem(CIRCLE_DATA_KEY);
    setCurrentCircle(null);
    setIsDemoMode(false);
    setShowSettingsModal(false);
  };

  const handleCopyCode = async () => {
    if (!currentCircle) return;
    try {
      await navigator.clipboard.writeText(currentCircle.id);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  const circleSosMember: DeviceMember | null = circleActiveSos ? {
    id: circleActiveSos.memberId,
    name: circleActiveSos.memberName || 'Family Member',
    role: 'Family',
    avatar: '🚨',
    lastLat: Number(circleActiveSos.lat) || 19.0760,
    lastLng: Number(circleActiveSos.lng) || 72.8777,
    lastUpdated: null,
    gridId: currentCircle?.id || '',
    currentPlace: circleActiveSos.place,
    isSosActive: true
  } : null;

  const activeSosMember = members.find(m => m.isSosActive) || circleSosMember || null;
  const isCurrentUserSos = activeSosMember?.id === `${currentCircle?.id}_${deviceId}` || (isDemoMode && activeSosMember?.id === 'demo-you');

  // Real-time Emergency SOS Audio Siren & Status Bar Notification Effect
  useEffect(() => {
    if (activeSosMember) {
      const isDismissed = dismissedSosMemberId === activeSosMember.id;
      if (!isDismissed) {
        setShowSosModal(true);
        // Play emergency siren if not muted
        if (!isSirenMuted) {
          sirenAudio.start();
        } else {
          sirenAudio.stop();
        }
      } else {
        // User dismissed the alert screen, keep siren silent!
        sirenAudio.stop();
      }

      // Pop high-priority notification in notification bar
      if (lastAlertedSosId.current !== activeSosMember.id) {
        lastAlertedSosId.current = activeSosMember.id;
        notificationManager.showSosAlertNotification(
          activeSosMember.name,
          activeSosMember.currentPlace
        );
      }
    } else {
      // No active SOS in circle -> silence siren and clear states
      sirenAudio.stop();
      lastAlertedSosId.current = null;
      setDismissedSosMemberId(null);
      setIsSirenMuted(false);
      notificationManager.clearSosNotification();
    }
  }, [activeSosMember?.id, activeSosMember?.name, activeSosMember?.currentPlace, isSirenMuted, dismissedSosMemberId]);

  if (!currentCircle) {
    return (
      <>
        <OnboardingModal
          onJoinCircle={handleJoinCircle}
          onCreateCircle={handleCreateCircle}
          onStartDemo={startDemoCircle}
          defaultName={memberName}
          defaultRole={memberRole}
          defaultAvatar={memberAvatar}
          savedCircles={savedCircles}
          onSelectSavedCircle={handleSelectSavedCircle}
          onRemoveSavedCircle={handleRemoveSavedCircle}
          onOpenInstallModal={() => setShowInstallModal(true)}
        />
        <InstallAppModal
          isOpen={showInstallModal}
          onClose={() => setShowInstallModal(false)}
          deferredPrompt={deferredPrompt}
          onInstallSuccess={() => setIsAppInstalled(true)}
        />
      </>
    );
  }

  const currentMember = members.find(m => 
    m.id === `${currentCircle.id}_${deviceId}` || 
    m.id === 'demo-you'
  ) || null;

  // Strictly enforce that who created the room first is the owner of that room
  const isCircleOwner = Boolean(
    currentCircle && (
      (currentCircle.ownerId && currentCircle.ownerId === deviceId) ||
      (!currentCircle.ownerId && members.length > 0 && members[0]?.id === `${currentCircle.id}_${deviceId}`)
    )
  );

  // Active map focus target
  const mapFocusTarget = mapFocusOverride || (selectedMember ? { lat: selectedMember.lastLat, lng: selectedMember.lastLng } : currentCoords);

  return (
    <div className="h-[100dvh] overflow-hidden relative lg:h-auto lg:min-h-screen lg:overflow-visible flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans">

      
      {/* 🟢 Status Bar Notification Enable Banner */}
      {typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default' && (
        <div className="fixed top-3 left-3 right-3 sm:left-auto sm:right-4 sm:w-88 z-50 bg-slate-900/95 dark:bg-slate-800/95 text-white backdrop-blur-xl border border-blue-500/40 rounded-2xl p-2.5 shadow-2xl flex items-center justify-between gap-3 text-xs animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
            <div className="truncate">
              <span className="font-bold text-white block">Keep Active in Background</span>
              <span className="text-[10px] text-slate-300">Show in notification bar like other apps</span>
            </div>
          </div>
          <button
            onClick={async () => {
              await notificationManager.requestPermission();
              await notificationManager.showLiveTrackingNotification(currentCircle?.name);
            }}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md shrink-0 transition-all"
          >
            Allow
          </button>
        </div>
      )}

      {/* 🔔 Host Join Request Approval Banner (Floating at Top) */}
      {pendingJoinRequests.length > 0 && isCircleOwner && (
        <div className="fixed top-14 left-3 right-3 sm:left-auto sm:right-4 sm:w-96 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-2 border-blue-500 rounded-3xl p-3.5 shadow-2xl space-y-2 animate-bounce-subtle">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-black text-blue-600 dark:text-blue-400">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>Permission Request ({pendingJoinRequests.length})</span>
            </div>
            <span className="text-[10px] text-slate-400 font-semibold">Only Host Can Allow</span>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto">
            {pendingJoinRequests.map(req => (
              <div key={req.id} className="p-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl p-1 bg-white dark:bg-slate-700 rounded-xl shadow-xs shrink-0">
                    {req.avatar || '👤'}
                  </span>
                  <div className="truncate">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {req.name}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Wants to join as {req.role || 'Member'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleApproveMember(req.id)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1 transition-all"
                    title="Allow entry"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Allow</span>
                  </button>
                  <button
                    onClick={() => handleDeclineMember(req.id)}
                    className="p-1.5 bg-slate-200 hover:bg-red-100 text-slate-600 hover:text-red-600 dark:bg-slate-700 dark:hover:bg-red-950 rounded-xl transition-all"
                    title="Decline request"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 📱 MOBILE NATIVE EXPERIENCE (Find My / Life360 style) */}
      
      {/* 1. Mobile Floating Frosted Glass Header */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-30 pointer-events-none p-3 pt-safe flex items-center justify-between gap-2">
        {/* Left: Circle Name Pill & Switcher */}
        <div className="pointer-events-auto relative">
          <div className="flex items-center gap-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-lg">
            <button
              onClick={() => setShowCircleSwitcher(!showCircleSwitcher)}
              className="flex items-center gap-1.5 text-xs font-black text-slate-800 dark:text-slate-100 max-w-[130px] truncate"
            >
              <Users className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="truncate">{currentCircle.name}</span>
                  {isCircleOwner && (
                    <span className="text-amber-500 text-xs font-bold shrink-0" title="You created this circle (Owner)">👑</span>
                  )}
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${showCircleSwitcher ? 'rotate-180' : ''}`} />
            </button>

            <span className="text-slate-300 dark:text-slate-700">|</span>

            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1 text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300 active:scale-95"
              title="Copy PIN"
            >
              <span>{currentCircle.id}</span>
              {copiedCode ? (
                <Check className="w-3 h-3 text-emerald-500" />
              ) : (
                <Copy className="w-3 h-3 text-slate-400" />
              )}
            </button>
          </div>

          {/* Circle Switcher Dropdown (Mobile) */}
          {showCircleSwitcher && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowCircleSwitcher(false)}
              />
              <div className="absolute top-full left-0 mt-2 z-50 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-2 text-xs">
                <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between font-bold text-slate-400 text-[10px] uppercase">
                  <span>Your Circles</span>
                  <span>{savedCircles.length}</span>
                </div>
                <div className="max-h-48 overflow-y-auto py-1 space-y-1">
                  {savedCircles.map(c => {
                    const isActive = c.id === currentCircle.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => {
                          setShowCircleSwitcher(false);
                          if (!isActive) handleSelectSavedCircle(c.id);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left ${
                          isActive
                            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="truncate">
                          <div className="truncate font-semibold">{c.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">PIN: {c.id}</div>
                        </div>
                        {isActive && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => {
                    setShowCircleSwitcher(false);
                    setCurrentCircle(null);
                  }}
                  className="w-full mt-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Join / Create Circle</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right: GPS Pill, SOS Button, Settings */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          {/* Live GPS Status Pill */}
          <button
            onClick={handleCenterOnMe}
            className={`px-2.5 py-1.5 rounded-2xl text-[11px] font-bold flex items-center gap-1.5 shadow-md backdrop-blur-md border ${
              gpsStatus === 'active'
                ? 'bg-emerald-500/90 text-white border-emerald-400/80 shadow-emerald-500/20'
                : gpsStatus === 'approximate'
                  ? 'bg-blue-500/90 text-white border-blue-400/80'
                  : gpsStatus === 'searching'
                    ? 'bg-amber-500/90 text-white border-amber-400/80 animate-pulse'
                    : 'bg-slate-800/90 text-slate-200 border-slate-700'
            }`}
            title="GPS Status — Tap to center on you"
          >
            <Radio className={`w-3 h-3 ${isTracking ? 'animate-pulse' : ''}`} />
            <span>{gpsStatus === 'active' ? 'Live' : gpsStatus === 'approximate' ? 'City' : 'GPS'}</span>
          </button>

          {/* Tactical Walkie-Talkie & Video Comms */}
          <button
            onClick={() => {
              setMobileTab('radio');
              setMobileSheetExpanded(true);
            }}
            className="px-2.5 py-1.5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
            title="Tactical Walkie-Talkie & Video Call"
          >
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>Walkie-Talkie</span>
          </button>

          {/* SOS Emergency Button */}
          <button
            onClick={() => setShowSosModal(true)}
            className="px-3 py-1.5 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-95 text-white text-[11px] font-black flex items-center gap-1 shadow-lg shadow-red-500/30 transition-all"
            title="Emergency SOS"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>SOS</span>
          </button>

          {/* Settings Icon */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="w-8 h-8 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-lg flex items-center justify-center text-slate-700 dark:text-slate-300 active:scale-95 transition-transform"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Mobile SOS Alert Banner (if emergency active) */}
      {activeSosMember && (
        <div className="lg:hidden fixed top-14 inset-x-3 z-30 bg-red-600/95 text-white backdrop-blur-md rounded-2xl p-2.5 shadow-xl flex items-center justify-between text-xs font-bold animate-pulse">
          <div className="flex items-center gap-1.5 truncate min-w-0">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span className="truncate">SOS: {activeSosMember.name} needs help!</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-1">
            <button
              onClick={() => setIsSirenMuted(prev => !prev)}
              className="p-1 px-1.5 rounded-lg bg-red-800 text-white text-[10px]"
              title={isSirenMuted ? 'Unmute Siren Alarm' : 'Silence Siren'}
            >
              {isSirenMuted ? '🔇' : '🔊'}
            </button>
            <button
              onClick={() => setShowSosModal(true)}
              className="px-2 py-0.5 rounded-lg bg-white text-red-600 font-black text-[11px] shadow-sm"
            >
              Alert
            </button>
            <button
              onClick={() => setNavigatingMember(activeSosMember)}
              className="underline text-white font-bold text-[11px]"
            >
              Nav &rarr;
            </button>
          </div>
        </div>
      )}

      {/* 3. Mobile Floating Action Buttons (Center on me, Awake, Step GPS) */}
      <div className={`lg:hidden fixed right-3.5 z-20 flex-col gap-2.5 pointer-events-auto transition-all duration-300 ${
        mobileSheetExpanded ? 'hidden' : selectedMember ? 'bottom-[270px] flex' : 'bottom-48 flex'
      }`}>
        {/* Center on Me */}
        <button
          onClick={handleCenterOnMe}
          className="w-11 h-11 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-center text-blue-600 dark:text-blue-400 active:scale-90 transition-transform"
          title="Center Map on Me"
        >
          <Crosshair className="w-5 h-5" />
        </button>

        {/* 24/7 Background Tracking FAB */}
        <button
          onClick={toggleBackgroundTracking}
          className={`w-11 h-11 rounded-2xl backdrop-blur-md shadow-xl border flex items-center justify-center active:scale-90 transition-all ${
            isBackgroundActive
              ? 'bg-emerald-500 text-white border-emerald-400 shadow-emerald-500/30'
              : 'bg-white/95 dark:bg-slate-900/95 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-800'
          }`}
          title={isBackgroundActive ? '24/7 Background Tracking ACTIVE (Pocket & Screen Lock)' : 'Enable 24/7 Background GPS Tracking'}
        >
          <Radio className={`w-5 h-5 ${isBackgroundActive ? 'animate-pulse text-white' : 'text-slate-500'}`} />
        </button>

        {/* Step GPS Simulator */}
        <button
          onClick={handleSimulateWalk}
          className="w-11 h-11 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 active:scale-90 transition-transform"
          title="Step GPS Simulator"
        >
          <LocateFixed className="w-5 h-5" />
        </button>
      </div>

      {/* 4. Mobile Sliding Bottom Sheet & App Dock */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-30">
        {/* Backdrop overlay when sheet is expanded */}
        {mobileSheetExpanded && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs z-20 transition-opacity"
            onClick={() => setMobileSheetExpanded(false)}
          />
        )}

        {/* The Bottom Sheet Container */}
        <div
          className={`relative z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200/90 dark:border-slate-800 rounded-t-[28px] shadow-[0_-12px_40px_rgba(0,0,0,0.18)] transition-all duration-300 ease-out flex flex-col ${
            mobileSheetExpanded ? 'h-[80dvh]' : 'h-auto'
          }`}
        >
          {/* Gesture-Enabled Drag Handle Bar (Touch / Swipe / Tap) */}
          <div
            onClick={() => setMobileSheetExpanded(prev => !prev)}
            onTouchStart={handleSheetTouchStart}
            onTouchMove={handleSheetTouchMove}
            onTouchEnd={handleSheetTouchEnd}
            className="pt-3 pb-2 px-6 cursor-pointer flex flex-col items-center justify-center select-none active:opacity-60 transition-opacity touch-none"
            title="Swipe up for timeline & feed, swipe down to collapse"
          >
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full mb-1 transition-all" />
            <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
              {mobileSheetExpanded ? (
                <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-bold">
                  <ChevronDown className="w-3.5 h-3.5" /> Tap or swipe down for Map
                </span>
              ) : (
                <span>{selectedMember ? 'Tap or swipe up for details' : 'Swipe up for timeline & feed'}</span>
              )}
            </div>
          </div>

          {/* PEEK MODE: Selected Member Card, Horizontal Avatars & Quick Actions */}
          {!mobileSheetExpanded && (
            <div className="px-3 pb-1 flex flex-col gap-2">
              {/* Selected Member Detail Banner (Nested inside sheet - NEVER hides!) */}
              {selectedMember && (
                <div className="p-2.5 rounded-2xl bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200/90 dark:border-slate-700/80 flex items-center justify-between gap-3 shadow-xs animate-fade-in">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative shrink-0">
                      <span className="text-2xl p-1 bg-white dark:bg-slate-700 rounded-xl block shadow-xs">
                        {selectedMember.avatar || '👤'}
                      </span>
                      <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-800"></div>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-extrabold text-xs text-slate-900 dark:text-white truncate">
                          {selectedMember.id === currentMember?.id ? `${selectedMember.name} (You)` : selectedMember.name}
                        </h4>
                        {selectedMember.role && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold shrink-0">
                            {selectedMember.role}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1 mt-0.5">
                        {selectedMember.battery !== undefined && (
                          <span className="font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                            🔋 {selectedMember.battery}% •
                          </span>
                        )}
                        <span className="truncate">
                          {selectedMember.currentPlace ? `At ${selectedMember.currentPlace}` : 'Moving'}
                        </span>
                        <span>•</span>
                        <span className="shrink-0">{formatRelativeTime(selectedMember.lastUpdated)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setNavigatingMember(selectedMember)}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition-all"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Directions</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMember(null);
                      }}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
                      title="Deselect"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Horizontal Avatars Rail */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                {members.map(member => {
                  const isSelected = selectedMember?.id === member.id;
                  const isCurrent = member.id === currentMember?.id;
                  return (
                    <button
                      key={member.id}
                      onClick={() => {
                        setMapFocusOverride({ lat: member.lastLat, lng: member.lastLng });
                        setSelectedMember(member);
                      }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl whitespace-nowrap border transition-all shrink-0 active:scale-95 ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20'
                          : 'bg-slate-100/80 dark:bg-slate-800/80 border-slate-200/70 dark:border-slate-700/70 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <span className="text-lg">{member.avatar || '👤'}</span>
                      <div className="text-left leading-tight">
                        <div className="text-xs font-bold truncate max-w-[85px]">
                          {isCurrent ? `${member.name} (You)` : member.name}
                        </div>
                        <div className={`text-[10px] ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                          {member.battery !== undefined ? `🔋 ${member.battery}%` : 'Online'}
                        </div>
                      </div>
                    </button>
                  );
                })}

                {/* Invite Chip */}
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-2xl border border-dashed border-blue-400 dark:border-blue-600 text-blue-600 dark:text-blue-400 text-xs font-bold whitespace-nowrap bg-blue-50/50 dark:bg-blue-950/30 shrink-0 active:scale-95"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>+ Invite Family</span>
                </button>
              </div>

              {/* Quick Actions Row */}
              <div className="flex items-center justify-between px-2 pt-1 border-t border-slate-100 dark:border-slate-800/80 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                <button
                  onClick={() => setShowCheckInModal(true)}
                  className="flex items-center gap-1.5 py-1 px-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Check-in</span>
                </button>

                <button
                  onClick={() => setShowSafeZonesModal(true)}
                  className="flex items-center gap-1.5 py-1 px-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Safe Places</span>
                </button>

                {!isAppInstalled && (
                  <button
                    onClick={() => setShowInstallModal(true)}
                    className="flex items-center gap-1.5 py-1 px-2.5 rounded-xl text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 font-bold transition-colors"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Install App</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* EXPANDED MODE: Full Tabs & Content */}
          {mobileSheetExpanded && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Sub-tabs bar */}
              <div className="flex bg-slate-100 dark:bg-slate-800/90 p-1 mx-4 my-1 rounded-2xl shrink-0">
                <button
                  onClick={() => setMobileTab('members')}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    mobileTab === 'members'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Members ({members.length})
                </button>
                <button
                  onClick={() => setMobileTab('radio')}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                    mobileTab === 'radio'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-blue-600 dark:text-blue-400 font-extrabold'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5 animate-pulse" />
                  <span>Radio</span>
                </button>
                <button
                  onClick={() => setMobileTab('history')}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    mobileTab === 'history'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Timeline
                </button>
                <button
                  onClick={() => setMobileTab('checkins')}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    mobileTab === 'checkins'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Feed ({checkIns.length})
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2.5">
                {mobileTab === 'members' && (
                  <>

              {/* Pending Join Requests Box */}
              {pendingJoinRequests.length > 0 && isCircleOwner && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-200/80 dark:border-amber-800/80 mb-2">
                  <div className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                      <span>Waiting for Host Permission ({pendingJoinRequests.length})</span>
                    </div>
                    <span className="text-[10px] text-amber-600 font-semibold">Pending</span>
                  </div>
                  <div className="space-y-1.5">
                    {pendingJoinRequests.map(req => (
                      <div key={req.id} className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-amber-100 dark:border-amber-900/40 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-base">{req.avatar || '👤'}</span>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{req.name}</span>
                          <span className="text-[10px] text-slate-400 font-semibold">({req.role})</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleApproveMember(req.id)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold"
                          >
                            Allow
                          </button>
                          <button
                            onClick={() => handleDeclineMember(req.id)}
                            className="px-2 py-1 bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-600 rounded-lg text-[11px] font-bold"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

                    <div className="p-3 bg-blue-50/70 dark:bg-blue-950/40 rounded-2xl border border-blue-100 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-200 flex items-center justify-between">
                      <div>
                        <span className="font-bold">Circle PIN:</span>
                        <span className="font-mono font-bold ml-1.5">{currentCircle.id}</span>
                      </div>
                      <button
                        onClick={handleCopyCode}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold"
                      >
                        {copiedCode ? 'Copied' : 'Share Invite'}
                      </button>
                    </div>

                    {members.map(member => (
                      <FamilyMemberCard
                        key={member.id}
                        member={member}
                        currentUser={currentMember}
                        isSelected={selectedMember?.id === member.id}
                        onSelect={(m) => {
                          setMapFocusOverride(null);
                          setSelectedMember(m);
                          setMobileSheetExpanded(false);
                        }}
                        onNavigate={(m) => setNavigatingMember(m)}
                        onDelete={(id) => handleDeleteMember(id)}
                        onOpenRadio={(m) => {
                          commsManager.openRadio(m);
                          setShowCommsModal(true);
                        }}
                        onStartVideoCall={(m) => {
                          commsManager.startVideoCall(m);
                          setShowCommsModal(true);
                        }}
                      />
                    ))}
                  </>
                )}

                {mobileTab === 'radio' && (
                  <div className="h-[460px]">
                    <WalkieTalkieStation
                      currentMember={currentMember || {
                        id: `${currentCircle.id}_${deviceId}`,
                        name: memberName || 'Family Member',
                        role: memberRole,
                        avatar: memberAvatar,
                        lastLat: currentCoords?.lat || 0,
                        lastLng: currentCoords?.lng || 0,
                        lastUpdated: null,
                        gridId: currentCircle.id
                      }}
                      circleName={currentCircle.name}
                      circlePin={currentCircle.id}
                      members={members}
                      onStartVideoCall={(m) => {
                        commsManager.startVideoCall(m);
                        setShowCommsModal(true);
                      }}
                    />
                  </div>
                )}

                {mobileTab === 'history' && (
                  selectedMember ? (
                    <TripTimeline
                      member={selectedMember}
                      history={history}
                      onClearHistory={handleClearHistory}
                      isCurrentUser={selectedMember.id === `${currentCircle.id}_${deviceId}` || selectedMember.id === 'demo-you'}
                    />
                  ) : (
                    <div className="text-center py-10 px-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl text-xs text-slate-500">
                      Tap any family member above to view their live journey timeline!
                    </div>
                  )
                )}

                {mobileTab === 'checkins' && (
                  <div className="space-y-3">
                    {/* Emergency SOS Banner in Feed */}
                    {activeSosMember && (
                      <div className="p-3 bg-rose-500/15 border-2 border-rose-500/40 rounded-2xl flex items-center justify-between gap-2 text-rose-600 dark:text-rose-400 animate-pulse">
                        <div className="flex items-center gap-2">
                          <ShieldAlert className="w-5 h-5 shrink-0 text-rose-600" />
                          <div>
                            <div className="text-xs font-black">🚨 EMERGENCY SOS ACTIVE</div>
                            <div className="text-[11px] text-slate-700 dark:text-slate-300">
                              {activeSosMember.name} needs help {activeSosMember.currentPlace ? `near ${activeSosMember.currentPlace}` : ''}!
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedMember(activeSosMember);
                            setShowSosModal(true);
                          }}
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer"
                        >
                          View
                        </button>
                      </div>
                    )}

                    {/* Inline Quick Post Form */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (inlineFeedMsg.trim()) {
                          handleSendCheckIn(inlineFeedMsg);
                          setInlineFeedMsg('');
                        }
                      }}
                      className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 flex flex-col gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg shrink-0">{memberAvatar || '👤'}</span>
                        <input
                          type="text"
                          value={inlineFeedMsg}
                          onChange={(e) => setInlineFeedMsg(e.target.value)}
                          placeholder="Post a quick update or check-in..."
                          className="flex-1 bg-white dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          type="submit"
                          disabled={!inlineFeedMsg.trim()}
                          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition-all cursor-pointer active:scale-95 shrink-0"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Post</span>
                        </button>
                      </div>

                      {/* 1-Tap Presets */}
                      <div className="flex gap-1.5 overflow-x-auto pb-0.5 text-[11px]">
                        {['🏡 Arrived Home', '🚗 Heading out', '👍 All good', '🪫 Low battery'].map((msg, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handleSendCheckIn(msg)}
                            className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 whitespace-nowrap transition-colors cursor-pointer active:scale-95 text-[10px] font-medium"
                          >
                            {msg}
                          </button>
                        ))}
                      </div>
                    </form>

                    {/* Live Circle Members Summary (Clickable to Map) */}
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 rounded-2xl">
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center justify-between">
                        <span>Live Family Status</span>
                        <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">Tap member to locate ↗</span>
                      </div>
                      <div className="space-y-1.5">
                        {members.map(m => (
                          <div 
                            key={m.id} 
                            onClick={() => {
                              setSelectedMember(m);
                              setMapFocusOverride({ lat: m.lastLat, lng: m.lastLng });
                              setMobileSheetExpanded(false);
                            }}
                            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 text-xs hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/40 transition-all cursor-pointer"
                            title={`Click to view ${m.name} on map`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span className="text-sm">{m.avatar || '👤'}</span>
                              <span className="font-bold text-slate-800 dark:text-slate-100 truncate">{m.name}</span>
                              <span className="text-[11px] text-slate-500 truncate">
                                {m.currentPlace ? `🏡 ${m.currentPlace}` : (m.speed && m.speed > 3 ? `🚗 Moving (${Math.round(m.speed)} km/h)` : '🟢 Stationary')}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-slate-400">
                              {m.battery !== undefined && (
                                <span className={m.battery <= 20 ? 'text-rose-500 font-bold' : ''}>
                                  {m.battery <= 20 ? '🪫' : '🔋'}{m.battery}%
                                </span>
                              )}
                              <span>•</span>
                              <span>{formatRelativeTime(m.lastUpdated)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Family Updates & Check-ins Feed List */}
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
                      <span className="font-bold text-xs text-slate-700 dark:text-slate-300">Recent Activity</span>
                      <button
                        onClick={() => setShowCheckInModal(true)}
                        className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>All Presets</span>
                      </button>
                    </div>

                    {checkIns.length === 0 ? (
                      <div className="text-center py-6 text-xs text-slate-400">
                        No custom check-ins yet. Write an update above to share with the family!
                      </div>
                    ) : (
                      checkIns.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => handleFeedItemClick(item)}
                          className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-start gap-3 hover:border-indigo-400 dark:hover:border-indigo-600 hover:bg-indigo-50/30 dark:hover:bg-slate-800/80 transition-all cursor-pointer active:scale-[0.99] group shadow-xs"
                          title="Click to view sender on map"
                        >
                          <span className="text-xl p-1 bg-white dark:bg-slate-800 rounded-xl shadow-xs group-hover:scale-105 transition-transform">
                            {item.avatar || '👤'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                {item.memberName}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {formatRelativeTime(item.timestamp)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                              {item.message}
                            </p>
                            <div className="mt-1.5 flex items-center justify-between gap-1 flex-wrap">
                              {item.place ? (
                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                  <MapPin className="w-3 h-3" />
                                  {item.place}
                                </span>
                              ) : <span />}
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                <Navigation className="w-2.5 h-2.5" />
                                <span>Locate on Map</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BOTTOM DOCK BAR (Fixed navigation across Map, Family, Timeline, Feed, Places) */}
          <div className="border-t border-slate-200/80 dark:border-slate-800/80 px-2 py-1.5 flex items-center justify-around bg-white/95 dark:bg-slate-900/95 backdrop-blur-md pb-safe">
            {/* Map Tab */}
            <button
              onClick={() => setMobileSheetExpanded(false)}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
                !mobileSheetExpanded
                  ? 'text-blue-600 dark:text-blue-400 font-bold scale-105'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
              }`}
            >
              <MapIcon className="w-4 h-4" />
              <span className="text-[10px]">Map</span>
            </button>

            {/* Family Tab */}
            <button
              onClick={() => {
                setMobileTab('members');
                setMobileSheetExpanded(true);
              }}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl relative transition-all ${
                mobileSheetExpanded && mobileTab === 'members'
                  ? 'text-blue-600 dark:text-blue-400 font-bold scale-105'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
              }`}
            >
              <Users className="w-4 h-4" />
              <span className="text-[10px]">Family</span>
              {members.length > 0 && (
                <span className="absolute top-0 right-2 w-3.5 h-3.5 bg-blue-600 text-white rounded-full text-[8px] flex items-center justify-center font-bold">
                  {members.length}
                </span>
              )}
            </button>

            {/* Walkie-Talkie Tab */}
            <button
              onClick={() => {
                setMobileTab('radio');
                setMobileSheetExpanded(true);
              }}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
                mobileSheetExpanded && mobileTab === 'radio'
                  ? 'text-blue-600 dark:text-blue-400 font-bold scale-105'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
              }`}
            >
              <Radio className="w-4 h-4 text-blue-500 animate-pulse" />
              <span className="text-[10px] font-bold">Radio</span>
            </button>

            {/* Timeline Tab */}
            <button
              onClick={() => {
                setMobileTab('history');
                setMobileSheetExpanded(true);
              }}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
                mobileSheetExpanded && mobileTab === 'history'
                  ? 'text-blue-600 dark:text-blue-400 font-bold scale-105'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
              }`}
            >
              <History className="w-4 h-4" />
              <span className="text-[10px]">Timeline</span>
            </button>

            {/* Feed Tab */}
            <button
              onClick={() => {
                setMobileTab('checkins');
                setMobileSheetExpanded(true);
              }}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl relative transition-all ${
                mobileSheetExpanded && mobileTab === 'checkins'
                  ? 'text-blue-600 dark:text-blue-400 font-bold scale-105'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span className="text-[10px]">Feed</span>
              {checkIns.length > 0 && (
                <span className="absolute top-0 right-2 w-3.5 h-3.5 bg-indigo-600 text-white rounded-full text-[8px] flex items-center justify-center font-bold">
                  {checkIns.length}
                </span>
              )}
            </button>

            {/* Safe Places */}
            <button
              onClick={() => setShowSafeZonesModal(true)}
              className="flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 transition-all"
            >
              <MapPin className="w-4 h-4" />
              <span className="text-[10px]">Places</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top Application Header */}
      <header className="hidden lg:block sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border-b border-slate-200/90 dark:border-slate-800 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Left: Circle Name & Code with Dropdown Switcher */}
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-xs shadow-blue-500/20 shrink-0">
                <Users className="w-5 h-5" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowCircleSwitcher(!showCircleSwitcher)}
                    className="font-extrabold text-slate-900 dark:text-white text-base leading-tight hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1.5 transition-colors group text-left"
                    title="Click to Switch Circle"
                  >
                    <span>{currentCircle.name}</span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-transform ${showCircleSwitcher ? 'rotate-180' : ''}`} />
                  </button>
                  {isDemoMode && (
                    <span className="text-[10px] bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Demo
                    </span>
                  )}
                </div>

                {/* Circle PIN Pill */}
                <button
                  onClick={handleCopyCode}
                  className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 group"
                  title="Copy Circle Code"
                >
                  <span>Code:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200 tracking-wider">
                    {currentCircle.id}
                  </span>
                  {copiedCode ? (
                    <Check className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <Copy className="w-3 h-3 text-slate-400 group-hover:text-slate-600" />
                  )}
                </button>
              </div>
            </div>

            {/* Circle Switcher Dropdown */}
            {showCircleSwitcher && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowCircleSwitcher(false)}
                />
                <div className="absolute top-full left-0 mt-2 z-50 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden p-2 text-xs">
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">
                    <span>Your Circles</span>
                    <span>{savedCircles.length} Saved</span>
                  </div>

                  <div className="max-h-56 overflow-y-auto py-1 space-y-1">
                    {savedCircles.map(c => {
                      const isActive = c.id === currentCircle.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => {
                            setShowCircleSwitcher(false);
                            if (!isActive) handleSelectSavedCircle(c.id);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all text-left ${
                            isActive
                              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <div className="truncate font-semibold">{c.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">PIN: {c.id}</div>
                          </div>
                          {isActive && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-1">
                    <button
                      onClick={() => {
                        setShowCircleSwitcher(false);
                        setCurrentCircle(null);
                      }}
                      className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Join or Create Circle</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* 1-Tap Install App Button */}
            {!isAppInstalled && (
              <button
                onClick={() => setShowInstallModal(true)}
                className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs shadow-blue-500/20 active:scale-95"
                title="Install as an App on Phone"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Install App</span>
                <span className="sm:hidden">App</span>
              </button>
            )}

            {/* Keep Screen On / Trip Mode Toggle */}
            <button
              onClick={toggleWakeLock}
              className={`p-2 sm:px-3 sm:py-2 rounded-2xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                isWakeLockActive
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
              }`}
              title={isWakeLockActive ? 'Screen Stay Awake Active (Trip Mode)' : 'Keep Screen On during trip'}
            >
              <Sun className={`w-3.5 h-3.5 ${isWakeLockActive ? 'text-amber-500 animate-spin-slow' : 'text-slate-400'}`} />
              <span className="hidden sm:inline">{isWakeLockActive ? 'Awake' : 'Trip Wake'}</span>
            </button>

            {/* Center on Me Button */}
            <button
              onClick={handleCenterOnMe}
              className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-2xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
              title="Center Map on My Live Location"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Center on Me</span>
            </button>

            {/* GPS Status Indicator Toggle */}
            <button
              onClick={() => {
                if (isTracking) stopTracking();
                else startTracking();
              }}
              className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs ${
                gpsStatus === 'active'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : gpsStatus === 'approximate'
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${isTracking ? 'animate-pulse' : ''}`} />
              <span className="hidden sm:inline">
                {gpsStatus === 'active' ? 'GPS Locked' : gpsStatus === 'approximate' ? 'City Live' : 'Locate Me'}
              </span>
              <span className="sm:hidden">
                {gpsStatus === 'active' ? 'Live' : 'GPS'}
              </span>
            </button>

            {/* Step Simulator Button */}
            <button
              onClick={handleSimulateWalk}
              className="p-2 sm:px-3 sm:py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Simulate Step Forward"
            >
              <LocateFixed className="w-4 h-4 text-emerald-500" />
              <span className="hidden sm:inline">Step GPS</span>
            </button>

            {/* Check-ins */}
            <button
              onClick={() => setShowCheckInModal(true)}
              className="p-2 sm:px-3 sm:py-2 rounded-2xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Family Check-in"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Check-in</span>
            </button>

            {/* Safe Places */}
            <button
              onClick={() => setShowSafeZonesModal(true)}
              className="p-2 sm:px-3 sm:py-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Safe Places"
            >
              <MapPin className="w-4 h-4" />
              <span className="hidden sm:inline">Places</span>
            </button>

            {/* Tactical Comms (Walkie-Talkie / Video) */}
            <button
              onClick={() => setActiveTab('radio')}
              className="p-2 sm:px-3 sm:py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs active:scale-95 cursor-pointer"
              title="Tactical Walkie-Talkie & Video Comms"
            >
              <Radio className="w-4 h-4 animate-pulse" />
              <span className="hidden sm:inline">Walkie-Talkie</span>
            </button>

            {/* SOS Emergency */}
            <button
              onClick={() => setShowSosModal(true)}
              className="p-2 sm:px-3.5 sm:py-2 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs active:scale-95"
              title="Emergency SOS"
            >
              <ShieldAlert className="w-4 h-4" />
              <span className="hidden sm:inline">SOS</span>
            </button>

            {/* Settings */}
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2.5 rounded-2xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Circle Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Live GPS Feedback Strip */}
      <div className={`hidden lg:flex px-4 py-1.5 text-xs font-semibold items-center justify-between border-b ${
        gpsStatus === 'active' 
          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
          : gpsStatus === 'approximate'
            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900'
            : gpsStatus === 'searching'
              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-900'
              : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900'
      }`}>
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 animate-pulse" />
          <span>
            {gpsStatus === 'active' && `📍 Live GPS Active • Coordinates: ${currentCoords?.lat.toFixed(5)}, ${currentCoords?.lng.toFixed(5)} (±${gpsAccuracy}m)`}
            {gpsStatus === 'approximate' && `🌐 City Location Active: ${currentCoords?.lat.toFixed(4)}, ${currentCoords?.lng.toFixed(4)}`}
            {gpsStatus === 'searching' && (gpsMessage || 'Acquiring satellite lock...')}
            {(gpsStatus === 'denied' || gpsStatus === 'unavailable' || gpsStatus === 'insecure') && (gpsMessage || 'GPS location permission needed. Allow in browser address bar.')}
          </span>
        </div>

        <button
          onClick={handleCenterOnMe}
          className="underline text-[11px] font-bold hover:opacity-80"
        >
          {currentCoords ? 'Jump to My Location &rarr;' : 'Locate Me Now &rarr;'}
        </button>
      </div>

      {/* Emergency Active Banner */}
      {activeSosMember && (
        <div className="hidden lg:flex bg-red-600 text-white py-2 px-4 text-center font-bold text-xs items-center justify-between gap-3 shadow-xs animate-pulse">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" />
            <span>EMERGENCY SOS: {activeSosMember.name} needs assistance!</span>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsSirenMuted(prev => !prev)}
              className="p-1 px-2.5 rounded-lg bg-red-800 text-white text-xs font-bold"
            >
              {isSirenMuted ? '🔇 Unmute Siren' : '🔊 Mute Siren'}
            </button>
            <button
              onClick={() => setShowSosModal(true)}
              className="px-2.5 py-1 rounded-lg bg-white text-red-600 font-black text-xs shadow-sm"
            >
              Open Alert Screen
            </button>
            <button
              onClick={() => setNavigatingMember(activeSosMember)}
              className="underline hover:text-red-100"
            >
              Directions &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <main className="flex-1 w-full lg:max-w-7xl lg:mx-auto lg:p-5 lg:grid lg:grid-cols-12 lg:gap-5">
        {/* Left Column: Interactive Map (8 cols on desktop) */}
        <div className="fixed inset-0 z-0 lg:static lg:inset-auto lg:z-auto lg:col-span-8 flex flex-col lg:gap-3.5">
          {/* Selected Member Quick Info Card */}
          {selectedMember && (
            <div className="hidden lg:flex p-3 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <span className="text-2xl p-1.5 bg-slate-100 dark:bg-slate-800 rounded-2xl shadow-inner">
                  {selectedMember.avatar || '👤'}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-sm text-slate-900 dark:text-white leading-tight">
                      {selectedMember.name}
                    </h3>
                    {selectedMember.role && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                        {selectedMember.role}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                    {selectedMember.currentPlace ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        At {selectedMember.currentPlace}
                      </span>
                    ) : (
                      <span>Moving • {selectedMember.lastLat.toFixed(4)}, {selectedMember.lastLng.toFixed(4)}</span>
                    )}
                    <span>•</span>
                    <span>{formatRelativeTime(selectedMember.lastUpdated)}</span>
                  </div>
                </div>
              </div>

              {/* Weather & Fast Navigation */}
              <div className="flex items-center gap-2">
                {weather && (
                  <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <CloudSun className="w-3.5 h-3.5 text-amber-500" />
                    <span>{weather.temp}°C {weather.condition}</span>
                  </div>
                )}

                <button
                  onClick={() => setNavigatingMember(selectedMember)}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Navigate</span>
                </button>
              </div>
            </div>
          )}

          {/* Optimized Leaflet Map */}
          <div className="w-full h-full lg:flex-1 lg:min-h-[580px] lg:rounded-3xl overflow-hidden shadow-xs">
            <Map
              members={members}
              selectedMember={selectedMember}
              onSelectMember={(m) => {
                setMapFocusOverride(null);
                setSelectedMember(m);
              }}
              onNavigateMember={(m) => setNavigatingMember(m)}
              safeZones={safeZones}
              history={history}
              currentUserId={currentMember?.id || `${currentCircle.id}_${deviceId}`}
              focusLocation={mapFocusTarget}
              theme={theme}
              currentCoords={currentCoords}
              accuracy={gpsAccuracy}
              currentUser={currentMember}
              onOpenRadio={(m) => {
                commsManager.openRadio(m);
                setShowCommsModal(true);
              }}
              onStartVideoCall={(m) => {
                commsManager.startVideoCall(m);
                setShowCommsModal(true);
              }}
            />
          </div>
        </div>

        {/* Right Column: Family Members, Timeline, Feed (4 cols) */}
        <div className="hidden lg:flex lg:col-span-4 flex-col gap-3.5">
          {/* Navigation Sub-tabs */}
          <div className="flex bg-slate-200/70 dark:bg-slate-800/80 p-1 rounded-2xl">
            <button
              onClick={() => setActiveTab('members')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'members' || activeTab === 'map'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Members ({members.length})
            </button>
            <button
              onClick={() => setActiveTab('radio')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                activeTab === 'radio'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-blue-600 dark:text-blue-400 hover:text-blue-700 font-extrabold'
              }`}
            >
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>Walkie-Talkie</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'history'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Timeline
            </button>
            <button
              onClick={() => setActiveTab('checkins')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'checkins'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Feed ({checkIns.length})
            </button>
          </div>

          {/* Dedicated Walkie-Talkie Station Tab */}
          {activeTab === 'radio' && (
            <WalkieTalkieStation
              currentMember={currentMember || {
                id: `${currentCircle.id}_${deviceId}`,
                name: memberName || 'Family Member',
                role: memberRole,
                avatar: memberAvatar,
                lastLat: currentCoords?.lat || 0,
                lastLng: currentCoords?.lng || 0,
                lastUpdated: null,
                gridId: currentCircle.id
              }}
              circleName={currentCircle.name}
              circlePin={currentCircle.id}
              members={members}
              onStartVideoCall={(m) => {
                commsManager.startVideoCall(m);
                setShowCommsModal(true);
              }}
            />
          )}

          {/* Members List */}
          {(activeTab === 'members' || activeTab === 'map') && (
            <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto max-h-[580px] pr-1">

              {/* Pending Join Requests Box */}
              {pendingJoinRequests.length > 0 && isCircleOwner && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-200/80 dark:border-amber-800/80 mb-2">
                  <div className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                      <span>Waiting for Host Permission ({pendingJoinRequests.length})</span>
                    </div>
                    <span className="text-[10px] text-amber-600 font-semibold">Pending</span>
                  </div>
                  <div className="space-y-1.5">
                    {pendingJoinRequests.map(req => (
                      <div key={req.id} className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-amber-100 dark:border-amber-900/40 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-base">{req.avatar || '👤'}</span>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{req.name}</span>
                          <span className="text-[10px] text-slate-400 font-semibold">({req.role})</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleApproveMember(req.id)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold"
                          >
                            Allow
                          </button>
                          <button
                            onClick={() => handleDeclineMember(req.id)}
                            className="px-2 py-1 bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-600 rounded-lg text-[11px] font-bold"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {members.length === 0 ? (
                <div className="text-center py-10 px-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
                  <div className="text-3xl mb-2">👨‍👩‍👧‍👦</div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                    No Members Detected
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                    Share your Circle Code ({currentCircle.id}) with family members to start live tracking!
                  </p>
                  <button
                    onClick={handleCopyCode}
                    className="mt-3.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-xs"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share Circle Invite</span>
                  </button>
                </div>
              ) : (
                members.map(member => (
                  <FamilyMemberCard
                    key={member.id}
                    member={member}
                    currentUser={currentMember}
                    isSelected={selectedMember?.id === member.id}
                    onSelect={(m) => {
                      setMapFocusOverride(null);
                      setSelectedMember(m);
                    }}
                    onNavigate={(m) => setNavigatingMember(m)}
                    onDelete={(id) => handleDeleteMember(id)}
                    onOpenRadio={(m) => {
                      commsManager.openRadio(m);
                      setShowCommsModal(true);
                    }}
                    onStartVideoCall={(m) => {
                      commsManager.startVideoCall(m);
                      setShowCommsModal(true);
                    }}
                  />
                ))
              )}

              {/* Add member invite tip */}
              <div className="p-3 bg-blue-50/60 dark:bg-blue-950/40 rounded-2xl border border-blue-100 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-200 flex items-center justify-between mt-1">
                <div>
                  <span className="font-bold">Circle Code:</span>
                  <span className="font-mono font-bold ml-1">{currentCircle.id}</span>
                </div>
                <button
                  onClick={handleCopyCode}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-semibold"
                >
                  {copiedCode ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          {/* Timeline */}
          {activeTab === 'history' && selectedMember && (
            <div className="flex-1 max-h-[580px]">
              <TripTimeline
                member={selectedMember}
                history={history}
                onClearHistory={handleClearHistory}
                isCurrentUser={selectedMember.id === `${currentCircle.id}_${deviceId}` || selectedMember.id === 'demo-you'}
              />
            </div>
          )}

          {/* Check-ins Feed */}
          {activeTab === 'checkins' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 flex flex-col h-full max-h-[580px] shadow-xs select-text">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  Family Activity Feed
                </h4>
                <button
                  onClick={() => setShowCheckInModal(true)}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>All Presets</span>
                </button>
              </div>

              {/* Inline Fast Post Box */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (inlineFeedMsg.trim()) {
                    handleSendCheckIn(inlineFeedMsg);
                    setInlineFeedMsg('');
                  }
                }}
                className="mt-3 p-3 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 flex flex-col gap-2 shrink-0 select-text"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg shrink-0">{memberAvatar || '👤'}</span>
                  <input
                    type="text"
                    value={inlineFeedMsg}
                    onChange={(e) => setInlineFeedMsg(e.target.value)}
                    placeholder="Post a status update or check-in to family..."
                    className="flex-1 bg-white dark:bg-slate-800 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 select-text"
                  />
                  <button
                    type="submit"
                    disabled={!inlineFeedMsg.trim()}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition-all cursor-pointer active:scale-95 shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Post</span>
                  </button>
                </div>

                {/* 1-Tap Presets */}
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 text-[11px]">
                  {['🏡 Arrived Home', '🚗 Heading out', '👍 All good', '🪫 Low battery'].map((msg, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSendCheckIn(msg)}
                      className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 whitespace-nowrap transition-colors cursor-pointer active:scale-95 text-[10px] font-medium"
                    >
                      {msg}
                    </button>
                  ))}
                </div>
              </form>

              <div className="flex-1 overflow-y-auto mt-2 space-y-3 pr-1">
                {/* Emergency SOS Banner in Feed */}
                {activeSosMember && (
                  <div className="p-3 bg-rose-500/15 border-2 border-rose-500/40 rounded-2xl flex items-center justify-between gap-2 text-rose-600 dark:text-rose-400 animate-pulse">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-5 h-5 shrink-0 text-rose-600" />
                      <div>
                        <div className="text-xs font-black">🚨 EMERGENCY SOS ACTIVE</div>
                        <div className="text-[11px] text-slate-700 dark:text-slate-300">
                          {activeSosMember.name} needs help {activeSosMember.currentPlace ? `near ${activeSosMember.currentPlace}` : ''}!
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedMember(activeSosMember);
                        setShowSosModal(true);
                      }}
                      className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer"
                    >
                      View
                    </button>
                  </div>
                )}

                {/* Live Circle Members Summary (Clickable to Map) */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 rounded-2xl">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center justify-between">
                    <span>Live Family Status</span>
                    <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">Click member to locate ↗</span>
                  </div>
                  <div className="space-y-1.5">
                    {members.map(m => (
                      <div 
                        key={m.id} 
                        onClick={() => {
                          setSelectedMember(m);
                          setMapFocusOverride({ lat: m.lastLat, lng: m.lastLng });
                        }}
                        className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 text-xs hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/40 transition-all cursor-pointer"
                        title={`Click to view ${m.name} on map`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-sm">{m.avatar || '👤'}</span>
                          <span className="font-bold text-slate-800 dark:text-slate-100 truncate">{m.name}</span>
                          <span className="text-[11px] text-slate-500 truncate">
                            {m.currentPlace ? `🏡 ${m.currentPlace}` : (m.speed && m.speed > 3 ? `🚗 Moving (${Math.round(m.speed)} km/h)` : '🟢 Stationary')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-slate-400">
                          {m.battery !== undefined && (
                            <span className={m.battery <= 20 ? 'text-rose-500 font-bold' : ''}>
                              {m.battery <= 20 ? '🪫' : '🔋'}{m.battery}%
                            </span>
                          )}
                          <span>•</span>
                          <span>{formatRelativeTime(m.lastUpdated)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Check-ins Feed List (Clickable to Map) */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Recent Check-in Messages</span>
                  {checkIns.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-400">
                      No custom check-in messages yet. Use the quick box above to post!
                    </div>
                  ) : (
                    checkIns.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleFeedItemClick(item)}
                        className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-start gap-3 hover:border-indigo-400 dark:hover:border-indigo-600 hover:bg-indigo-50/30 dark:hover:bg-slate-800/80 transition-all cursor-pointer active:scale-[0.99] group shadow-xs"
                        title="Click to view sender on map"
                      >
                        <span className="text-xl p-1 bg-white dark:bg-slate-800 rounded-xl shadow-xs group-hover:scale-105 transition-transform">
                          {item.avatar || '👤'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                              {item.memberName}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {formatRelativeTime(item.timestamp)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                            {item.message}
                          </p>
                          <div className="mt-1.5 flex items-center justify-between gap-1 flex-wrap">
                            {item.place ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                <MapPin className="w-3 h-3" />
                                {item.place}
                              </span>
                            ) : <span />}
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                              <Navigation className="w-2.5 h-2.5" />
                              <span>Locate on Map</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Lightweight Fast Navigation Modal */}
      <NavigationModal
        isOpen={Boolean(navigatingMember)}
        onClose={() => setNavigatingMember(null)}
        targetMember={navigatingMember}
        currentCoords={currentCoords}
        onFocusMap={(m) => {
          setMapFocusOverride({ lat: m.lastLat, lng: m.lastLng });
          setSelectedMember(m);
          setNavigatingMember(null);
        }}
      />

      {/* Safe Zones Modal */}
      <SafeZonesModal
        isOpen={showSafeZonesModal}
        onClose={() => setShowSafeZonesModal(false)}
        safeZones={safeZones}
        onAddZone={handleAddSafeZone}
        onDeleteZone={handleDeleteSafeZone}
        currentCoords={currentCoords}
      />

      {/* SOS Modal */}
      <SosModal
        isOpen={showSosModal}
        onClose={handleDismissSosModal}
        onTriggerSos={handleTriggerSos}
        onCancelSos={handleCancelSos}
        onResolveSos={handleResolveSos}
        activeSosMember={activeSosMember}
        isCurrentUserSos={isCurrentUserSos}
        isSirenMuted={isSirenMuted}
        onToggleMuteSiren={() => setIsSirenMuted(prev => !prev)}
      />

      {/* Check In Modal */}
      <CheckInModal
        isOpen={showCheckInModal}
        onClose={() => setShowCheckInModal(false)}
        onSendCheckIn={handleSendCheckIn}
        checkIns={checkIns}
        memberName={memberName}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        circleName={currentCircle.name}
        circlePin={currentCircle.id}
        memberName={memberName}
        memberRole={memberRole}
        memberAvatar={memberAvatar}
        isSharingPaused={isSharingPaused}
        theme={theme}
        onUpdateProfile={handleUpdateProfile}
        onToggleSharingPaused={async (paused) => {
          setIsSharingPaused(paused);
        }}
        onThemeChange={(newTheme) => setTheme(newTheme)}
        onLeaveCircle={handleLeaveCircle}
        savedCircles={savedCircles}
        onSelectSavedCircle={handleSelectSavedCircle}
        onOpenInstallModal={() => setShowInstallModal(true)}
      />

      {/* Install Mobile App Modal */}
      <InstallAppModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
        deferredPrompt={deferredPrompt}
        onInstallSuccess={() => setIsAppInstalled(true)}
      />

      {/* Tactical Comms Modal (Walkie-Talkie & Live Video Call) */}
      {currentCircle && (
        <CommsModal
          isOpen={showCommsModal}
          onClose={() => setShowCommsModal(false)}
          currentMember={currentMember || {
            id: `${currentCircle.id}_${deviceId}`,
            name: memberName || 'Family Member',
            role: memberRole,
            avatar: memberAvatar,
            lastLat: currentCoords?.lat || 0,
            lastLng: currentCoords?.lng || 0,
            lastUpdated: null,
            gridId: currentCircle.id
          }}
          circleName={currentCircle.name}
          members={members}
        />
      )}
    </div>
  );
}
