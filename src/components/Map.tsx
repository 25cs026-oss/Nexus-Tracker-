import React, { useEffect, useState, useMemo } from 'react';
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
import { formatRelativeTime, formatSpeed, getDirectionsUrl } from '../utils/geo';
import { 
  Crosshair, 
  Navigation, 
  Layers, 
  Battery, 
  BatteryCharging, 
  AlertTriangle,
  ExternalLink,
  MapPin
} from 'lucide-react';

interface MapProps {
  members: DeviceMember[];
  selectedMember: DeviceMember | null;
  onSelectMember: (member: DeviceMember) => void;
  safeZones: SafeZone[];
  history: HistoryPoint[];
  currentUserId?: string;
  focusLocation?: { lat: number; lng: number } | null;
  theme?: 'light' | 'dark' | 'midnight';
}

// Tile Layer Providers
const TILE_LAYERS = {
  streets: {
    name: 'Streets',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye'
  },
  dark: {
    name: 'Modern Dark',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO'
  }
};

// Creates a rich custom HTML Leaflet marker for a family member
function createFamilyMarkerIcon(
  member: DeviceMember, 
  isSelected: boolean,
  isCurrentUser: boolean
) {
  const avatar = member.avatar || (member.name ? member.name.charAt(0).toUpperCase() : '👤');
  const isSos = member.isSosActive;
  const isOnline = Date.now() - (member.lastUpdated?.toMillis?.() || new Date(member.lastUpdated).getTime() || 0) < 180000;

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
      ? '<div class="absolute -inset-1.5 rounded-full bg-blue-500/30 animate-pulse"></div>'
      : '';

  const statusBadge = isSos
    ? '<div class="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center text-[9px] text-white font-bold border-2 border-white">!</div>'
    : member.isCharging
      ? '<div class="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 rounded-full flex items-center justify-center text-[8px] text-white border border-white">⚡</div>'
      : isOnline
        ? '<div class="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white"></div>'
        : '';

  const html = `
    <div class="relative group cursor-pointer flex flex-col items-center">
      ${pulseEffect}
      <div 
        class="w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center text-lg font-bold border-2 transition-transform transform hover:scale-110"
        style="border-color: ${borderColor}; box-shadow: 0 4px 14px rgba(0,0,0,0.25);"
      >
        <span class="select-none">${avatar}</span>
        ${statusBadge}
      </div>
      <div class="mt-1 px-2 py-0.5 bg-slate-900/85 backdrop-blur-sm text-white text-[10px] font-semibold rounded-full shadow-md whitespace-nowrap pointer-events-none flex items-center gap-1 border border-white/20">
        <span>${member.name || 'Member'}</span>
        ${member.battery !== undefined ? `<span class="text-[9px] opacity-80">(${member.battery}%)</span>` : ''}
      </div>
    </div>
  `;

  return L.divIcon({
    className: 'custom-family-marker',
    html,
    iconSize: [44, 60],
    iconAnchor: [22, 30],
    popupAnchor: [0, -32]
  });
}

// Controller for bounds fitting and centering
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

  // Smooth pan/zoom when focusLocation changes
  useEffect(() => {
    if (focusLocation && !isNaN(focusLocation.lat) && !isNaN(focusLocation.lng)) {
      map.setView([focusLocation.lat, focusLocation.lng], 16, { animate: true, duration: 1 });
    }
  }, [focusLocation, map]);

  // Fit all markers when requested or on initial load with members
  useEffect(() => {
    if (members.length === 0) return;

    if (members.length === 1) {
      map.setView([members[0].lastLat, members[0].lastLng], 15, { animate: true });
      return;
    }

    const bounds = L.latLngBounds(members.map(m => [m.lastLat, m.lastLng]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16, animate: true });
  }, [triggerFitAll, map]);

  return null;
}

export const Map: React.FC<MapProps> = ({
  members,
  selectedMember,
  onSelectMember,
  safeZones,
  history,
  currentUserId,
  focusLocation,
  theme = 'light'
}) => {
  const [activeLayer, setActiveLayer] = useState<'streets' | 'satellite' | 'dark'>('streets');
  const [triggerFit, setTriggerFit] = useState(0);

  // Compute default center
  const defaultCenter = useMemo<[number, number]>(() => {
    if (focusLocation) return [focusLocation.lat, focusLocation.lng];
    if (selectedMember) return [selectedMember.lastLat, selectedMember.lastLng];
    if (members.length > 0) return [members[0].lastLat, members[0].lastLng];
    return [37.7749, -122.4194]; // Default friendly city center
  }, []);

  return (
    <div className="relative w-full h-full min-h-[420px] rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 z-0">
      <MapContainer
        center={defaultCenter}
        zoom={14}
        scrollWheelZoom={true}
        className="w-full h-full min-h-[420px]"
        zoomControl={false}
      >
        {/* Active Tile Layer */}
        <TileLayer
          attribution={TILE_LAYERS[activeLayer].attribution}
          url={TILE_LAYERS[activeLayer].url}
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
                fillOpacity: 0.15,
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
                    Safe Zone Radius: {zone.radius}m
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
            weight={4}
            opacity={0.8}
            dashArray="6, 8"
          />
        )}

        {/* Family Member Markers */}
        {members.map(member => {
          const isSelected = selectedMember?.id === member.id;
          const isCurrentUser = member.id === currentUserId;
          const icon = createFamilyMarkerIcon(member, isSelected, isCurrentUser);

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
                <div className="p-3 text-slate-800 dark:text-slate-100 font-sans min-w-[210px]">
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
                      <span>EMERGENCY SOS ALERT!</span>
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
                      <span className="text-[11px] text-slate-400">
                        {formatRelativeTime(member.lastUpdated)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex gap-2">
                    <a
                      href={getDirectionsUrl(member.lastLat, member.lastLng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors shadow-sm"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Directions</span>
                      <ExternalLink className="w-3 h-3 ml-0.5 opacity-70" />
                    </a>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Floating Floating Controls Bar (Top Right) */}
      <div className="absolute top-4 right-4 z-[400] flex flex-col gap-2">
        {/* Layer Switcher */}
        <div className="relative group">
          <button
            className="w-10 h-10 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm text-slate-700 dark:text-slate-200 rounded-xl shadow-lg border border-slate-200/80 dark:border-slate-700 flex items-center justify-center hover:bg-white transition-all hover:scale-105"
            title="Change Map Style"
          >
            <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </button>
          <div className="absolute right-0 top-12 hidden group-hover:flex flex-col bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-1.5 gap-1 min-w-[130px] z-50">
            <button
              onClick={() => setActiveLayer('streets')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium text-left transition-colors ${
                activeLayer === 'streets' 
                  ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold' 
                  : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300'
              }`}
            >
              🗺️ Standard
            </button>
            <button
              onClick={() => setActiveLayer('satellite')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium text-left transition-colors ${
                activeLayer === 'satellite' 
                  ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold' 
                  : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300'
              }`}
            >
              🛰️ Satellite
            </button>
            <button
              onClick={() => setActiveLayer('dark')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium text-left transition-colors ${
                activeLayer === 'dark' 
                  ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold' 
                  : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300'
              }`}
            >
              🌙 Voyager
            </button>
          </div>
        </div>

        {/* Fit All Members */}
        <button
          onClick={() => setTriggerFit(prev => prev + 1)}
          className="w-10 h-10 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm text-slate-700 dark:text-slate-200 rounded-xl shadow-lg border border-slate-200/80 dark:border-slate-700 flex items-center justify-center hover:bg-white transition-all hover:scale-105"
          title="Fit All Family Members"
        >
          <Crosshair className="w-5 h-5 text-slate-700 dark:text-slate-200" />
        </button>
      </div>

      {/* Floating Active Members Badge (Bottom Left) */}
      <div className="absolute bottom-4 left-4 z-[400] flex items-center gap-2 px-3 py-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-700 rounded-full shadow-md text-xs text-slate-700 dark:text-slate-300 font-medium pointer-events-none">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
        </span>
        <span>{members.length} {members.length === 1 ? 'member' : 'members'} online</span>
      </div>
    </div>
  );
};
