import React from 'react';
import { 
  ShieldCheck, 
  BatteryCharging, 
  Smartphone, 
  Radio, 
  CheckCircle2, 
  X, 
  ExternalLink,
  Power,
  Lock,
  Layers
} from 'lucide-react';

interface BackgroundGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  isBackgroundActive: boolean;
  onToggleBackground: () => void;
}

export const BackgroundGuideModal: React.FC<BackgroundGuideModalProps> = ({
  isOpen,
  onClose,
  isBackgroundActive,
  onToggleBackground
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in font-sans">
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />

      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                24/7 Background GPS Tracking
              </h3>
              <p className="text-xs text-slate-500">
                Keep tracking active in pocket, screen locked, or other apps
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs pr-1">
          {/* Active Status Card */}
          <div className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
            isBackgroundActive
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-300'
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{isBackgroundActive ? '🟢' : '⏸️'}</span>
              <div>
                <div className="font-bold text-sm">
                  {isBackgroundActive ? 'Background Service: ACTIVE' : 'Background Service: SLEEPING'}
                </div>
                <div className="text-[11px] opacity-80 mt-0.5">
                  {isBackgroundActive
                    ? 'Audio lock & wake service running. Safe to turn screen off or switch apps.'
                    : 'Tap "Turn On" to keep sending GPS when phone is locked or in pocket.'
                  }
                </div>
              </div>
            </div>

            <button
              onClick={onToggleBackground}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs shrink-0 transition-all shadow-xs ${
                isBackgroundActive
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {isBackgroundActive ? 'Stop' : 'Turn On'}
            </button>
          </div>

          {/* 3 Step Guide */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[10px]">
              How 24/7 Tracking Works On Your Phone
            </h4>

            {/* Step 1 */}
            <div className="p-3 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 flex items-start gap-3">
              <div className="w-7 h-7 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center shrink-0 text-xs">
                1
              </div>
              <div>
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-blue-500" />
                  <span>Screen Locked & In Pocket</span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                  When you tap <strong>"Turn On"</strong> above, Nexus starts an invisible background audio loop and notification bar service. This prevents Android & iOS from suspending your browser while driving, walking, or with the phone in your pocket.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="p-3 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 flex items-start gap-3">
              <div className="w-7 h-7 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 font-bold flex items-center justify-center shrink-0 text-xs">
                2
              </div>
              <div>
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <BatteryCharging className="w-3.5 h-3.5 text-amber-500" />
                  <span>Disable Android Battery Restrictions</span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                  To prevent Android from killing the background tracker after 30 minutes of inactivity:
                </p>
                <ol className="list-disc pl-4 mt-1.5 space-y-1 text-slate-600 dark:text-slate-300 font-medium">
                  <li>Open Android <strong>Settings</strong> &rarr; <strong>Apps</strong> &rarr; <strong>Nexus Tracker</strong> (or Chrome).</li>
                  <li>Tap <strong>Battery</strong> (or App Battery Usage).</li>
                  <li>Select <strong>"Unrestricted"</strong> (No battery optimization).</li>
                </ol>
              </div>
            </div>

            {/* Step 3 */}
            <div className="p-3 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 flex items-start gap-3">
              <div className="w-7 h-7 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 font-bold flex items-center justify-center shrink-0 text-xs">
                3
              </div>
              <div>
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-purple-500" />
                  <span>Full App Close (Native APK / Foreground Service)</span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                  On mobile operating systems (Android/iOS), when a user completely swipes away/force-quits any web browser from the recent apps menu, the OS terminates the browser tab.
                </p>
                <p className="text-slate-500 dark:text-slate-400 mt-1">
                  For <strong>uninterruptible 24/7 background tracking (like Life360)</strong> that survives even if the app is swiped away from recent apps, we have included the complete <strong>Native Android Project (`/android`)</strong> powered by Capacitor in this repository! It includes:
                </p>
                <div className="mt-1.5 p-2 bg-slate-100 dark:bg-slate-900 rounded-xl font-mono text-[10px] text-slate-700 dark:text-slate-300">
                  <div>✔ ACCESS_BACKGROUND_LOCATION</div>
                  <div>✔ FOREGROUND_SERVICE_LOCATION</div>
                  <div>✔ RECEIVE_BOOT_COMPLETED (auto-start on phone boot)</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl text-xs hover:opacity-90 transition-opacity"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
