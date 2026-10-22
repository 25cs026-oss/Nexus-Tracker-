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

import { 
  Users, 
  MapPin, 
  ShieldAlert, 
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
  X,
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
  const [mobileTab, setMobileTab] = useState<'members' | 'history' | 'checkins'>('members');

  // Live Data
  const [members, setMembers] = useState<DeviceMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<DeviceMember | null>(null);
  const [safeZones, setSafeZones] = useState<SafeZone[]>([]);
  const [checkIns, setCheckIns] = useState<CheckInPing[]>([]);
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
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
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
  }, [handlePositionUpdate, handleStatusUpdate, currentCoords, currentCircle, isDemoMode, isSharingPaused, safeZones, deviceId, currentSpeed]);

  const stopTracking = useCallback(() => {
    geoService.stopTracking();
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
    const circleDocRef = doc(db, 'grids', currentCircle.id);
    const unsubCircle = onSnapshot(circleDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as GridCircle;
        if (data.safeZones) setSafeZones(data.safeZones);
      }
    }, () => {});

    // Devices in circle listener
    const devicesQuery = query(collection(db, 'devices'), where('gridId', '==', currentCircle.id));
    const unsubDevices = onSnapshot(devicesQuery, (snap) => {
      const rawList = snap.docs.map(d => ({ id: d.id, ...d.data() } as DeviceMember));
      
      const memberDocId = `${currentCircle.id}_${deviceId}`;

      // Deduplicate: If multiple docs in Firestore share the same ID or name, keep only ONE clean item
      const seenIds = new Set<string>();
      const seenNames = new Set<string>();
      const list: DeviceMember[] = [];

      // Give priority to the current user's document
      const selfDoc = rawList.find(m => m.id === memberDocId || (m.name && m.name === memberName));
      if (selfDoc) {
        seenIds.add(selfDoc.id);
        if (selfDoc.name) seenNames.add(selfDoc.name);
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
        if (memberName) seenNames.add(memberName);
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

      for (const m of rawList) {
        if (m.id === memberDocId || (m.name && m.name === memberName)) continue;
        if (seenIds.has(m.id)) continue;
        if (m.name && seenNames.has(m.name)) continue;

        seenIds.add(m.id);
        if (m.name) seenNames.add(m.name);
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
    }, () => {});

    // Check-ins listener
    const checkInsQuery = query(
      collection(db, `grids/${currentCircle.id}/checkins`),
      orderBy('timestamp', 'desc'),
      limit(20)
    );
    const unsubCheckIns = onSnapshot(checkInsQuery, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CheckInPing));
      setCheckIns(list);
    }, () => {});

    return () => {
      unsubCircle();
      unsubDevices();
      unsubCheckIns();
    };
  }, [currentCircle?.id, isDemoMode, deviceId]);

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

  // Join Circle Handler (Uses live location, NOT San Francisco!)
  const handleJoinCircle = async (
    pin: string, 
    name: string, 
    role: MemberRole, 
    avatar: string
  ): Promise<boolean> => {
    if (pin === DEMO_PIN) {
      startDemoCircle();
      return true;
    }

    try {
      const circleDoc = await getDoc(doc(db, 'grids', pin));
      let circleData: GridCircle;

      if (circleDoc.exists()) {
        circleData = circleDoc.data() as GridCircle;
      } else {
        const q = query(collection(db, 'grids'), where('id', '==', pin));
        const snap = await getDocs(q);
        if (snap.empty) return false;
        circleData = snap.docs[0].data() as GridCircle;
      }

      localStorage.setItem(MEMBER_NAME_KEY, name);
      localStorage.setItem(MEMBER_ROLE_KEY, role);
      localStorage.setItem(MEMBER_AVATAR_KEY, avatar);
      localStorage.setItem(CIRCLE_PIN_KEY, pin);
      localStorage.setItem(CIRCLE_DATA_KEY, JSON.stringify(circleData));

      setMemberName(name);
      setMemberRole(role);
      setMemberAvatar(avatar);
      setCurrentCircle(circleData);
      setIsDemoMode(false);
      saveCircleToStorage(circleData, role, avatar, name);

      // Determine real live coordinates
      let userLat = currentCoords?.lat || geoService.lastKnownPosition?.lat;
      let userLng = currentCoords?.lng || geoService.lastKnownPosition?.lng;
      if (!userLat || !userLng) {
        const ip = await geoService.getFastIpLocation();
        userLat = ip?.lat || 19.0760;
        userLng = ip?.lng || 72.8777;
      }

      const memberDocId = `${pin}_${deviceId}`;
      await setDoc(doc(db, 'devices', memberDocId), {
        id: memberDocId,
        name,
        role,
        avatar,
        lastLat: userLat,
        lastLng: userLng,
        lastUpdated: serverTimestamp(),
        gridId: pin,
        battery: currentBattery?.level || 100,
        isCharging: currentBattery?.isCharging || false
      }, { merge: true });

      setMapFocusOverride({ lat: userLat, lng: userLng });
      return true;
    } catch {
      startDemoCircle();
      return true;
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

    if (!isDemoMode) {
      try {
        await updateDoc(doc(db, 'devices', memberDocId), {
          isSosActive: true,
          sosTimestamp: serverTimestamp()
        });
      } catch {}
    } else {
      setMembers(prev =>
        prev.map(m => m.id === memberDocId || m.id === 'demo-you' ? { ...m, isSosActive: true } : m)
      );
    }
    setShowSosModal(false);
  };

  const handleCancelSos = async () => {
    if (!currentCircle) return;
    const memberDocId = `${currentCircle.id}_${deviceId}`;

    if (!isDemoMode) {
      try {
        await updateDoc(doc(db, 'devices', memberDocId), { isSosActive: false });
      } catch {}
    } else {
      setMembers(prev =>
        prev.map(m => m.id === memberDocId || m.id === 'demo-you' ? { ...m, isSosActive: false } : m)
      );
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
    const memberDocId = `${currentCircle.id}_${deviceId}`;

    const newCheckIn: CheckInPing = {
      id: `chk_${Date.now()}`,
      deviceId: memberDocId,
      memberName: memberName || 'Member',
      avatar: memberAvatar,
      message,
      timestamp: isDemoMode ? new Date() : serverTimestamp()
    };

    if (!isDemoMode) {
      try {
        await addDoc(collection(db, `grids/${currentCircle.id}/checkins`), newCheckIn);
      } catch {}
    } else {
      setCheckIns(prev => [newCheckIn, ...prev]);
    }
    setShowCheckInModal(false);
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

  const activeSosMember = members.find(m => m.isSosActive) || null;
  const isCurrentUserSos = activeSosMember?.id === `${currentCircle?.id}_${deviceId}` || (isDemoMode && activeSosMember?.id === 'demo-you');

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

  // Active map focus target
  const mapFocusTarget = mapFocusOverride || (selectedMember ? { lat: selectedMember.lastLat, lng: selectedMember.lastLng } : currentCoords);

  return (
    <div className="h-[100dvh] overflow-hidden relative lg:h-auto lg:min-h-screen lg:overflow-visible flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans select-none">

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
          <div className="flex items-center gap-2 truncate">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span className="truncate">SOS: {activeSosMember.name} needs help!</span>
          </div>
          <button
            onClick={() => setNavigatingMember(activeSosMember)}
            className="underline ml-2 text-white shrink-0 font-bold"
          >
            Navigate &rarr;
          </button>
        </div>
      )}

      {/* 3. Mobile Floating Action Buttons (Center on me, Awake, Step GPS) */}
      <div className={`lg:hidden fixed right-3.5 z-20 flex flex-col gap-2.5 pointer-events-auto transition-all duration-300 ${
        mobileSheetExpanded ? 'bottom-[80dvh]' : selectedMember ? 'bottom-56' : 'bottom-44'
      }`}>
        {/* Center on Me */}
        <button
          onClick={handleCenterOnMe}
          className="w-11 h-11 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-center text-blue-600 dark:text-blue-400 active:scale-90 transition-transform"
          title="Center Map on Me"
        >
          <Crosshair className="w-5 h-5" />
        </button>

        {/* Trip Mode / Keep Screen Awake */}
        <button
          onClick={toggleWakeLock}
          className={`w-11 h-11 rounded-2xl backdrop-blur-md shadow-xl border flex items-center justify-center active:scale-90 transition-all ${
            isWakeLockActive
              ? 'bg-amber-500 text-white border-amber-400 shadow-amber-500/30'
              : 'bg-white/95 dark:bg-slate-900/95 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-800'
          }`}
          title={isWakeLockActive ? 'Awake Active (Screen Stays On)' : 'Trip Mode (Keep Screen Awake)'}
        >
          <Sun className={`w-5 h-5 ${isWakeLockActive ? 'animate-spin-slow' : ''}`} />
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

      {/* 4. Mobile Floating Selected Member Card */}
      {selectedMember && !mobileSheetExpanded && (
        <div className="lg:hidden fixed left-3.5 right-3.5 bottom-36 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl p-3 shadow-2xl border border-slate-200/90 dark:border-slate-800 flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-2xl p-1.5 bg-slate-100 dark:bg-slate-800 rounded-2xl shrink-0">
              {selectedMember.avatar || '👤'}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h4 className="font-extrabold text-xs text-slate-900 dark:text-white truncate">
                  {selectedMember.name}
                </h4>
                {selectedMember.role && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold shrink-0">
                    {selectedMember.role}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {selectedMember.currentPlace ? `At ${selectedMember.currentPlace}` : `Moving`} • {formatRelativeTime(selectedMember.lastUpdated)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setNavigatingMember(selectedMember)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs active:scale-95"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Go</span>
            </button>
            <button
              onClick={() => setSelectedMember(null)}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 5. Mobile Sliding Bottom Sheet & App Dock */}
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
          className={`relative z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200/90 dark:border-slate-800 rounded-t-3xl shadow-[0_-10px_35px_rgba(0,0,0,0.18)] transition-all duration-300 ease-out flex flex-col ${
            mobileSheetExpanded ? 'h-[78dvh]' : 'h-auto'
          }`}
        >
          {/* Drag Handle Bar */}
          <div
            onClick={() => setMobileSheetExpanded(!mobileSheetExpanded)}
            className="pt-2 pb-1.5 cursor-pointer flex flex-col items-center justify-center active:opacity-70 select-none"
          >
            <div className="w-10 h-1 bg-slate-300 dark:bg-slate-600 rounded-full mb-1" />
            {mobileSheetExpanded && (
              <div className="w-full px-4 flex items-center justify-between text-xs text-slate-500 font-bold">
                <span className="text-slate-800 dark:text-white font-extrabold text-sm">
                  {mobileTab === 'members' ? 'Family Members' : mobileTab === 'history' ? 'Trip Timeline' : 'Check-ins Feed'}
                </span>
                <span className="text-blue-600 dark:text-blue-400 flex items-center gap-0.5 text-xs font-semibold">
                  <ChevronDown className="w-3.5 h-3.5" />
                  Map
                </span>
              </div>
            )}
          </div>

          {/* PEEK MODE: Horizontal Member Avatars & Quick Actions */}
          {!mobileSheetExpanded && (
            <div className="px-3 pb-1 flex flex-col gap-2">
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
                  className="flex items-center gap-1.5 py-1 px-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Check-in</span>
                </button>

                <button
                  onClick={() => setShowSafeZonesModal(true)}
                  className="flex items-center gap-1.5 py-1 px-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Safe Places</span>
                </button>

                {!isAppInstalled && (
                  <button
                    onClick={() => setShowInstallModal(true)}
                    className="flex items-center gap-1.5 py-1 px-2 rounded-xl text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 font-bold transition-colors"
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
                      />
                    ))}
                  </>
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
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                      <span className="font-bold text-xs text-slate-700 dark:text-slate-300">Family Updates</span>
                      <button
                        onClick={() => setShowCheckInModal(true)}
                        className="px-3 py-1 bg-indigo-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Post</span>
                      </button>
                    </div>

                    {checkIns.length === 0 ? (
                      <div className="text-center py-8 text-xs text-slate-400">
                        No recent check-in updates. Tap "Post" to send an update!
                      </div>
                    ) : (
                      checkIns.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-start gap-3"
                        >
                          <span className="text-xl p-1 bg-white dark:bg-slate-800 rounded-xl">
                            {item.avatar || '👤'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                {item.memberName}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {formatRelativeTime(item.timestamp)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                              {item.message}
                            </p>
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
        <div className="hidden lg:flex bg-red-600 text-white py-2 px-4 text-center font-bold text-xs items-center justify-center gap-2 shadow-xs animate-pulse">
          <ShieldAlert className="w-4 h-4" />
          <span>EMERGENCY SOS: {activeSosMember.name} needs assistance!</span>
          <button
            onClick={() => setNavigatingMember(activeSosMember)}
            className="underline ml-2 hover:text-red-100"
          >
            Open Navigation &rarr;
          </button>
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

          {/* Members List */}
          {(activeTab === 'members' || activeTab === 'map') && (
            <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto max-h-[580px] pr-1">
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
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 flex flex-col h-full max-h-[580px] shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  Family Activity Feed
                </h4>
                <button
                  onClick={() => setShowCheckInModal(true)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Post</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto mt-3 space-y-2.5 pr-1">
                {checkIns.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    No recent check-in updates. Tap "Post" to send an update!
                  </div>
                ) : (
                  checkIns.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-start gap-3"
                    >
                      <span className="text-xl p-1 bg-white dark:bg-slate-800 rounded-xl shadow-xs">
                        {item.avatar || '👤'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                            {item.memberName}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {formatRelativeTime(item.timestamp)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                          {item.message}
                        </p>
                      </div>
                    </div>
                  ))
                )}
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
        onClose={() => setShowSosModal(false)}
        onTriggerSos={handleTriggerSos}
        onCancelSos={handleCancelSos}
        activeSosMember={activeSosMember}
        isCurrentUserSos={isCurrentUserSos}
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
    </div>
  );
}
