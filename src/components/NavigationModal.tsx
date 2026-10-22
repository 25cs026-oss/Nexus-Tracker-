import React from 'react';
import { DeviceMember } from '../types';
import { 
  formatDistance, 
  calculateDistanceMeters, 
  estimateTravelTime, 
  getGoogleMapsUrl, 
  getAppleMapsUrl, 
  getOsmUrl, 
  openExternalMap 
} from '../utils/geo';
import { 
  Navigation, 
  X, 
  MapPin, 
  ExternalLink, 
  Car, 
  Footprints, 
  Compass, 
  Crosshair 
} from 'lucide-react';

interface NavigationModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetMember: DeviceMember | null;
  currentCoords: { lat: number; lng: number } | null;
  onFocusMap: (member: DeviceMember) => void;
}

export const NavigationModal: React.FC<NavigationModalProps> = ({
  isOpen,
  onClose,
  targetMember,
  currentCoords,
  onFocusMap
}) => {
  if (!isOpen || !targetMember) return null;

  // Calculate distance
  const distanceMeters = currentCoords
    ? calculateDistanceMeters(
        currentCoords.lat,
        currentCoords.lng,
        targetMember.lastLat,
        targetMember.lastLng
      )
    : null;

  const travelTime = distanceMeters !== null ? estimateTravelTime(distanceMeters) : null;

  const handleInAppFocus = () => {
    onFocusMap(targetMember);
    onClose();
  };

  const handleOpenGoogle = () => {
    openExternalMap(getGoogleMapsUrl(targetMember.lastLat, targetMember.lastLng));
    onClose();
  };

  const handleOpenApple = () => {
    openExternalMap(getAppleMapsUrl(targetMember.lastLat, targetMember.lastLng));
    onClose();
  };

  const handleOpenOsm = () => {
    openExternalMap(getOsmUrl(targetMember.lastLat, targetMember.lastLng));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-sm w-full p-5 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Navigation className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
              Directions to {targetMember.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Member Preview Card */}
        <div className="my-3.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl p-1.5 bg-white dark:bg-slate-800 rounded-xl shadow-xs">
              {targetMember.avatar || '👤'}
            </span>
            <div>
              <div className="font-bold text-xs text-slate-800 dark:text-slate-100">
                {targetMember.name}
              </div>
              <div className="text-[11px] text-slate-500">
                {targetMember.currentPlace ? `At ${targetMember.currentPlace}` : `${targetMember.lastLat.toFixed(4)}, ${targetMember.lastLng.toFixed(4)}`}
              </div>
            </div>
          </div>

          {distanceMeters !== null && (
            <div className="text-right">
              <div className="text-xs font-extrabold text-blue-600 dark:text-blue-400">
                {formatDistance(distanceMeters)}
              </div>
              <div className="text-[10px] text-slate-400">away</div>
            </div>
          )}
        </div>

        {/* Travel Time Estimates */}
        {travelTime && (
          <div className="grid grid-cols-2 gap-2 mb-3.5">
            <div className="p-2.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100/60 dark:border-blue-900/40 flex items-center gap-2">
              <Car className="w-4 h-4 text-blue-500" />
              <div>
                <div className="text-[10px] text-slate-500 font-medium">Drive</div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{travelTime.driving}</div>
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-100/60 dark:border-emerald-900/40 flex items-center gap-2">
              <Footprints className="w-4 h-4 text-emerald-500" />
              <div>
                <div className="text-[10px] text-slate-500 font-medium">Walk</div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{travelTime.walking}</div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2">
          {/* 1. Fast In-app Focus */}
          <button
            onClick={handleInAppFocus}
            className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-98"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Focus on In-App Map (Instant)</span>
          </button>

          {/* 2. External Maps */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              External Navigation Apps
            </div>
            <button
              onClick={handleOpenGoogle}
              className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2">
                <span>🗺️</span>
                <span>Google Maps</span>
              </div>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </button>

            <button
              onClick={handleOpenApple}
              className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2">
                <span>🍏</span>
                <span>Apple Maps</span>
              </div>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </button>

            <button
              onClick={handleOpenOsm}
              className="w-full py-2 px-3 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-[11px] font-medium flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2">
                <Compass className="w-3.5 h-3.5 text-emerald-500" />
                <span>OpenStreetMap (Lightweight)</span>
              </div>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
