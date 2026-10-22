import React, { useState, useEffect } from 'react';
import { MemberRole, SavedCircleSummary } from '../types';
import { geoService, GeoLocationResult } from '../utils/geolocation';
import { 
  Users, 
  Plus, 
  KeyRound, 
  Sparkles, 
  MapPin, 
  ArrowRight, 
  Clock, 
  Trash2, 
  ChevronRight,
  UserCheck,
  Smartphone
} from 'lucide-react';

interface OnboardingModalProps {
  onJoinCircle: (pin: string, name: string, role: MemberRole, avatar: string) => Promise<boolean>;
  onCreateCircle: (circleName: string, pin: string, name: string, role: MemberRole, avatar: string) => Promise<boolean>;
  onStartDemo: () => void;
  defaultName: string;
  defaultRole: MemberRole;
  defaultAvatar: string;
  savedCircles?: SavedCircleSummary[];
  onSelectSavedCircle?: (circleId: string) => void;
  onRemoveSavedCircle?: (circleId: string) => void;
  onOpenInstallModal?: () => void;
}

const AVATARS = ['👩', '👨', '👧', '👦', '🧑', '👵', '👴', '🐶', '🚗'];
const ROLES: MemberRole[] = ['Mom', 'Dad', 'Son', 'Daughter', 'Grandparent', 'Partner', 'Friend', 'Other'];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  onJoinCircle,
  onCreateCircle,
  onStartDemo,
  defaultName,
  defaultRole,
  defaultAvatar,
  savedCircles = [],
  onSelectSavedCircle,
  onRemoveSavedCircle,
  onOpenInstallModal
}) => {
  const [tab, setTab] = useState<'join' | 'create'>('join');
  const [pin, setPin] = useState('');
  const [circleName, setCircleName] = useState('');
  const [memberName, setMemberName] = useState(defaultName || '');
  const [role, setRole] = useState<MemberRole>(defaultRole || 'Mom');
  const [avatar, setAvatar] = useState(defaultAvatar || '👩');
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(!defaultName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationDetected, setLocationDetected] = useState<boolean>(false);

  // Sync if defaultName changes
  useEffect(() => {
    if (defaultName && !memberName) {
      setMemberName(defaultName);
      setIsEditingProfile(false);
    }
  }, [defaultName]);

  // Pre-seed live location acquisition as soon as onboarding is opened
  useEffect(() => {
    geoService.startTracking(
      (_pos: GeoLocationResult) => {
        setLocationDetected(true);
      },
      () => {}
    );
  }, []);

  const generateRandomPin = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPin(code);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!pin.trim()) {
      setError('Please enter a 6-digit circle code');
      return;
    }
    const finalName = memberName.trim() || defaultName.trim();
    if (!finalName) {
      setIsEditingProfile(true);
      setError('Please enter your name');
      return;
    }

    setLoading(true);
    try {
      const success = await onJoinCircle(pin.trim().toUpperCase(), finalName, role, avatar);
      if (!success) {
        setError('Circle code not found. Check the code or create a new circle!');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to join circle');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!circleName.trim()) {
      setError('Please provide a name for your Family Circle');
      return;
    }
    const finalName = memberName.trim() || defaultName.trim();
    if (!finalName) {
      setIsEditingProfile(true);
      setError('Please enter your name');
      return;
    }

    const circlePin = pin.trim() ? pin.trim().toUpperCase() : Math.random().toString(36).substring(2, 8).toUpperCase();

    setLoading(true);
    try {
      const success = await onCreateCircle(circleName.trim(), circlePin, finalName, role, avatar);
      if (!success) {
        setError('Failed to initialize circle. Please try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to create circle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl overflow-hidden p-6 sm:p-8">
        {/* Brand Header */}
        <div className="text-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white mx-auto flex items-center justify-center shadow-md shadow-blue-500/20 mb-3">
            <Users className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Nexus Family Tracker
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Real-time family location, safety alerts, and safe zones.
          </p>

          {/* Location status & Install App pills */}
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-full text-[11px] font-semibold">
              <MapPin className="w-3.5 h-3.5" />
              <span>{locationDetected ? 'Live Location Detected' : 'Detecting live location...'}</span>
            </div>

            {onOpenInstallModal && (
              <button
                type="button"
                onClick={onOpenInstallModal}
                className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800 text-blue-600 dark:text-blue-400 rounded-full text-[11px] font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Install App</span>
              </button>
            )}
          </div>
        </div>

        {/* Previously Joined Circles Quick List */}
        {savedCircles.length > 0 && onSelectSavedCircle && (
          <div className="mb-5 p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-blue-500" />
                Previous Circles ({savedCircles.length})
              </span>
            </div>
            <div className="space-y-1.5">
              {savedCircles.map((circle) => (
                <div
                  key={circle.id}
                  className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 hover:border-blue-300 transition-all group"
                >
                  <button
                    type="button"
                    onClick={() => onSelectSavedCircle(circle.id)}
                    className="flex-1 flex items-center gap-2 text-left min-w-0"
                  >
                    <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-xs shrink-0">
                      {circle.name ? circle.name.charAt(0).toUpperCase() : 'C'}
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {circle.name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        PIN: {circle.id}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onSelectSavedCircle(circle.id)}
                      className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 rounded-lg text-[11px] font-bold flex items-center gap-1"
                    >
                      <span>Open</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                    {onRemoveSavedCircle && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveSavedCircle(circle.id);
                        }}
                        title="Remove from saved circles"
                        className="p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl mb-5">
          <button
            type="button"
            onClick={() => {
              setTab('join');
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              tab === 'join'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
            }`}
          >
            Join with Code
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('create');
              setError(null);
              if (!pin) generateRandomPin();
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              tab === 'create'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
            }`}
          >
            Create New Circle
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Forms */}
        {tab === 'join' ? (
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Circle Invite Code (PIN)
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value.toUpperCase())}
                  placeholder="e.g. FAM778"
                  maxLength={10}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-center text-lg font-mono font-bold tracking-widest text-slate-900 dark:text-white uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <KeyRound className="absolute right-3.5 top-3.5 w-5 h-5 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Smart Profile Display or Editor */}
            {!isEditingProfile && memberName.trim() ? (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200/90 dark:border-slate-700/80 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl p-1 bg-white dark:bg-slate-700 rounded-xl shadow-xs">
                    {avatar}
                  </span>
                  <div>
                    <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                      <UserCheck className="w-3 h-3 text-emerald-500" />
                      <span>Joining with profile:</span>
                    </div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mt-0.5">
                      <span>{memberName}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-semibold border border-blue-200 dark:border-blue-900">
                        {role}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(true)}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline px-2 py-1"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="space-y-3.5 p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Your Profile
                  </label>
                  {memberName.trim() && (
                    <button
                      type="button"
                      onClick={() => setIsEditingProfile(false)}
                      className="text-[11px] font-semibold text-slate-500 hover:underline"
                    >
                      Save Profile
                    </button>
                  )}
                </div>

                <div>
                  <input
                    type="text"
                    required
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    placeholder="Enter your name (e.g. Dad, Mom, Alex)"
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                    Pick Avatar & Role
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {AVATARS.map((av) => (
                      <button
                        type="button"
                        key={av}
                        onClick={() => setAvatar(av)}
                        className={`text-lg p-1.5 rounded-xl border transition-all ${
                          avatar === av
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 scale-110 shadow-xs'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {av}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {ROLES.map((r) => (
                      <button
                        type="button"
                        key={r}
                        onClick={() => setRole(r)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                          role === r
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                            : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-2xl text-sm transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2"
            >
              <span>{loading ? 'Connecting to Circle...' : 'Join Family Circle'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Circle / Family Name
              </label>
              <input
                type="text"
                required
                value={circleName}
                onChange={(e) => setCircleName(e.target.value)}
                placeholder="e.g. The Johnsons, Roadtrip Crew"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Circle Code (6-digit PIN)
                </label>
                <button
                  type="button"
                  onClick={generateRandomPin}
                  className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                >
                  Generate New
                </button>
              </div>
              <input
                type="text"
                required
                value={pin}
                onChange={(e) => setPin(e.target.value.toUpperCase())}
                placeholder="6-DIGIT CODE"
                maxLength={8}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-center font-mono font-bold tracking-widest text-slate-900 dark:text-white uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Smart Profile Display or Editor */}
            {!isEditingProfile && memberName.trim() ? (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200/90 dark:border-slate-700/80 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl p-1 bg-white dark:bg-slate-700 rounded-xl shadow-xs">
                    {avatar}
                  </span>
                  <div>
                    <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                      <UserCheck className="w-3 h-3 text-emerald-500" />
                      <span>Creating as:</span>
                    </div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mt-0.5">
                      <span>{memberName}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-semibold border border-blue-200 dark:border-blue-900">
                        {role}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(true)}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline px-2 py-1"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="space-y-3.5 p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Your Profile
                  </label>
                  {memberName.trim() && (
                    <button
                      type="button"
                      onClick={() => setIsEditingProfile(false)}
                      className="text-[11px] font-semibold text-slate-500 hover:underline"
                    >
                      Save Profile
                    </button>
                  )}
                </div>

                <div>
                  <input
                    type="text"
                    required
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    placeholder="Enter your name (e.g. Dad, Mom, Emma)"
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                    Pick Avatar & Role
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {AVATARS.map((av) => (
                      <button
                        type="button"
                        key={av}
                        onClick={() => setAvatar(av)}
                        className={`text-lg p-1.5 rounded-xl border transition-all ${
                          avatar === av
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 scale-110 shadow-xs'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {av}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {ROLES.map((r) => (
                      <button
                        type="button"
                        key={r}
                        onClick={() => setRole(r)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                          role === r
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                            : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-2xl text-sm transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2"
            >
              <span>{loading ? 'Creating Circle...' : 'Create Family Circle'}</span>
              <Plus className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Instant Demo Preview Option */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
          <button
            type="button"
            onClick={onStartDemo}
            className="w-full py-2.5 px-4 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors border border-slate-200/80 dark:border-slate-700"
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Try Instant Demo Circle (No Setup Needed)</span>
          </button>
          <p className="text-[11px] text-slate-400 mt-1.5">
            Experience real-time family tracking centered on your city.
          </p>
        </div>
      </div>
    </div>
  );
};
