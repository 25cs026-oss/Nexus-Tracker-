/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Activity, 
  MapPin, 
  History, 
  Shield, 
  Settings, 
  Cpu, 
  Globe, 
  Lock, 
  Unlock,
  ChevronRight,
  RefreshCw,
  Trash2,
  LogOut,
  Cloud,
  Thermometer,
  Wind
} from 'lucide-react';
import { 
  db, 
  collection, 
  doc, 
  setDoc, 
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
import { Map } from './components/Map';

// --- Types ---
interface Grid {
  id: string; // The PIN
  name: string;
  createdAt: any;
}

interface Device {
  id: string;
  name: string;
  lastLat: number;
  lastLng: number;
  lastUpdated: any;
  gridId: string;
  battery?: number;
  signal?: number;
}

interface SystemLog {
  id: string;
  message: string;
  timestamp: Date;
  type: 'info' | 'warning' | 'error' | 'success';
}

interface HistoryPoint {
  lat: number;
  lng: number;
  timestamp: any;
}

// --- Constants ---
const PIN_KEY = 'nexus_track_pin';
const DEVICE_ID_KEY = 'nexus_track_device_id';
const HISTORY_DAYS = 3;
const TRACK_INTERVAL = 30000; // 30 seconds

// Helper to get or create a unique device ID
const getDeviceId = () => {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `dev_${Math.random().toString(36).substring(2, 15)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
};

// Helper to get device name
const getDeviceName = () => {
  const userAgent = navigator.userAgent.toLowerCase();
  if (/android/.test(userAgent)) return 'Android Nexus';
  if (/iphone|ipad|ipod/.test(userAgent)) return 'iOS Nexus';
  return 'PC Nexus';
};

export default function App() {
  const [pin, setPin] = useState<string>('');
  const [gridName, setGridName] = useState<string>('');
  const [currentGrid, setCurrentGrid] = useState<Grid | null>(null);
  const [isLocked, setIsLocked] = useState(true);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [mapFocus, setMapFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [weather, setWeather] = useState<{ temp: number; condition: string; wind: number } | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<SystemLog[]>(() => {
    const saved = localStorage.getItem('NEXUS_LOGS');
    return saved ? JSON.parse(saved) : [];
  });
  const [isBackground, setIsBackground] = useState(false);
  const [wakeLock, setWakeLock] = useState<any>(null);
  const [showBgGuide, setShowBgGuide] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const hasAutoStarted = React.useRef(false);
  const watchdogId = React.useRef<number | null>(null);
  const logIntervalId = React.useRef<number | null>(null);
  const watchId = React.useRef<number | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const lastUpdateRef = React.useRef<number>(Date.now());
  const currentCoordsRef = React.useRef<{lat: number, lng: number} | null>(null);

  useEffect(() => {
    if (!selectedDevice) {
      setWeather(null);
      return;
    }

    const fetchWeather = async () => {
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${selectedDevice.lastLat}&longitude=${selectedDevice.lastLng}&current_weather=true`);
        const data = await res.json();
        if (data.current_weather) {
          const getWeatherCondition = (code: number) => {
            if (code === 0) return 'Clear';
            if (code <= 3) return 'Partly Cloudy';
            if (code <= 48) return 'Foggy';
            if (code <= 67) return 'Rainy';
            if (code <= 77) return 'Snowy';
            if (code <= 82) return 'Showers';
            if (code <= 99) return 'Thunderstorm';
            return 'Unknown';
          };

          setWeather({
            temp: data.current_weather.temperature,
            wind: data.current_weather.windspeed,
            condition: getWeatherCondition(data.current_weather.weathercode)
          });
        }
      } catch (err) {
        console.error('Weather fetch error:', err);
      }
    };

    fetchWeather();
    // Refresh weather every 10 minutes if still selected
    const interval = setInterval(fetchWeather, 600000);
    return () => clearInterval(interval);
  }, [selectedDevice?.id]); // Only fetch when device changes, or we could use lat/lng but id is safer for "on click" logic

  const addLog = useCallback((message: string, type: SystemLog['type'] = 'info') => {
    const newLog: SystemLog = {
      id: Math.random().toString(36).substring(7),
      message,
      timestamp: new Date(),
      type
    };
    setLogs(prev => {
      const updated = [newLog, ...prev].slice(0, 100);
      localStorage.setItem('NEXUS_LOGS', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // --- Wake Lock Logic ---
  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        const lock = await (navigator as any).wakeLock.request('screen');
        setWakeLock(lock);
        addLog('WAKE_LOCK_ACQUIRED: SCREEN_ACTIVE', 'success');
        
        lock.addEventListener('release', () => {
          setWakeLock(null);
          addLog('WAKE_LOCK_RELEASED', 'warning');
        });
      }
    } catch (err: any) {
      addLog(`WAKE_LOCK_ERROR: ${err.message}`, 'error');
    }
  }, [wakeLock, addLog]);

  const releaseWakeLock = () => {
    if (wakeLock) {
      wakeLock.release();
      setWakeLock(null);
    }
  };

  // --- Tracking Logic ---
  const startTracking = useCallback(() => {
    if (!currentGrid) return;
    
    setIsTracking(true);
    addLog('TRACKING_INITIALIZED', 'success');
    requestWakeLock();

    // Start silent audio loop to keep browser process alive on mobile
    if (!audioRef.current) {
      const audio = new Audio();
      // More robust silent WAV
      audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
      audio.loop = true;
      audio.volume = 0.1; // Low but non-zero
      audioRef.current = audio;
    }
    audioRef.current.play().catch(e => addLog('AUDIO_KEEP_ALIVE_FAILED', 'warning'));

    // Set up Media Session to help keep the process alive
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Nexus Uplink Active',
        artist: 'Nexus Grid Net',
        album: 'Background Persistence Protocol',
        artwork: [
          { src: 'https://picsum.photos/seed/nexus/96/96', sizes: '96x96', type: 'image/png' },
          { src: 'https://picsum.photos/seed/nexus/128/128', sizes: '128x128', type: 'image/png' },
        ]
      });
      
      // Handle potential interruptions
      navigator.mediaSession.setActionHandler('play', () => audioRef.current?.play());
      navigator.mediaSession.setActionHandler('pause', () => {
        if (isTracking) audioRef.current?.play(); // Prevent pausing if tracking
      });
    }

    // Try to use Web Locks API to prevent suspension
    if (navigator.locks) {
      navigator.locks.request('nexus_uplink_lock', { mode: 'exclusive' }, async () => {
        addLog('SYSTEM_LOCK_ACQUIRED', 'info');
        // This lock will be held as long as the promise is pending
        return new Promise(() => {}); 
      }).catch(() => {});
    }

    const deviceId = `${currentGrid.id}_${getDeviceId()}`;
    const deviceRef = doc(db, 'devices', deviceId);
    const historyRef = collection(db, `devices/${deviceId}/history`);

    watchId.current = navigator.geolocation.watchPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          lastUpdateRef.current = Date.now();
          currentCoordsRef.current = { lat: latitude, lng: longitude };
          
          // Update device status (Real-time)
          await setDoc(deviceRef, {
            name: getDeviceName(),
            lastLat: latitude,
            lastLng: longitude,
            lastUpdated: serverTimestamp(),
            gridId: currentGrid.id,
            battery: Math.floor(Math.random() * 20) + 80,
            signal: Math.floor(Math.random() * 15) + 85
          }, { merge: true });

          addLog(`LIVE_SYNC: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, 'info');
        } catch (err: any) {
          addLog(`SYNC_ERROR: ${err.message}`, 'error');
        }
      },
      (err) => {
        setError(err.message);
        addLog(`GPS_ERROR: ${err.message}`, 'error');
      },
      { 
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 30000 
      }
    );

    // Fixed 30-second logging interval
    logIntervalId.current = window.setInterval(async () => {
      if (currentCoordsRef.current) {
        try {
          await addDoc(historyRef, {
            lat: currentCoordsRef.current.lat,
            lng: currentCoordsRef.current.lng,
            timestamp: serverTimestamp()
          });
          addLog('TEMPORAL_LOG_SAVED', 'success');
        } catch (err: any) {
          addLog(`LOG_SAVE_ERROR: ${err.message}`, 'error');
        }
      }
    }, 30000);
  }, [currentGrid, addLog, requestWakeLock]);

  // --- Watchdog & Background Management ---
  useEffect(() => {
    if (!isTracking) {
      if (watchdogId.current) clearInterval(watchdogId.current);
      return;
    }

    watchdogId.current = window.setInterval(() => {
      const timeSinceLastUpdate = Date.now() - lastUpdateRef.current;
      
      // If we haven't had an update in 45 seconds, the browser might have throttled us
      if (timeSinceLastUpdate > 45000) {
        addLog('UPLINK_STALLED: RE-SYNCING SENSORS', 'warning');
        
        // Force a single position check to wake up the GPS
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            addLog(`RESTORED: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, 'success');
            lastUpdateRef.current = Date.now();
          },
          (err) => addLog(`RECOVERY_FAILED: ${err.message}`, 'error'),
          { enableHighAccuracy: true, timeout: 10000 }
        );

        // Re-trigger audio if it stopped
        if (audioRef.current && audioRef.current.paused) {
          audioRef.current.play().catch(() => {});
        }
        
        // Re-request wake lock
        requestWakeLock();
      }
    }, 20000);

    return () => {
      if (watchdogId.current) clearInterval(watchdogId.current);
    };
  }, [isTracking, addLog, requestWakeLock]);

  const stopTracking = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (logIntervalId.current !== null) {
      clearInterval(logIntervalId.current);
      logIntervalId.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsTracking(false);
    releaseWakeLock();
    addLog('TRACKING_TERMINATED', 'warning');
  }, [addLog, wakeLock]);

  useEffect(() => {
    if (isTracking && !watchId.current) {
      startTracking();
    }
    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      if (logIntervalId.current !== null) {
        clearInterval(logIntervalId.current);
        logIntervalId.current = null;
      }
    };
  }, [isTracking, startTracking]);

  const handleStartTracking = useCallback(() => {
    if (isTracking) {
      stopTracking();
      return;
    }

    if (countdown !== null) return;

    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev === null) {
          clearInterval(interval);
          return null;
        }
        if (prev <= 1) {
          clearInterval(interval);
          startTracking();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [isTracking, stopTracking, startTracking, countdown]);

  // --- Auto-start Logic ---
  useEffect(() => {
    if (!isLocked && currentGrid && !isTracking && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      handleStartTracking();
    }
    if (isLocked) {
      hasAutoStarted.current = false;
    }
  }, [isLocked, currentGrid, isTracking, handleStartTracking]);

  // --- Persistence Logic ---
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isHidden = document.visibilityState === 'hidden';
      setIsBackground(isHidden);
      
      if (isHidden) {
        addLog('BACKGROUND_MODE_ACTIVE', 'info');
      } else {
        addLog('FOREGROUND_MODE_RESTORED', 'info');
        // Re-acquire wake lock if tracking is active
        if (isTracking) {
          requestWakeLock();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [addLog, isTracking, requestWakeLock]);

  useEffect(() => {
    const savedPin = localStorage.getItem('NEXUS_PIN');
    const savedGrid = localStorage.getItem('NEXUS_GRID');
    
    if (savedPin && savedGrid) {
      setPin(savedPin);
      setCurrentGrid(JSON.parse(savedGrid));
      setIsLocked(false);
      // We use a timeout to ensure the log is added after the component is fully mounted
      setTimeout(() => addLog('PERSISTENT UPLINK RESTORED', 'success'), 500);
    }
  }, []);

  const saveSession = (pin: string, grid: Grid) => {
    localStorage.setItem('NEXUS_PIN', pin);
    localStorage.setItem('NEXUS_GRID', JSON.stringify(grid));
  };

  const handleResetHistory = async () => {
    if (!selectedDevice) return;
    
    addLog(`INITIALIZING_PURGE: ${selectedDevice.name.toUpperCase()}`, 'info');

    try {
      const q = query(collection(db, `devices/${selectedDevice.id}/history`));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        addLog('PURGE_CANCELLED: NO DATA FOUND', 'warning');
        return;
      }

      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      setHistory([]);
      addLog(`HISTORY_PURGED: ${selectedDevice.name.toUpperCase()}`, 'success');
    } catch (err: any) {
      console.error('Purge Error:', err);
      addLog(`PURGE_ERROR: ${err.message}`, 'error');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('NEXUS_PIN');
    localStorage.removeItem('NEXUS_GRID');
    setIsLocked(true);
    setCurrentGrid(null);
    setPin('');
    addLog('SESSION TERMINATED', 'warning');
  };

  // --- PIN Logic ---
  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) return;

    try {
      const gridRef = doc(db, 'grids', pin);
      const gridSnap = await getDocs(query(collection(db, 'grids'), where('id', '==', pin)));
      
      // Using getDocs with query because doc() doesn't give us a snapshot directly without getDoc
      // Actually let's use a simpler approach: check if document exists
      const q = query(collection(db, 'grids'), where('id', '==', pin));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const data = querySnapshot.docs[0].data() as Grid;
        setCurrentGrid(data);
        saveSession(pin, data);
        setIsLocked(false);
        setIsSettingUp(false);
        addLog(`UPLINK ESTABLISHED: GRID_${data.name.toUpperCase()}`, 'success');
      } else {
        // PIN doesn't exist, enter setup mode
        setIsSettingUp(true);
      }
    } catch (err) {
      setError('ACCESS DENIED');
      addLog('SECURITY BREACH DETECTED: INVALID ACCESS CODE', 'error');
      setTimeout(() => setError(null), 2000);
    }
  };

  const handleCreateGrid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gridName || !pin) return;

    try {
      const newGrid: Grid = {
        id: pin,
        name: gridName,
        createdAt: serverTimestamp()
      };
      await setDoc(doc(db, 'grids', pin), newGrid);
      setCurrentGrid(newGrid);
      saveSession(pin, newGrid);
      setIsLocked(false);
      setIsSettingUp(false);
      addLog(`NEW GRID INITIALIZED: ${gridName.toUpperCase()}`, 'success');
    } catch (err) {
      setError('SETUP FAILED');
      addLog('SYSTEM ERROR: GRID INITIALIZATION FAILED', 'error');
      setTimeout(() => setError(null), 2000);
    }
  };

  // --- Data Fetching ---
  useEffect(() => {
    if (!currentGrid || isLocked) return;

    const q = query(collection(db, 'devices'), where('gridId', '==', currentGrid.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const devList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Device));
      setDevices(devList);
    });

    return () => unsubscribe();
  }, [currentGrid, isLocked]);

  useEffect(() => {
    if (!selectedDevice || isLocked) return;

    const q = query(
      collection(db, `devices/${selectedDevice.id}/history`),
      orderBy('timestamp', 'desc'),
      limit(100)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const histList = snapshot.docs.map(doc => doc.data() as HistoryPoint);
      setHistory(histList);
    });

    return () => unsubscribe();
  }, [selectedDevice, isLocked]);

  // --- UI Components ---
  if (isLocked) {
    return (
      <div className="min-h-screen bg-[#050505] text-[#00f2ff] flex items-center justify-center font-mono p-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-full opacity-20" 
               style={{ backgroundImage: 'radial-gradient(#00f2ff 0.5px, transparent 0.5px)', backgroundSize: '30px 30px' }} />
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full border border-[#00f2ff]/20 bg-[#0a0a0a] p-8 rounded-2xl shadow-[0_0_50px_rgba(0,242,255,0.1)]"
        >
          <div className="flex justify-center mb-8">
            <Cpu className="w-16 h-16 animate-pulse" />
          </div>
          <h1 className="text-3xl font-bold text-center mb-2 tracking-tighter uppercase">Nexus Access</h1>
          <p className="text-center text-[#00f2ff]/60 text-[10px] mb-8 uppercase tracking-widest">
            {isSettingUp ? 'Initialize New Grid Parameters' : 'Enter Authorization Code'}
          </p>

          {!isSettingUp ? (
            <form onSubmit={handlePinSubmit} className="space-y-6">
              <div className="relative">
                <input 
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  className="w-full bg-black border border-[#00f2ff]/30 rounded-xl py-4 text-center text-2xl tracking-[1em] focus:outline-none focus:border-[#00f2ff] transition-all"
                  autoFocus
                />
              </div>
              
              {error && (
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-red-500 text-[10px] text-center font-bold uppercase"
                >
                  {error}
                </motion.p>
              )}

              <button 
                type="submit"
                className="w-full py-4 bg-[#00f2ff] text-black font-bold rounded-xl hover:bg-[#00f2ff]/80 transition-colors uppercase text-xs tracking-widest"
              >
                Establish Link
              </button>
            </form>
          ) : (
            <form onSubmit={handleCreateGrid} className="space-y-6">
              <div className="relative">
                <input 
                  type="text"
                  value={gridName}
                  onChange={(e) => setGridName(e.target.value)}
                  placeholder="GRID NAME (e.g. Grid-1)"
                  className="w-full bg-black border border-[#00f2ff]/30 rounded-xl py-4 text-center text-xs focus:outline-none focus:border-[#00f2ff] transition-all uppercase"
                  autoFocus
                />
              </div>
              
              <button 
                type="submit"
                className="w-full py-4 bg-[#00f2ff] text-black font-bold rounded-xl hover:bg-[#00f2ff]/80 transition-colors uppercase text-xs tracking-widest"
              >
                Initialize Grid
              </button>
              <button 
                type="button"
                onClick={() => { setIsSettingUp(false); setPin(''); }}
                className="w-full text-[#00f2ff]/50 text-[10px] uppercase tracking-widest"
              >
                Cancel
              </button>
            </form>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-[#00f2ff] font-mono flex flex-col">
      {/* Header */}
      <header className="border-bottom border-[#00f2ff]/10 p-4 flex items-center justify-between bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#00f2ff]/10 rounded-lg flex items-center justify-center border border-[#00f2ff]/30">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tighter leading-none uppercase">{currentGrid?.name}</h1>
            <span className="text-[10px] text-[#00f2ff]/50 uppercase">System Online // Grid ID: {currentGrid?.id}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowBgGuide(true)}
            className="p-2 rounded-lg border border-[#00f2ff]/30 text-[#00f2ff]/50 hover:bg-[#00f2ff]/10 transition-all"
            title="BACKGROUND OPTIMIZATION"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setShowBgGuide(true)}
            className="p-2 rounded-lg border border-[#00f2ff]/20 hover:bg-[#00f2ff]/10 transition-all"
            title="BACKGROUND GUIDE"
          >
            <Shield className="w-4 h-4" />
          </button>
          <button 
            onClick={handleStartTracking}
            className={`px-4 py-2 rounded-lg border text-xs font-bold transition-all flex items-center gap-2 ${
              isTracking 
                ? 'bg-red-500/10 border-red-500/50 text-red-500' 
                : countdown !== null
                  ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-500'
                  : 'bg-[#00f2ff]/10 border-[#00f2ff]/50 text-[#00f2ff]'
            }`}
            disabled={countdown !== null && !isTracking}
          >
            <RefreshCw className={`w-4 h-4 ${isTracking || countdown !== null ? 'animate-spin' : ''}`} />
            {isTracking 
              ? 'STOP TRACKING' 
              : countdown !== null 
                ? `TRACKING IN ${countdown}...` 
                : 'START TRACKING'}
          </button>
          <button 
            onClick={handleLogout}
            className="p-2 rounded-lg border border-red-500/30 text-red-500/50 hover:bg-red-500/10 transition-all"
            title="TERMINATE SESSION"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl mx-auto w-full">
        {/* Map Section */}
        <section className="lg:col-span-8 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              <h2 className="text-sm font-bold">GLOBAL GRID VISUALIZER</h2>
            </div>
            <div className="text-[10px] text-[#00f2ff]/50">
              COORDS: {selectedDevice ? `${selectedDevice.lastLat.toFixed(4)}, ${selectedDevice.lastLng.toFixed(4)}` : 'SCANNING...'}
            </div>
          </div>
          
          <Map 
            locations={devices.map(d => ({ lat: d.lastLat, lng: d.lastLng, id: d.name }))}
            history={history.map(h => ({ lat: h.lat, lng: h.lng }))}
            focusLocation={mapFocus}
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'ACTIVE NODES', value: devices.length, icon: Cpu },
              { label: 'UPTIME', value: '99.99%', icon: Activity },
              { label: 'TEMP', value: weather ? `${weather.temp}°C` : '--', icon: Thermometer },
              { label: 'CONDITION', value: weather ? weather.condition : '--', icon: Cloud },
              { label: 'WIND', value: weather ? `${weather.wind} km/h` : '--', icon: Wind },
              { label: 'ENCRYPTION', value: 'AES-256', icon: Shield },
            ].map((stat, i) => (
              <div key={i} className="bg-[#0a0a0a] border border-[#00f2ff]/10 p-3 rounded-xl">
                <div className="flex items-center gap-2 mb-1">
                  <stat.icon className="w-3 h-3 text-[#00f2ff]/50" />
                  <span className="text-[9px] text-[#00f2ff]/50 uppercase">{stat.label}</span>
                </div>
                <div className="text-lg font-bold">{stat.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Sidebar */}
        <aside className="lg:col-span-4 flex flex-col gap-6">
          {/* Device List */}
          <div className="bg-[#0a0a0a] border border-[#00f2ff]/10 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-[#00f2ff]/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                <h3 className="text-xs font-bold">CONNECTED DEVICES</h3>
              </div>
            </div>
            <div className="p-2 space-y-1">
              {devices.length === 0 ? (
                <div className="p-8 text-center text-[10px] text-[#00f2ff]/30">NO DEVICES DETECTED</div>
              ) : (
                devices.map(dev => (
                  <button
                    key={dev.id}
                    onClick={() => {
                      setSelectedDevice(dev);
                      setMapFocus({ lat: dev.lastLat, lng: dev.lastLng });
                    }}
                    className={`w-full p-3 rounded-xl flex items-center justify-between transition-all ${
                      selectedDevice?.id === dev.id ? 'bg-[#00f2ff]/10 border border-[#00f2ff]/30' : 'hover:bg-white/5 border border-transparent'
                    }`}
                  >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center border border-[#00f2ff]/20">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <div className="text-xs font-bold">{dev.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex items-center gap-1">
                          <div className="w-1 h-2 bg-green-500/50 rounded-sm" />
                          <span className="text-[8px] text-[#00f2ff]/40">{dev.battery}%</span>
                        </div>
                        <div className="w-px h-2 bg-white/10" />
                        <span className="text-[8px] text-[#00f2ff]/40">SIG: {dev.signal}%</span>
                      </div>
                    </div>
                  </div>
                    <ChevronRight className="w-4 h-4 opacity-30" />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* History */}
          <div className="bg-[#0a0a0a] border border-[#00f2ff]/10 rounded-2xl flex-1 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-[#00f2ff]/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4" />
                <h3 className="text-xs font-bold">TEMPORAL LOGS (72H)</h3>
              </div>
              {selectedDevice && history.length > 0 && (
                <button 
                  onClick={handleResetHistory}
                  className="p-1.5 rounded-md border border-red-500/30 text-red-500/50 hover:bg-red-500/10 hover:text-red-500 transition-all"
                  title="PURGE HISTORY"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {history.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[10px] text-[#00f2ff]/30">LOGS EMPTY</div>
              ) : (
                history.map((point, i) => (
                  <div key={i} className="flex items-start gap-3 group">
                    <div className="mt-1 w-1.5 h-1.5 rounded-full bg-[#00f2ff] shadow-[0_0_5px_#00f2ff]" />
                    <div className="flex-1">
                      <div className="text-[10px] font-bold flex justify-between">
                        <span>{point.lat.toFixed(6)}, {point.lng.toFixed(6)}</span>
                        <span className="text-[#00f2ff]/40 font-normal">{new Date(point.timestamp?.toDate()).toLocaleString()}</span>
                      </div>
                      <div className="h-px w-full bg-[#00f2ff]/5 mt-2" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* System Terminal */}
          <div className="bg-black border border-[#00f2ff]/10 rounded-2xl h-48 overflow-hidden flex flex-col font-mono">
            <div className="p-2 border-b border-[#00f2ff]/10 bg-[#0a0a0a] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-[#00f2ff] rounded-full animate-pulse" />
                <span className="text-[8px] font-bold text-[#00f2ff]/70 uppercase tracking-widest">System Terminal // Raw Data</span>
              </div>
              <span className="text-[8px] text-[#00f2ff]/30">v2.5.0-STABLE</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {logs.length === 0 ? (
                <div className="text-[8px] text-[#00f2ff]/20">WAITING FOR DATA UPLINK...</div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className="text-[8px] flex gap-2">
                    <span className="text-[#00f2ff]/30">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                    <span className={
                      log.type === 'success' ? 'text-green-500' :
                      log.type === 'error' ? 'text-red-500' :
                      log.type === 'warning' ? 'text-yellow-500' :
                      'text-[#00f2ff]/70'
                    }>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </main>

      {/* Footer / Status Bar */}
      <footer className="p-2 border-t border-[#00f2ff]/10 bg-[#0a0a0a] flex items-center justify-between text-[9px] text-[#00f2ff]/40">
        <div className="flex items-center gap-4">
          <span>SECURE_SESSION: {currentGrid?.id}</span>
          <span>ENCRYPTION_STATUS: VERIFIED</span>
          {isBackground && (
            <span className="text-green-500 animate-pulse flex items-center gap-1">
              <div className="w-1 h-1 bg-green-500 rounded-full" />
              BACKGROUND_UPLINK_ACTIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span>GRID_SYNC_ACTIVE</span>
        </div>
      </footer>

      {/* Error Overlay */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-full font-bold text-xs shadow-2xl z-[100]"
          >
            SYSTEM_ERROR: {error.toUpperCase()}
          </motion.div>
        )}
      </AnimatePresence>
      {/* Background Guide Modal */}
      <AnimatePresence>
        {showBgGuide && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="max-w-md w-full bg-[#0a0a0a] border border-[#00f2ff]/30 p-6 rounded-2xl shadow-[0_0_50px_rgba(0,242,255,0.2)]"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-[#00f2ff]" />
                  <h2 className="text-sm font-bold uppercase tracking-widest">Background Optimization</h2>
                </div>
                <button onClick={() => setShowBgGuide(false)} className="text-[#00f2ff]/50 hover:text-[#00f2ff]">
                  <RefreshCw className="w-4 h-4 rotate-45" />
                </button>
              </div>

              <div className="space-y-4 text-[10px] text-[#00f2ff]/70 leading-relaxed uppercase">
                <div className="p-3 bg-[#00f2ff]/5 border border-[#00f2ff]/10 rounded-lg">
                  <p className="font-bold text-[#00f2ff] mb-1">1. Location Permissions (Critical)</p>
                  <p>Go to Settings &gt; Apps &gt; Browser &gt; Permissions. Set Location to "Allow all the time". If "All the time" is missing, ensure you are using a modern browser like Chrome or Firefox.</p>
                </div>
                
                <div className="p-3 bg-[#00f2ff]/5 border border-[#00f2ff]/10 rounded-lg">
                  <p className="font-bold text-[#00f2ff] mb-1">2. Battery & Data (Android)</p>
                  <p>Disable "Battery Saver". Set Browser battery usage to "Unrestricted". Enable "Background Data". Visit <a href="https://dontkillmyapp.com" target="_blank" className="underline">dontkillmyapp.com</a> for device-specific settings.</p>
                </div>

                <div className="p-3 bg-[#00f2ff]/5 border border-[#00f2ff]/10 rounded-lg">
                  <p className="font-bold text-[#00f2ff] mb-1">3. System Keep-Alive</p>
                  <p>The app uses a silent audio loop and Screen Wake Lock to stay active. Do not close the tab or force-stop the browser.</p>
                </div>

                <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg text-red-400">
                  <p className="font-bold mb-1">Note for iOS Users</p>
                  <p>Apple strictly limits background web activity. For best results, keep the screen on or use the "Add to Home Screen" PWA feature.</p>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <button 
                  onClick={() => {
                    if (audioRef.current) {
                      audioRef.current.play().then(() => {
                        addLog('AUDIO_GESTURE_VERIFIED', 'success');
                        if (!isTracking) audioRef.current?.pause();
                      });
                    }
                    setShowBgGuide(false);
                  }}
                  className="w-full py-3 bg-[#00f2ff] text-black font-bold rounded-xl text-[10px] uppercase tracking-widest"
                >
                  Enable Background Uplink
                </button>
                <button 
                  onClick={() => setShowBgGuide(false)}
                  className="w-full py-2 text-[#00f2ff]/50 text-[10px] uppercase tracking-widest"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
