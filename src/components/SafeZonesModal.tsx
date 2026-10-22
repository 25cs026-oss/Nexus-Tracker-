import React, { useState } from 'react';
import { SafeZone } from '../types';
import { MapPin, Plus, Trash2, X, Check, ShieldCheck } from 'lucide-react';

interface SafeZonesModalProps {
  isOpen: boolean;
  onClose: () => void;
  safeZones: SafeZone[];
  onAddZone: (zone: Omit<SafeZone, 'id'>) => Promise<void>;
  onDeleteZone: (zoneId: string) => Promise<void>;
  currentCoords?: { lat: number; lng: number } | null;
}

const EMOJI_OPTIONS = ['🏠', '🏫', '🏢', '🏡', '🏥', '🌳', '🛒', '⚽', '🏖️', '🍕', '🚗'];
const RADIUS_OPTIONS = [
  { label: '100m (House)', value: 100 },
  { label: '250m (Neighborhood)', value: 250 },
  { label: '500m (Campus / Park)', value: 500 },
  { label: '1000m (Town / Area)', value: 1000 }
];

export const SafeZonesModal: React.FC<SafeZonesModalProps> = ({
  isOpen,
  onClose,
  safeZones,
  onAddZone,
  onDeleteZone,
  currentCoords
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🏠');
  const [radius, setRadius] = useState(250);
  const [lat, setLat] = useState(currentCoords?.lat || 0);
  const [lng, setLng] = useState(currentCoords?.lng || 0);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleStartAdd = () => {
    if (currentCoords) {
      setLat(currentCoords.lat);
      setLng(currentCoords.lng);
    }
    setIsAdding(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      await onAddZone({
        name: name.trim(),
        icon,
        lat: Number(lat),
        lng: Number(lng),
        radius
      });
      setName('');
      setIsAdding(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
                Safe Zones & Places
              </h3>
              <p className="text-xs text-slate-500">
                Get notified when family members arrive or leave safe places
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {!isAdding ? (
            <>
              {safeZones.length === 0 ? (
                <div className="text-center py-8 px-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                  <div className="text-4xl mb-2">🏡</div>
                  <h4 className="font-bold text-slate-700 dark:text-slate-200 text-sm">
                    No Safe Zones Added Yet
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                    Add places like "Home", "School", or "Work" to automatically see when family members are safe.
                  </p>
                  <button
                    onClick={handleStartAdd}
                    className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add First Safe Place</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {safeZones.map(zone => (
                    <div
                      key={zone.id}
                      className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700">
                          {zone.icon}
                        </span>
                        <div>
                          <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                            {zone.name}
                          </h4>
                          <span className="text-xs text-slate-500">
                            {zone.radius}m radius • {zone.lat.toFixed(4)}, {zone.lng.toFixed(4)}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => onDeleteZone(zone.id)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors"
                        title="Delete place"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={handleStartAdd}
                    className="w-full py-2.5 border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-emerald-500 rounded-2xl text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center justify-center gap-2 transition-colors mt-2"
                  >
                    <Plus className="w-4 h-4 text-emerald-500" />
                    <span>Add Another Safe Place</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Place Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Home, Lincoln School, Grandma's"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Choose Icon
                </label>
                <div className="flex flex-wrap gap-2">
                  {EMOJI_OPTIONS.map(em => (
                    <button
                      type="button"
                      key={em}
                      onClick={() => setIcon(em)}
                      className={`text-xl p-2 rounded-xl border transition-all ${
                        icon === em
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950 scale-110 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Safe Zone Size (Radius)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {RADIUS_OPTIONS.map(opt => (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() => setRadius(opt.value)}
                      className={`p-2.5 rounded-xl border text-xs font-medium text-left transition-all ${
                        radius === opt.value
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 font-bold'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={lat}
                    onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={lng}
                    onChange={(e) => setLng(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs"
                  />
                </div>
              </div>

              {currentCoords && (
                <button
                  type="button"
                  onClick={() => {
                    setLat(currentCoords.lat);
                    setLng(currentCoords.lng);
                  }}
                  className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold inline-flex items-center gap-1 hover:underline"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  Use My Current Location
                </button>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !name.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors shadow-sm"
                >
                  {submitting ? 'Saving...' : 'Save Place'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
