import React, { useEffect, useState, useMemo, useRef } from 'react';
import { 
  MapContainer, 
  TileLayer, 
  Marker, 
  Popup, 
  Polyline, 
  Circle, 
  useMap 
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DeviceMember, SafeZone, HistoryPoint } from '../types';
import { formatRelativeTime, formatSpeed } from '../utils/geo';
import { offlineMapManager, OfflineProgress } from '../utils/offlineMapManager';
import { 
  Crosshair, 
  Users,
  Navigation, 
  Layers, 
  Battery, 
  BatteryCharging, 
  AlertTriangle,
  MapPin,
  Radio,
  Video,
  Download,
  WifiOff,
  HardDriveDownload,
  CheckCircle2,
  Trash2,
  RefreshCw,
  X
} from 'lucide-react';

interface MapProps {
  members: DeviceMember[];
  selectedMember: DeviceMember | null;
  onSelectMember: (member: DeviceMember) => void;
  onNavigateMember: (member: DeviceMember) => void;
  safeZones: SafeZone[];
  history: HistoryPoint[];
  currentUserId?: string;
  focusLocation?: { lat: number; lng: number } | null;
  theme?: 'light' | 'dark' | 'midnight';
  currentCoords?: { lat: number; lng: number } | null;
  accuracy?: number;
  currentUser?: DeviceMember | null;
  onOpenRadio?: (member: DeviceMember) => void;
  onStartVideoCall?: (member: DeviceMember) => void;
}

// Tile Layer Providers
const TILE_LAYERS = {
  streets: {
    name: 'Streets',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap'
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri'
  },
  dark: {
    name: 'Voyager',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO'
  }
};

// Memoized icon cache to prevent DOM thrashing
const iconCache = new globalThis.Map<string, L.DivIcon>();

function getMemoizedFamilyIcon(
  member: DeviceMember,
  isSelected: boolean,
  isCurrentUser: boolean
): L.DivIcon {
  const avatar = member.avatar || (member.name ? member.name.charAt(0).toUpperCase() : '👤');
  const isSos = Boolean(member.isSosActive);
  const isOnline = Date.now() - (member.lastUpdated?.toMillis?.() || new Date(member.lastUpdated).getTime() || 0) < 180000;
  const batteryKey = member.battery !== undefined ? member.battery : -1;
  const chargingKey = Boolean(member.isCharging);

  const cacheKey = `${member.id}_${isSelected}_${isCurrentUser}_${isSos}_${isOnline}_${batteryKey}_${chargingKey}_${avatar}`;

  if (iconCache.has(cacheKey)) {
    return iconCache.get(cacheKey)!;
  }

  const borderColor = isSos 
    ? '#ef4444' 
    : isSelected 
      ? '#3b82f6' 
      : isCurrentUser 
        ? '#10b981' 
        : '#6366f1';

  const pulseEffect = isSos
    ? '<div class="absolute -inset-2 rounded-full bg-red-500/40 animate-ping"></div>'
    : isSelected
      ? '<div class="absolute -inset-1 rounded-full bg-blue-500/30"></div>'
      : isCurrentUser
        ? '<div class="absolute -inset-1.5 rounded-full bg-emerald-500/35 animate-pulse"></div>'
        : '';

  const statusBadge = isSos
    ? '<div class="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center text-[9px] text-white font-bold border-2 border-white">!</div>'
    : member.isCharging
      ? '<div class="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 rounded-full flex items-center justify-center text-[8px] text-white border border-white">⚡</div>'
      : isOnline || isCurrentUser
        ? '<div class="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white"></div>'
        : '';

  const displayName = isCurrentUser ? `${member.name || 'You'} (You)` : (member.name || 'Member');
  const badgeBg = isCurrentUser ? 'bg-emerald-700' : 'bg-slate-900/85';

  const html = `
    <div class="relative group cursor-pointer flex flex-col items-center select-none" style="will-change: transform;">
      ${pulseEffect}
      <div 
        class="w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center text-lg font-bold border-2"
        style="border-color: ${borderColor};"
      >
        <span>${avatar}</span>
        ${statusBadge}
      </div>
      <div class="mt-1 px-2.5 py-0.5 ${badgeBg} backdrop-blur-xs text-white text-[10px] font-bold rounded-full shadow-sm whitespace-nowrap pointer-events-none flex items-center gap-1 border border-white/20">
        <span>${displayName}</span>
        ${member.battery !== undefined ? `<span class="opacity-80">(${member.battery}%)</span>` : ''}
      </div>
    </div>
  `;

  const icon = L.divIcon({
    className: 'custom-family-marker',
    html,
    iconSize: [44, 56],
    iconAnchor: [22, 28],
    popupAnchor: [0, -30]
  });

  iconCache.set(cacheKey, icon);
  return icon;
}

// Controller for bounds fitting and centering without overriding user zoom
function MapViewController({
  members,
  focusLocation,
  triggerFitAll
}: {
  members: DeviceMember[];
  focusLocation?: { lat: number; lng: number } | null;
  triggerFitAll: number;
}) {
  const map = useMap();
  const lastFocusRef = useRef<string>('');
  const lastFitTriggerRef = useRef<number>(0);
  const userInteractedRef = useRef<boolean>(false);

  // Detect when user manually zooms or drags the map
  useEffect(() => {
    const onUserInteract = (e: any) => {
      if (e?.originalEvent) {
        userInteractedRef.current = true;
      }
    };
    map.on('movestart', onUserInteract);
    map.on('zoomstart', onUserInteract);
    return () => {
      map.off('movestart', onUserInteract);
      map.off('zoomstart', onUserInteract);
    };
  }, [map]);

  // Focus location changes (preserves user zoom level!)
  useEffect(() => {
    if (!focusLocation || isNaN(focusLocation.lat) || isNaN(focusLocation.lng)) return;

    const coordKey = `${focusLocation.lat.toFixed(4)},${focusLocation.lng.toFixed(4)}`;
    if (coordKey === lastFocusRef.current) return;
    lastFocusRef.current = coordKey;

    // Reset user interaction when an explicit focus target is given
    userInteractedRef.current = false;

    try {
      const currentZoom = Math.max(map.getZoom() || 15, 14);
      map.setView([focusLocation.lat, focusLocation.lng], currentZoom, { animate: false });
    } catch {}
  }, [focusLocation?.lat, focusLocation?.lng, map]);

  // Fit all markers ONLY when triggerFitAll is explicitly clicked
  useEffect(() => {
    if (triggerFitAll === 0 || triggerFitAll === lastFitTriggerRef.current) return;
    lastFitTriggerRef.current = triggerFitAll;
    userInteractedRef.current = false;

    if (members.length === 0) return;

    try {
      if (members.length === 1) {
        const currentZoom = Math.max(map.getZoom() || 15, 14);
        map.setView([members[0].lastLat, members[0].lastLng], currentZoom, { animate: false });
        return;
      }
      const bounds = L.latLngBounds(members.map(m => [m.lastLat, m.lastLng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16, animate: false });
    } catch {}
  }, [triggerFitAll]); // STRICTLY depend on triggerFitAll, never on members!

  // Invalidate map size on mount / window resize to guarantee full-screen render on mobile
  useEffect(() => {
    const handleResize = () => {
      try {
        map.invalidateSize();
      } catch {}
    };
    window.addEventListener('resize', handleResize);
    const t1 = setTimeout(handleResize, 150);
    const t2 = setTimeout(handleResize, 500);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [map]);

  return null;
}

// High-performance Offline-capable TileLayer for 10km cached map
function OfflineTileLayer({
  url,
  attribution,
  maxZoom = 19,
  maxNativeZoom = 16,
  activeLayer
}: {
  url: string;
  attribution: string;
  maxZoom?: number;
  maxNativeZoom?: number;
  activeLayer: string;
}) {
  const map = useMap();
  const layerRef = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    const CustomLayer = L.TileLayer.extend({
      createTile(coords: any, done: (err: any, tile: HTMLImageElement) => void) {
        const tile = document.createElement('img');
        L.DomEvent.on(tile, 'load', L.Util.bind((this as any)._tileOnLoad, this, done, tile));
        L.DomEvent.on(tile, 'error', L.Util.bind((this as any)._tileOnError, this, done, tile));

        if (this.options.crossOrigin || this.options.crossOrigin === '') {
          tile.crossOrigin = this.options.crossOrigin === true ? '' : this.options.crossOrigin;
        }
        tile.alt = '';
        tile.setAttribute('role', 'presentation');

        const defaultUrl = this.getTileUrl(coords);

        if (activeLayer === 'streets') {
          offlineMapManager.getTileBlobUrl(coords.z, coords.x, coords.y).then((blobUrl) => {
            if (blobUrl) {
              tile.src = blobUrl;
            } else {
              tile.src = defaultUrl;
            }
          }).catch(() => {
            tile.src = defaultUrl;
          });
        } else {
          tile.src = defaultUrl;
        }

        return tile;
      }
    });

    const layer = new (CustomLayer as any)(url, {
      attribution,
      maxZoom,
      maxNativeZoom,
      subdomains: ['a', 'b', 'c']
    });

    layer.addTo(map);
    layerRef.current = layer;

    const unsub = offlineMapManager.subscribe((prog) => {
      if (prog.isComplete && layerRef.current) {
        try {
          layerRef.current.redraw();
        } catch {}
      }
    });

    return () => {
      unsub();
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, url, attribution, maxZoom, maxNativeZoom, activeLayer]);

  return null;
}

export const Map: React.FC<MapProps> = ({
  members,
  selectedMember,
  onSelectMember,
  onNavigateMember,
  safeZones,
  history,
  currentUserId,
  focusLocation,
  currentCoords,
  accuracy,
  currentUser,
  onOpenRadio,
  onStartVideoCall
}) => {
  const [activeLayer, setActiveLayer] = useState<'streets' | 'satellite' | 'dark'>('streets');
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [triggerFit, setTriggerFit] = useState(0);

  // Offline Map State
  const [offlineProgress, setOfflineProgress] = useState<OfflineProgress>(() => offlineMapManager.getProgress());
  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [showOfflineModal, setShowOfflineModal] = useState<boolean>(false);

  // Home location determination for offline map
  const homeLocation = useMemo(() => {
    const hz = safeZones.find(z => 
      z.id === 'zone-home' || 
      z.name.toLowerCase().includes('home') || 
      z.icon === '🏠'
    );
    if (hz && typeof hz.lat === 'number' && typeof hz.lng === 'number' && hz.lat !== 0) {
      return { lat: hz.lat, lng: hz.lng, name: hz.name };
    }
    if (safeZones.length > 0 && typeof safeZones[0].lat === 'number' && typeof safeZones[0].lng === 'number' && safeZones[0].lat !== 0) {
      return { lat: safeZones[0].lat, lng: safeZones[0].lng, name: safeZones[0].name };
    }
    if (currentCoords?.lat && currentCoords?.lng) {
      return { lat: currentCoords.lat, lng: currentCoords.lng, name: 'Home' };
    }
    return null;
  }, [safeZones, currentCoords]);

  // Network & Offline Manager listener
  useEffect(() => {
    const unsub = offlineMapManager.subscribe(setOfflineProgress);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      unsub();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Compute default center once upon mounting
  const defaultCenter = useMemo<[number, number]>(() => {
    if (focusLocation) return [focusLocation.lat, focusLocation.lng];
    if (selectedMember) return [selectedMember.lastLat, selectedMember.lastLng];
    return [19.0760, 72.8777];
  }, []);

  return (
    <div className="relative w-full h-full min-h-[300px] rounded-none lg:rounded-3xl overflow-hidden shadow-none lg:shadow-xs border-0 lg:border lg:border-slate-200/90 dark:lg:border-slate-800 bg-slate-100 dark:bg-slate-900 z-0">
      <MapContainer
        center={defaultCenter}
        zoom={14}
        scrollWheelZoom={true}
        preferCanvas={true}
        className="w-full h-full min-h-[380px]"
        zoomControl={false}
      >
        {/* Offline-Enabled Active Tile Layer */}
        <OfflineTileLayer
          attribution={TILE_LAYERS[activeLayer].attribution}
          url={TILE_LAYERS[activeLayer].url}
          maxZoom={19}
          maxNativeZoom={16}
          activeLayer={activeLayer}
        />

        <MapViewController
          members={members}
          focusLocation={focusLocation}
          triggerFitAll={triggerFit}
        />

        {/* Safe Zones Geofences */}
        {safeZones.map(zone => (
          <React.Fragment key={zone.id}>
            <Circle
              center={[zone.lat, zone.lng]}
              radius={zone.radius}
              pathOptions={{
                color: '#10b981',
                fillColor: '#10b981',
                fillOpacity: 0.12,
                weight: 2,
                dashArray: '4, 6'
              }}
            >
              <Popup className="zone-popup">
                <div className="p-2 text-slate-800 dark:text-white font-sans text-xs">
                  <div className="font-bold flex items-center gap-1.5 text-sm">
                    <span>{zone.icon}</span>
                    <span>{zone.name}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Radius: {zone.radius}m
                  </div>
                </div>
              </Popup>
            </Circle>
          </React.Fragment>
        ))}

        {/* Selected Member Travel History Line */}
        {history.length > 1 && (
          <Polyline
            positions={history.map(h => [h.lat, h.lng])}
            color="#3b82f6"
            weight={3.5}
            opacity={0.75}
            dashArray="5, 8"
          />
        )}

        {/* Live GPS Accuracy Halo around User's Real Location */}
        {currentCoords && (
          <Circle
            center={[currentCoords.lat, currentCoords.lng]}
            radius={Math.max(accuracy || 30, 25)}
            pathOptions={{
              color: '#10b981',
              fillColor: '#34d399',
              fillOpacity: 0.16,
              weight: 1.5,
              dashArray: '4, 6'
            }}
          />
        )}

        {/* Fallback Live User Pin if members list hasn't populated yet */}
        {currentCoords && !members.some(m => m.id === currentUserId || (Boolean(currentUserId) && (currentUserId.includes(m.id) || m.id.includes(currentUserId)))) && (
          <Marker
            position={[currentCoords.lat, currentCoords.lng]}
            icon={L.divIcon({
              className: 'custom-live-user-marker',
              html: `
                <div class="relative flex flex-col items-center select-none" style="will-change: transform;">
                  <div class="absolute -inset-2 rounded-full bg-emerald-500/40 animate-ping"></div>
                  <div class="w-10 h-10 rounded-full bg-white border-2 border-emerald-500 shadow-lg flex items-center justify-center text-lg">
                    <span>${currentUser?.avatar || '📍'}</span>
                    <div class="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white"></div>
                  </div>
                  <div class="mt-1 px-2.5 py-0.5 bg-emerald-700 text-white text-[10px] font-bold rounded-full shadow border border-white/20 whitespace-nowrap">
                    ${currentUser?.name || 'You'} (Live GPS)
                  </div>
                </div>
              `,
              iconSize: [44, 56],
              iconAnchor: [22, 28]
            })}
          />
        )}

        {/* Family Member Markers */}
        {members.map(member => {
          const isSelected = selectedMember?.id === member.id;
          const isCurrentUser = member.id === currentUserId || (Boolean(currentUserId) && (currentUserId.includes(member.id) || member.id.includes(currentUserId)));
          const icon = getMemoizedFamilyIcon(member, isSelected, isCurrentUser);

          return (
            <Marker
              key={member.id}
              position={[member.lastLat, member.lastLng]}
              icon={icon}
              eventHandlers={{
                click: () => onSelectMember(member)
              }}
            >
              <Popup className="member-popup" closeButton={false}>
                <div className="p-3 text-slate-800 dark:text-slate-100 font-sans min-w-[200px]">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{member.avatar || '👤'}</span>
                      <div>
                        <h4 className="font-bold text-sm leading-tight">{member.name}</h4>
                        {member.role && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-medium">
                            {member.role}
                          </span>
                        )}
                      </div>
                    </div>
                    {isCurrentUser && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 font-semibold px-2 py-0.5 rounded-full">
                        You
                      </span>
                    )}
                  </div>

                  {member.isSosActive && (
                    <div className="my-2 p-2 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-600 dark:text-red-400 text-xs font-bold animate-pulse">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>SOS ACTIVE!</span>
                    </div>
                  )}

                  <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {member.currentPlace ? (
                      <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>At {member.currentPlace}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Navigation className="w-3.5 h-3.5 text-slate-400" />
                        <span>{formatSpeed(member.speed)}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1">
                        {member.isCharging ? (
                          <BatteryCharging className="w-3.5 h-3.5 text-amber-500" />
                        ) : (
                          <Battery className="w-3.5 h-3.5 text-emerald-500" />
                        )}
                        <span>{member.battery ?? '--'}%</span>
                      </div>
                      {(() => {
                        const timeStr = formatRelativeTime(member.lastUpdated);
                        return timeStr === 'Live' ? (
                          <span className="text-[11px] inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Live
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            {timeStr}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Fast Comms & Directions Buttons */}
                  <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
                    {onOpenRadio && !isCurrentUser && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenRadio(member);
                        }}
                        className="p-1.5 px-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 hover:bg-blue-100 transition-colors"
                        title="Walkie-Talkie Radio"
                      >
                        <Radio className="w-3.5 h-3.5" />
                        <span>Radio</span>
                      </button>
                    )}
                    {onStartVideoCall && !isCurrentUser && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onStartVideoCall(member);
                        }}
                        className="p-1.5 px-2 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 hover:bg-emerald-100 transition-colors"
                        title="Video Call"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Video</span>
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigateMember(member);
                      }}
                      className="flex-1 py-1.5 px-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors shadow-xs"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Directions</span>
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Floating Offline Map Status (Top Left) */}
      <div className="absolute top-14 lg:top-3 left-3 z-[400] flex items-center gap-2">
        {offlineProgress.isDownloading ? (
          <button
            onClick={() => setShowOfflineModal(true)}
            className="flex items-center gap-2 px-3 py-1 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-full shadow-md border border-indigo-200 dark:border-indigo-800 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-white transition-all cursor-pointer"
            title="Downloading 10km Offline Map"
          >
            <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="text-[11px]">Caching 10km: {offlineProgress.percent}%</span>
            <div className="w-10 h-1.5 bg-indigo-100 dark:bg-indigo-950 rounded-full overflow-hidden">
              <div 
                className="h-full bg-indigo-600 transition-all duration-300 ease-out"
                style={{ width: `${offlineProgress.percent}%` }}
              />
            </div>
          </button>
        ) : !isOnline ? (
          <button
            onClick={() => setShowOfflineModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500 text-white backdrop-blur-md rounded-full shadow-md text-xs font-bold hover:bg-amber-600 transition-colors cursor-pointer"
            title="Offline Mode Active - Using 10km Cached Map"
          >
            <WifiOff className="w-3.5 h-3.5" />
            <span className="text-[11px]">Offline Mode (10km Active)</span>
          </button>
        ) : offlineProgress.isComplete ? (
          <button
            onClick={() => setShowOfflineModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-white/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-300 backdrop-blur-md rounded-full shadow-xs border border-slate-200/90 dark:border-slate-800 text-[11px] font-medium hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer"
            title="10km Home Map Cached Offline"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
            <HardDriveDownload className="w-3.5 h-3.5 text-emerald-500" />
            <span className="hidden sm:inline">10km Offline Ready</span>
            <span className="sm:hidden text-[10px]">10km Ready</span>
          </button>
        ) : homeLocation ? (
          <button
            onClick={() => {
              if (homeLocation) {
                offlineMapManager.downloadArea(homeLocation.lat, homeLocation.lng, 10, homeLocation.name);
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-white/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-300 backdrop-blur-md rounded-full shadow-xs border border-slate-200/90 dark:border-slate-800 text-[11px] font-medium hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Download 10km Home Area for Offline Use"
          >
            <Download className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden sm:inline">Cache 10km Map</span>
            <span className="sm:hidden text-[10px]">Cache Map</span>
          </button>
        ) : null}
      </div>

      {/* Floating Controls Bar (Top Right) */}
      <div className="absolute top-16 lg:top-3 right-3 z-[400] flex flex-col gap-2">
        {/* Layer Switcher */}
        <div className="relative">
          <button
            onClick={() => setShowLayerMenu(prev => !prev)}
            className="w-9 h-9 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xs text-slate-700 dark:text-slate-200 rounded-xl shadow-md border border-slate-200/80 dark:border-slate-700 flex items-center justify-center hover:bg-white transition-all active:scale-95"
            title="Choose Map Style"
          >
            <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </button>

          {showLayerMenu && (
            <>
              {/* Invisible click-outside dismiss backdrop */}
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowLayerMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1.5 flex flex-col bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-1.5 gap-1 min-w-[150px] z-50 animate-fade-in">
                <button
                  onClick={() => {
                    setActiveLayer('streets');
                    setShowLayerMenu(false);
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold text-left transition-colors flex items-center gap-2 ${
                    activeLayer === 'streets' 
                      ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold' 
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                  }`}
                >
                  <span>🗺️</span>
                  <span>Streets (Offline)</span>
                </button>
                <button
                  onClick={() => {
                    setActiveLayer('satellite');
                    setShowLayerMenu(false);
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold text-left transition-colors flex items-center gap-2 ${
                    activeLayer === 'satellite' 
                      ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold' 
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                  }`}
                >
                  <span>🛰️</span>
                  <span>Satellite</span>
                </button>
                <button
                  onClick={() => {
                    setActiveLayer('dark');
                    setShowLayerMenu(false);
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold text-left transition-colors flex items-center gap-2 ${
                    activeLayer === 'dark' 
                      ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold' 
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                  }`}
                >
                  <span>🌙</span>
                  <span>Voyager</span>
                </button>

                <div className="border-t border-slate-100 dark:border-slate-700/80 my-1 pt-1">
                  <button
                    onClick={() => {
                      setShowLayerMenu(false);
                      setShowOfflineModal(true);
                    }}
                    className="w-full px-3 py-1.5 rounded-xl text-xs font-semibold text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors flex items-center gap-2"
                  >
                    <HardDriveDownload className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Offline Maps</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Fit All Members */}
        <button
          onClick={() => setTriggerFit(prev => prev + 1)}
          className="w-9 h-9 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xs text-slate-700 dark:text-slate-200 rounded-xl shadow-md border border-slate-200/80 dark:border-slate-700 flex items-center justify-center hover:bg-white transition-all active:scale-95"
          title="Fit All Family Members in View"
        >
          <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
        </button>
      </div>

      {/* Floating Active Members Badge (Bottom Left) */}
      <div className="hidden lg:flex absolute bottom-3 left-3 z-[400] items-center gap-2 px-3 py-1 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs border border-slate-200/80 dark:border-slate-700 rounded-full shadow-xs text-xs text-slate-700 dark:text-slate-300 font-medium pointer-events-none">
        <span className="relative flex h-2 w-2">
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span>{members.length} {members.length === 1 ? 'member' : 'members'} online</span>
      </div>

      {/* Offline Map Details & Control Modal */}
      {showOfflineModal && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 text-slate-800 dark:text-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <HardDriveDownload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Offline Map Cache</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">10 km radius around Home</p>
                </div>
              </div>
              <button
                onClick={() => setShowOfflineModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Home Location:</span>
                  <span className="font-semibold">{homeLocation?.name || 'Default Home'}</span>
                </div>
                {homeLocation && (
                  <div className="flex justify-between items-center text-[11px] text-slate-400">
                    <span>Coordinates:</span>
                    <span>{homeLocation.lat.toFixed(4)}, {homeLocation.lng.toFixed(4)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Coverage Radius:</span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">10 km (~314 km²)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Offline Status:</span>
                  {offlineProgress.isDownloading ? (
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 animate-pulse">
                      Downloading {offlineProgress.percent}% ({offlineProgress.completed}/{offlineProgress.total} tiles)
                    </span>
                  ) : offlineProgress.isComplete ? (
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Ready Offline ({offlineProgress.completed || offlineProgress.total} tiles)
                    </span>
                  ) : (
                    <span className="font-medium text-amber-500">Not Downloaded</span>
                  )}
                </div>

                {offlineProgress.isDownloading && (
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-2">
                    <div 
                      className="h-full bg-indigo-600 transition-all duration-300"
                      style={{ width: `${offlineProgress.percent}%` }}
                    />
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                When you enter a room or circle, Nexus Tracker automatically caches a 10 km radius around your Home location so that you can view roads, landmarks, and family members even without internet or cellular reception.
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={() => {
                  if (homeLocation) {
                    offlineMapManager.downloadArea(homeLocation.lat, homeLocation.lng, 10, homeLocation.name);
                  }
                }}
                disabled={offlineProgress.isDownloading || !homeLocation}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${offlineProgress.isDownloading ? 'animate-spin' : ''}`} />
                <span>{offlineProgress.isDownloading ? 'Downloading...' : 'Re-download 10km Area Now'}</span>
              </button>

              <button
                onClick={() => {
                  offlineMapManager.clearCache();
                }}
                disabled={offlineProgress.isDownloading}
                className="w-full py-2 px-4 bg-slate-100 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-950/40 text-slate-600 hover:text-red-600 dark:text-slate-300 dark:hover:text-red-400 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Offline Map Cache</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
