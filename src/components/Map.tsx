import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Custom futuristic icon
const nexusIcon = L.divIcon({
  className: 'custom-nexus-icon',
  html: `<div class="w-4 h-4 bg-[#00f2ff] rounded-full border-2 border-white shadow-[0_0_10px_#00f2ff] animate-pulse"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

interface MapProps {
  locations: { lat: number; lng: number; id: string }[];
  history: { lat: number; lng: number }[];
  focusLocation?: { lat: number; lng: number } | null;
}

// Component to handle manual map controls
const MapControls = ({ focusLocation }: { focusLocation?: { lat: number; lng: number } | null }) => {
  const map = useMap();
  const [isLocked, setIsLocked] = React.useState(false);

  React.useEffect(() => {
    if (focusLocation && !isLocked) {
      map.setView([focusLocation.lat, focusLocation.lng], 15, { animate: true });
    }
  }, [focusLocation, map, isLocked]);

  return (
    <div className="leaflet-top leaflet-right flex flex-col gap-2" style={{ marginTop: '80px', marginRight: '10px' }}>
      <div className="leaflet-control leaflet-bar border-none bg-transparent flex flex-col gap-2">
        {/* Recenter Button */}
        <button 
          onClick={() => {
            if (focusLocation) {
              map.setView([focusLocation.lat, focusLocation.lng], 15, { animate: true });
            }
          }}
          className="bg-[#0a0a0a] text-[#00f2ff] p-2 hover:bg-[#00f2ff]/20 border border-[#00f2ff]/30 rounded shadow-lg flex items-center justify-center transition-all"
          title="RECENTER ON SELECTED"
          style={{ width: '34px', height: '34px', cursor: 'pointer' }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>

        {/* Lock Toggle */}
        <button 
          onClick={() => setIsLocked(!isLocked)}
          className={`p-2 border rounded shadow-lg flex items-center justify-center transition-all ${
            isLocked 
              ? 'bg-red-500/20 text-red-500 border-red-500/50' 
              : 'bg-[#0a0a0a] text-[#00f2ff] border-[#00f2ff]/30 hover:bg-[#00f2ff]/10'
          }`}
          title={isLocked ? "VIEW LOCKED" : "VIEW UNLOCKED"}
          style={{ width: '34px', height: '34px', cursor: 'pointer' }}
        >
          {isLocked ? (
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};

export const Map: React.FC<MapProps> = ({ locations, history, focusLocation }) => {
  const defaultCenter: [number, number] = focusLocation 
    ? [focusLocation.lat, focusLocation.lng]
    : locations.length > 0 
      ? [locations[0].lat, locations[0].lng] 
      : [20, 0];

  return (
    <div className="relative w-full aspect-[16/10] bg-[#050505] rounded-xl border border-[#00f2ff]/20 overflow-hidden z-0">
      <MapContainer 
        center={defaultCenter} 
        zoom={13} 
        scrollWheelZoom={true}
        className="w-full h-full"
        style={{ background: '#050505' }}
      >
        {/* Futuristic Dark Tiles */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        
        <MapControls focusLocation={focusLocation} />

        {/* History Path */}
        {history.length > 1 && (
          <Polyline 
            positions={history.map(h => [h.lat, h.lng])} 
            color="#00f2ff" 
            weight={2} 
            opacity={0.6}
            dashArray="5, 10"
          />
        )}

        {/* Device Markers */}
        {locations.map((loc) => (
          <Marker 
            key={loc.id} 
            position={[loc.lat, loc.lng]} 
            icon={nexusIcon}
          >
            <Popup className="futuristic-popup">
              <div className="bg-[#0a0a0a] text-[#00f2ff] p-2 font-mono text-xs border border-[#00f2ff]/30 rounded">
                <div className="font-bold border-b border-[#00f2ff]/20 mb-1 pb-1">{loc.id}</div>
                <div>LAT: {loc.lat.toFixed(6)}</div>
                <div>LNG: {loc.lng.toFixed(6)}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Radar Scanning Effect */}
        <div className="absolute inset-0 pointer-events-none z-[400] overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] border border-[#00f2ff]/5 rounded-full animate-[spin_10s_linear_infinite]" 
               style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgba(0, 242, 255, 0.05) 90deg, transparent 100deg)' }} />
        </div>
      </MapContainer>

      {/* Futuristic Overlay Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-10 z-[400]" 
           style={{ backgroundImage: 'linear-gradient(#00f2ff 1px, transparent 1px), linear-gradient(90deg, #00f2ff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      
      <style>{`
        .leaflet-container {
          background: #050505 !important;
        }
        .leaflet-popup-content-wrapper, .leaflet-popup-tip {
          background: #0a0a0a !important;
          color: #00f2ff !important;
          border: 1px solid rgba(0, 242, 255, 0.3);
          border-radius: 8px;
        }
        .leaflet-popup-content {
          margin: 8px;
        }
        .leaflet-control-zoom-in, .leaflet-control-zoom-out {
          background: #0a0a0a !important;
          color: #00f2ff !important;
          border: 1px solid rgba(0, 242, 255, 0.3) !important;
        }
        .leaflet-control-attribution {
          background: rgba(0, 0, 0, 0.7) !important;
          color: rgba(0, 242, 255, 0.4) !important;
        }
        .leaflet-control-attribution a {
          color: rgba(0, 242, 255, 0.6) !important;
        }
      `}</style>
    </div>
  );
};
