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
  ActiveTab
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
  Timestamp, 
  serverTimestamp, 
  deleteDoc, 
  writeBatch 
} from './firebase';
import { 
  findCurrentPlace, 
  getLiveBattery, 
  formatRelativeTime, 
  getDirectionsUrl 
} from './utils/geo';
import { 
  DEMO_PIN, 
  DEMO_CIRCLE, 
  DEMO_MEMBERS, 
  DEMO_CHECKINS, 
  DEMO_HISTORY 
} from './utils/demoData';

import { Map } from './components/Map';
import { FamilyMemberCard } from './components/FamilyMemberCard';
import { SafeZonesModal } from './components/SafeZonesModal';
import { SosModal } from './components/SosModal';
import { CheckInModal } from './components/CheckInModal';
import { SettingsModal } from './components/SettingsModal';
import { TripTimeline } from './components/TripTimeline';
import { OnboardingModal } from './components/OnboardingModal';

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
  History as HistoryIcon,
  Plus,
  RefreshCw,
  Sun,
  Moon,
  Sparkles,
  Wifi,
  WifiOff
} from 'lucide-react';

const DEVICE_ID_KEY = 'nexus_device_id';
const CIRCLE_PIN_KEY = 'nexus_circle_pin';
const CIRCLE_DATA_KEY = 'nexus_circle_data';
const MEMBER_NAME_KEY = 'nexus_member_name';
const MEMBER_ROLE_KEY = 'nexus_member_role';
const MEMBER_AVATAR_KEY = 'nexus_member_avatar';
const THEME_KEY = 'nexus_theme';

// Helper to generate or retrieve persistent device ID
const getDeviceId = () => {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `usr_${Math.random().toString(36).substring(2, 10)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
};

export default function App() {
  // --- Persistent User Profile ---
  const [deviceId] = useState<string>(getDeviceId);
  const [memberName, setMemberName] = useState<string>(() => localStorage.getItem(MEMBER_NAME_KEY) || '');
  const [memberRole, setMemberRole] = useState<MemberRole>(() => (localStorage.getItem(MEMBER_ROLE_KEY) as MemberRole) || 'Mom');
  const [memberAvatar, setMemberAvatar] = useState<string>(() => localStorage.getItem(MEMBER_AVATAR_KEY) || '👩');
  const [theme, setTheme] = useState<AppTheme>(() => (localStorage.getItem(THEME_KEY) as AppTheme) || 'light');

  // --- Circle State ---
  const [currentCircle, setCurrentCircle] = useState<GridCircle | null>(() => {
    const saved = localStorage.getItem(CIRCLE_DATA_KEY);
    return saved ? JSON.parse(saved) : null;
  });
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('map');
  const [copiedCode, setCopiedCode] = useState(false);

  // --- Live Data ---
  const [members, setMembers] = useState<DeviceMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<DeviceMember | null>(null);
  const [safeZones, setSafeZones] = useState<SafeZone[]>([]);
  const [checkIns, setCheckIns] = useState<CheckInPing[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [weather, setWeather] = useState<{ temp: number; condition: string } | null>(null);

  // --- Tracking & Sensor State ---
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [isSharingPaused, setIsSharingPaused] = useState<boolean>(false);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [currentSpeed, setCurrentSpeed] = useState<number>(0);
  const [currentBattery, setCurrentBattery] = useState<{ level: number; isCharging: boolean } | null>(null);
  const [wakeLock, setWakeLock] = useState<any>(null);

  // --- Modals State ---
  const [showSafeZonesModal, setShowSafeZonesModal] = useState(false);
  const [showSosModal, setShowSosModal] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // --- Refs ---
  const watchId = useRef<number | null>(null);
  const historyIntervalId = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const demoIntervalRef = useRef<number | null>(null);

  // Apply Theme to <html> class
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark' || theme === 'midnight') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // Check battery periodically
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
    const fetchWeather = async () => {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${selectedMember.lastLat}&longitude=${selectedMember.lastLng}&current_weather=true`
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
      } catch {
        // Ignore weather network error
      }
    };
    fetchWeather();
  }, [selectedMember?.id, selectedMember?.lastLat, selectedMember?.lastLng]);

  // --- Real-time Listeners (Firestore) ---
  useEffect(() => {
    if (!currentCircle || isDemoMode) return;

    // 1. Listen to Circle doc (for safeZones updates)
    const circleDocRef = doc(db, 'grids', currentCircle.id);
    const unsubCircle = onSnapshot(circleDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as GridCircle;
        if (data.safeZones) {
          setSafeZones(data.safeZones);
        }
      }
    }, () => {});

    // 2. Listen to Devices in this Circle
    const devicesQuery = query(collection(db, 'devices'), where('gridId', '==', currentCircle.id));
    const unsubDevices = onSnapshot(devicesQuery, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as DeviceMember));
      setMembers(list);

      // Auto-select first member if none selected
      setSelectedMember(prev => {
        if (!prev && list.length > 0) return list[0];
        if (prev) {
          const updated = list.find(m => m.id === prev.id);
          return updated || (list.length > 0 ? list[0] : null);
        }
        return null;
      });
    }, (err) => {
      console.warn('Devices subscription error, switching to offline fallback if needed:', err);
    });

    // 3. Listen to Check-ins
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
  }, [currentCircle?.id, isDemoMode]);

  // Listen to Selected Member History
  useEffect(() => {
    if (!selectedMember || !currentCircle) return;

    if (isDemoMode) {
      setHistory(DEMO_HISTORY);
      return;
    }

    const historyQuery = query(
      collection(db, `devices/${selectedMember.id}/history`),
      orderBy('timestamp', 'desc'),
      limit(50)
    );
    const unsubHistory = onSnapshot(historyQuery, (snap) => {
      const list = snap.docs.map(d => d.data() as HistoryPoint);
      setHistory(list);
    }, () => {});

    return () => unsubHistory();
  }, [selectedMember?.id, currentCircle?.id, isDemoMode]);

  // --- Tracking Logic ---
  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        const lock = await (navigator as any).wakeLock.request('screen');
        setWakeLock(lock);
        lock.addEventListener('release', () => setWakeLock(null));
      }
    } catch {
      // Wake lock unsupported or rejected
    }
  }, [wakeLock]);

  const startTracking = useCallback(() => {
    if (!currentCircle) return;
    setIsTracking(true);
    requestWakeLock();

    // Silent audio for mobile background persistence
    try {
      if (!audioRef.current) {
        const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
        audio.loop = true;
        audio.volume = 0.05;
        audioRef.current = audio;
      }
      audioRef.current.play().catch(() => {});
    } catch {
      // Audio playback blocked
    }

    if (!('geolocation' in navigator)) {
      alert('Geolocation is not supported by your browser.');
      setIsTracking(false);
      return;
    }

    const memberDocId = `${currentCircle.id}_${deviceId}`;
    const deviceRef = doc(db, 'devices', memberDocId);
    const historyRef = collection(db, `devices/${memberDocId}/history`);

    watchId.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, speed, accuracy } = pos.coords;
        setCurrentCoords({ lat: latitude, lng: longitude });
        setCurrentSpeed(speed || 0);

        if (isDemoMode) return;

        // Determine current safe zone
        const currentPlace = findCurrentPlace(latitude, longitude, safeZones);

        const memberPayload: Partial<DeviceMember> = {
          id: memberDocId,
          name: memberName || 'Family Member',
          role: memberRole,
          avatar: memberAvatar,
          lastLat: latitude,
          lastLng: longitude,
          lastUpdated: serverTimestamp(),
          gridId: currentCircle.id,
          speed: speed || 0,
          accuracy: accuracy || 10,
          currentPlace: currentPlace ? currentPlace.name : undefined,
          isSharingPaused: isSharingPaused
        };

        if (currentBattery) {
          memberPayload.battery = currentBattery.level;
          memberPayload.isCharging = currentBattery.isCharging;
        }

        try {
          await setDoc(deviceRef, memberPayload, { merge: true });
        } catch (err) {
          console.error('Error updating live location:', err);
        }
      },
      (err) => {
        console.warn('Geolocation watch error:', err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20000
      }
    );

    // Save location point to history every 30 seconds
    historyIntervalId.current = window.setInterval(async () => {
      if (currentCoords && !isDemoMode && !isSharingPaused) {
        try {
          const currentPlace = findCurrentPlace(currentCoords.lat, currentCoords.lng, safeZones);
          await addDoc(historyRef, {
            lat: currentCoords.lat,
            lng: currentCoords.lng,
            timestamp: serverTimestamp(),
            speed: currentSpeed,
            placeName: currentPlace ? currentPlace.name : undefined
          });
        } catch {
          // Ignore history save error
        }
      }
    }, 30000);
  }, [currentCircle, deviceId, memberName, memberRole, memberAvatar, safeZones, isDemoMode, isSharingPaused, currentCoords, currentSpeed, currentBattery, requestWakeLock]);

  const stopTracking = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (historyIntervalId.current !== null) {
      clearInterval(historyIntervalId.current);
      historyIntervalId.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (wakeLock) {
      try { wakeLock.release(); } catch {}
      setWakeLock(null);
    }
    setIsTracking(false);
  }, [wakeLock]);

  // Toggle Tracking Button
  const handleToggleTracking = () => {
    if (isTracking) {
      stopTracking();
    } else {
      startTracking();
    }
  };

  // --- Demo Simulation Loop ---
  const startDemoCircle = () => {
    setIsDemoMode(true);
    setCurrentCircle(DEMO_CIRCLE);
    setSafeZones(DEMO_CIRCLE.safeZones || []);
    setMembers(DEMO_MEMBERS);
    setSelectedMember(DEMO_MEMBERS[0]);
    setCheckIns(DEMO_CHECKINS);
    setHistory(DEMO_HISTORY);
    setMemberName(memberName || 'Alex (Me)');
    setMemberRole('Son');
    setMemberAvatar('🧑');

    // Simulate minor movement for dad & mom
    if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
    demoIntervalRef.current = window.setInterval(() => {
      setMembers(prev =>
        prev.map(m => {
          if (m.id === 'demo-dad') {
            return {
              ...m,
              lastLat: m.lastLat + (Math.random() - 0.5) * 0.001,
              lastLng: m.lastLng + (Math.random() - 0.5) * 0.001,
              lastUpdated: new Date()
            };
          }
          return m;
        })
      );
    }, 8000);
  };

  // --- Join Circle Handler ---
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
        // Fallback: check query in case id property was stored differently
        const q = query(collection(db, 'grids'), where('id', '==', pin));
        const snap = await getDocs(q);
        if (snap.empty) return false;
        circleData = snap.docs[0].data() as GridCircle;
      }

      // Persist Profile & Circle
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

      // Register device immediately
      const memberDocId = `${pin}_${deviceId}`;
      await setDoc(doc(db, 'devices', memberDocId), {
        id: memberDocId,
        name,
        role,
        avatar,
        lastLat: 37.7749,
        lastLng: -122.4194,
        lastUpdated: serverTimestamp(),
        gridId: pin,
        battery: currentBattery?.level || 100,
        isCharging: currentBattery?.isCharging || false
      }, { merge: true });

      return true;
    } catch (err) {
      console.error('Failed to join circle:', err);
      // If Firestore failed, offer demo mode
      startDemoCircle();
      return true;
    }
  };

  // --- Create Circle Handler ---
  const handleCreateCircle = async (
    name: string, 
    pin: string, 
    creatorName: string, 
    role: MemberRole, 
    avatar: string
  ): Promise<boolean> => {
    try {
      const newCircle: GridCircle = {
        id: pin,
        name,
        createdAt: serverTimestamp(),
        ownerId: deviceId,
        safeZones: [
          { id: 'zone-home', name: 'Home', icon: '🏠', lat: 37.7749, lng: -122.4194, radius: 200 }
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

      // Register member device
      const memberDocId = `${pin}_${deviceId}`;
      await setDoc(doc(db, 'devices', memberDocId), {
        id: memberDocId,
        name: creatorName,
        role,
        avatar,
        lastLat: 37.7749,
        lastLng: -122.4194,
        lastUpdated: serverTimestamp(),
        gridId: pin,
        battery: currentBattery?.level || 100,
        isCharging: currentBattery?.isCharging || false
      }, { merge: true });

      return true;
    } catch (err) {
      console.error('Failed to create circle:', err);
      // Fallback to local circle
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

  // --- Add Safe Zone ---
  const handleAddSafeZone = async (zone: Omit<SafeZone, 'id'>) => {
    const newZone: SafeZone = {
      id: `zone_${Date.now()}`,
      ...zone
    };
    const updated = [...safeZones, newZone];
    setSafeZones(updated);

    if (currentCircle && !isDemoMode) {
      try {
        await updateDoc(doc(db, 'grids', currentCircle.id), {
          safeZones: updated
        });
      } catch (err) {
        console.warn('Could not sync safe zone to firestore:', err);
      }
    }
  };

  // --- Delete Safe Zone ---
  const handleDeleteSafeZone = async (zoneId: string) => {
    const updated = safeZones.filter(z => z.id !== zoneId);
    setSafeZones(updated);

    if (currentCircle && !isDemoMode) {
      try {
        await updateDoc(doc(db, 'grids', currentCircle.id), {
          safeZones: updated
        });
      } catch (err) {
        console.warn('Could not sync zone deletion:', err);
      }
    }
  };

  // --- SOS Alert Handlers ---
  const handleTriggerSos = async () => {
    if (!currentCircle) return;
    const memberDocId = `${currentCircle.id}_${deviceId}`;

    if (!isDemoMode) {
      try {
        await updateDoc(doc(db, 'devices', memberDocId), {
          isSosActive: true,
          sosTimestamp: serverTimestamp()
        });
      } catch (err) {
        console.error('SOS trigger error:', err);
      }
    } else {
      setMembers(prev =>
        prev.map(m => m.id === memberDocId ? { ...m, isSosActive: true } : m)
      );
    }
    setShowSosModal(false);
  };

  const handleCancelSos = async () => {
    if (!currentCircle) return;
    const memberDocId = `${currentCircle.id}_${deviceId}`;

    if (!isDemoMode) {
      try {
        await updateDoc(doc(db, 'devices', memberDocId), {
          isSosActive: false
        });
      } catch (err) {
        console.error('SOS cancel error:', err);
      }
    } else {
      setMembers(prev =>
        prev.map(m => m.id === memberDocId ? { ...m, isSosActive: false } : m)
      );
    }
  };

  // --- Check-In Post Handler ---
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
      } catch (err) {
        console.error('Failed to post check-in:', err);
      }
    } else {
      setCheckIns(prev => [newCheckIn, ...prev]);
    }
    setShowCheckInModal(false);
  };

  // --- Clear History Handler ---
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
      } catch (err) {
        console.error('Failed to clear history:', err);
      }
    } else {
      setHistory([]);
    }
  };

  // --- Profile Update ---
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
        await updateDoc(doc(db, 'devices', memberDocId), {
          name,
          role,
          avatar
        });
      } catch (err) {
        console.warn('Profile update sync error:', err);
      }
    }
    setShowSettingsModal(false);
  };

  // --- Leave Circle ---
  const handleLeaveCircle = () => {
    stopTracking();
    localStorage.removeItem(CIRCLE_PIN_KEY);
    localStorage.removeItem(CIRCLE_DATA_KEY);
    setCurrentCircle(null);
    setIsDemoMode(false);
    setShowSettingsModal(false);
  };

  // Copy Circle Code Helper
  const handleCopyCode = async () => {
    if (!currentCircle) return;
    try {
      await navigator.clipboard.writeText(currentCircle.id);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  // Active SOS alert detection across all circle members
  const activeSosMember = members.find(m => m.isSosActive) || null;
  const isCurrentUserSos = activeSosMember?.id === `${currentCircle?.id}_${deviceId}`;

  // If user hasn't joined or created a circle, show onboarding screen
  if (!currentCircle) {
    return (
      <OnboardingModal
        onJoinCircle={handleJoinCircle}
        onCreateCircle={handleCreateCircle}
        onStartDemo={startDemoCircle}
        defaultName={memberName}
        defaultRole={memberRole}
        defaultAvatar={memberAvatar}
      />
    );
  }

  const currentMember = members.find(m => m.id === `${currentCircle.id}_${deviceId}`) || null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Top Application Header */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Left: Circle Name & Code */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-sm shadow-blue-500/20 shrink-0">
              <Users className="w-5 h-5" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-slate-900 dark:text-white text-base leading-tight">
                  {currentCircle.name}
                </h1>
                {isDemoMode && (
                  <span className="text-[10px] bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Demo
                  </span>
                )}
              </div>

              {/* Circle PIN Pill with 1-click Copy */}
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

          {/* Right: Quick Action Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live GPS Sharing Toggle */}
            <button
              onClick={handleToggleTracking}
              className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs ${
                isTracking
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20 animate-pulse'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${isTracking ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {isTracking ? 'GPS Active' : 'Enable Live GPS'}
              </span>
              <span className="sm:hidden">
                {isTracking ? 'Active' : 'GPS'}
              </span>
            </button>

            {/* Check-in Quick Ping */}
            <button
              onClick={() => setShowCheckInModal(true)}
              className="p-2 sm:px-3 sm:py-2 rounded-2xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Send Family Check-in"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Check-in</span>
            </button>

            {/* Safe Places Modal Toggle */}
            <button
              onClick={() => setShowSafeZonesModal(true)}
              className="p-2 sm:px-3 sm:py-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Safe Places"
            >
              <MapPin className="w-4 h-4" />
              <span className="hidden sm:inline">Places</span>
            </button>

            {/* SOS Emergency Trigger */}
            <button
              onClick={() => setShowSosModal(true)}
              className="p-2 sm:px-3.5 sm:py-2 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm shadow-red-500/20 active:scale-95"
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

      {/* Emergency Active Banner */}
      {activeSosMember && (
        <div className="bg-red-600 text-white py-2.5 px-4 text-center font-bold text-xs flex items-center justify-center gap-2 shadow-md animate-pulse">
          <ShieldAlert className="w-4 h-4" />
          <span>EMERGENCY ALERT: {activeSosMember.name} has triggered SOS!</span>
          <a
            href={getDirectionsUrl(activeSosMember.lastLat, activeSosMember.lastLng)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline ml-2 hover:text-red-100"
          >
            Navigate Now &rarr;
          </a>
        </div>
      )}

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Map & Live Stats (8 cols on desktop) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {/* Selected Member Quick Info Card (Floating Bar) */}
          {selectedMember && (
            <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <span className="text-2xl p-2 bg-slate-100 dark:bg-slate-800 rounded-2xl shadow-inner">
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

              {/* Weather & Directions */}
              <div className="flex items-center gap-2">
                {weather && (
                  <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <CloudSun className="w-3.5 h-3.5 text-amber-500" />
                    <span>{weather.temp}°C {weather.condition}</span>
                  </div>
                )}

                <a
                  href={getDirectionsUrl(selectedMember.lastLat, selectedMember.lastLng)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1 shadow-sm transition-colors"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Navigate</span>
                </a>
              </div>
            </div>
          )}

          {/* Leaflet Map Visualizer */}
          <div className="flex-1 min-h-[460px] rounded-3xl overflow-hidden shadow-sm">
            <Map
              members={members}
              selectedMember={selectedMember}
              onSelectMember={(m) => setSelectedMember(m)}
              safeZones={safeZones}
              history={history}
              currentUserId={`${currentCircle.id}_${deviceId}`}
              focusLocation={selectedMember ? { lat: selectedMember.lastLat, lng: selectedMember.lastLng } : null}
              theme={theme}
            />
          </div>
        </div>

        {/* Right Column: Family Members, Timeline, Activity Feed (4 cols on desktop) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
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
              Check-ins ({checkIns.length})
            </button>
          </div>

          {/* Tab Content 1: Family Member Cards */}
          {(activeTab === 'members' || activeTab === 'map') && (
            <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto max-h-[580px] pr-1">
              {members.length === 0 ? (
                <div className="text-center py-12 px-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
                  <div className="text-4xl mb-2">👨‍👩‍👧‍👦</div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                    No Members in this Circle Yet
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                    Share your Circle Code ({currentCircle.id}) with your family members to start tracking!
                  </p>
                  <button
                    onClick={handleCopyCode}
                    className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-sm"
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
                    onSelect={(m) => setSelectedMember(m)}
                  />
                ))
              )}

              {/* Add member invite tip */}
              <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/40 rounded-2xl border border-blue-100 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-200 flex items-center justify-between mt-1">
                <div>
                  <span className="font-bold">Invite more family:</span>
                  <p className="text-[11px] text-blue-700 dark:text-blue-300">
                    Use code <span className="font-mono font-bold">{currentCircle.id}</span>
                  </p>
                </div>
                <button
                  onClick={handleCopyCode}
                  className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[11px] font-semibold"
                >
                  {copiedCode ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          {/* Tab Content 2: Trip History Timeline */}
          {activeTab === 'history' && selectedMember && (
            <div className="flex-1 max-h-[580px]">
              <TripTimeline
                member={selectedMember}
                history={history}
                onClearHistory={handleClearHistory}
                isCurrentUser={selectedMember.id === `${currentCircle.id}_${deviceId}`}
              />
            </div>
          )}

          {/* Tab Content 3: Family Check-ins Feed */}
          {activeTab === 'checkins' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 flex flex-col h-full max-h-[580px] shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  Family Activity Feed
                </h4>
                <button
                  onClick={() => setShowCheckInModal(true)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Post</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto mt-3 space-y-2.5 pr-1">
                {checkIns.length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-400">
                    No recent check-in updates. Tap "New Post" to check in!
                  </div>
                ) : (
                  checkIns.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-start gap-3"
                    >
                      <span className="text-xl p-1.5 bg-white dark:bg-slate-800 rounded-xl shadow-xs">
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

      {/* Modals */}
      <SafeZonesModal
        isOpen={showSafeZonesModal}
        onClose={() => setShowSafeZonesModal(false)}
        safeZones={safeZones}
        onAddZone={handleAddSafeZone}
        onDeleteZone={handleDeleteSafeZone}
        currentCoords={currentCoords}
      />

      <SosModal
        isOpen={showSosModal}
        onClose={() => setShowSosModal(false)}
        onTriggerSos={handleTriggerSos}
        onCancelSos={handleCancelSos}
        activeSosMember={activeSosMember}
        isCurrentUserSos={isCurrentUserSos}
      />

      <CheckInModal
        isOpen={showCheckInModal}
        onClose={() => setShowCheckInModal(false)}
        onSendCheckIn={handleSendCheckIn}
        checkIns={checkIns}
        memberName={memberName}
      />

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
      />
    </div>
  );
}
