import React, { useState } from 'react';
import { MemberRole, AppTheme } from '../types';
import { 
  Settings, 
  User, 
  Share2, 
  Copy, 
  Check, 
  EyeOff, 
  Eye, 
  Smartphone, 
  Moon, 
  Sun, 
  LogOut, 
  X,
  Shield,
  HelpCircle
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  circleName: string;
  circlePin: string;
  memberName: string;
  memberRole: MemberRole;
  memberAvatar: string;
  isSharingPaused: boolean;
  theme: AppTheme;
  onUpdateProfile: (name: string, role: MemberRole, avatar: string) => Promise<void>;
  onToggleSharingPaused: (paused: boolean) => Promise<void>;
  onThemeChange: (theme: AppTheme) => void;
  onLeaveCircle: () => void;
}

const AVATAR_OPTIONS = ['👩', '👨', '👧', '👦', '🧑', '👵', '👴', '🐶', '🐱', '🚗', '🚲', '⭐'];
const ROLE_OPTIONS: MemberRole[] = ['Mom', 'Dad', 'Son', 'Daughter', 'Grandparent', 'Partner', 'Friend', 'Pet', 'Other'];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  circleName,
  circlePin,
  memberName,
  memberRole,
  memberAvatar,
  isSharingPaused,
  theme,
  onUpdateProfile,
  onToggleSharingPaused,
  onThemeChange,
  onLeaveCircle
}) => {
  const [name, setName] = useState(memberName);
  const [role, setRole] = useState<MemberRole>(memberRole);
  const [avatar, setAvatar] = useState(memberAvatar);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showBgGuide, setShowBgGuide] = useState(false);

  if (!isOpen) return null;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(circlePin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join our family circle: ${circleName}`,
          text: `Join our ${circleName} location circle on Nexus Tracker using Circle Code: ${circlePin}`,
          url: window.location.href
        });
      } catch {
        handleCopyCode();
      }
    } else {
      handleCopyCode();
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onUpdateProfile(name.trim(), role, avatar);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
                Settings & Circle Info
              </h3>
              <p className="text-xs text-slate-500">
                {circleName} • Code {circlePin}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-6">
          {/* 1. Invite Family Members */}
          <div className="p-4 bg-gradient-to-br from-indigo-50/80 to-blue-50/80 dark:from-indigo-950/40 dark:to-blue-950/40 rounded-2xl border border-indigo-100 dark:border-indigo-900/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200 uppercase tracking-wider">
                Family Invite Code
              </span>
              <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                Share with members
              </span>
            </div>

            <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-3 rounded-xl border border-indigo-200/80 dark:border-indigo-800 shadow-xs">
              <div>
                <span className="text-2xl font-black tracking-widest text-slate-900 dark:text-white font-mono">
                  {circlePin}
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Enter this code on another phone to join
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCopyCode}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
                <button
                  onClick={handleShare}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share</span>
                </button>
              </div>
            </div>
          </div>

          {/* 2. Edit Profile Form */}
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Your Member Profile
              </h4>
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>

            {/* Avatar Selector */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                Choose Your Avatar
              </label>
              <div className="flex flex-wrap gap-2">
                {AVATAR_OPTIONS.map((av) => (
                  <button
                    type="button"
                    key={av}
                    onClick={() => setAvatar(av)}
                    className={`text-xl p-2 rounded-xl border transition-all ${
                      avatar === av
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 scale-110 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {av}
                  </button>
                ))}
              </div>
            </div>

            {/* Name Input */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Display Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Mom, Dad, Sarah"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Role Selector */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                Family Role
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ROLE_OPTIONS.map((r) => (
                  <button
                    type="button"
                    key={r}
                    onClick={() => setRole(r)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                      role === r
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </form>

          {/* 3. Privacy / Pause Sharing */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                isSharingPaused 
                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400' 
                  : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
              }`}>
                {isSharingPaused ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </div>
              <div>
                <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  {isSharingPaused ? 'Location Sharing Paused' : 'Live Location Active'}
                </h4>
                <p className="text-xs text-slate-500">
                  {isSharingPaused
                    ? 'Family members see your last known position'
                    : 'Family members see your live updates in real-time'}
                </p>
              </div>
            </div>

            <button
              onClick={() => onToggleSharingPaused(!isSharingPaused)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                isSharingPaused
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
              }`}
            >
              {isSharingPaused ? 'Resume' : 'Pause'}
            </button>
          </div>

          {/* 4. Background Reliability Guide */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-blue-500" />
                <h4 className="font-bold text-slate-800 dark:text-slate-100 text-xs">
                  Mobile Background Tracking Tips
                </h4>
              </div>
              <button
                onClick={() => setShowBgGuide(!showBgGuide)}
                className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
              >
                {showBgGuide ? 'Hide Guide' : 'View Tips'}
              </button>
            </div>

            {showBgGuide && (
              <div className="mt-3 text-xs text-slate-600 dark:text-slate-300 space-y-2 border-t border-slate-200 dark:border-slate-700 pt-3">
                <p>
                  <strong>📱 Android:</strong> In Chrome or your browser, tap the site settings lock icon &gt; Permissions &gt; Location: Set to <em>"Allow always"</em>. Turn off Battery Saver for your browser.
                </p>
                <p>
                  <strong>🍎 iPhone / Safari:</strong> Tap Share &gt; <em>"Add to Home Screen"</em> to install as an app. Keep Location Services set to "While Using" or "Always" in iOS Settings.
                </p>
              </div>
            )}
          </div>

          {/* 5. Theme Toggle */}
          <div className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Appearance
            </span>
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => onThemeChange('light')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  theme === 'light'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Light</span>
              </button>
              <button
                onClick={() => onThemeChange('dark')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  theme === 'dark'
                    ? 'bg-slate-700 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>Dark</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer: Leave Circle */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <button
            onClick={onLeaveCircle}
            className="px-3.5 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Leave Family Circle</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
