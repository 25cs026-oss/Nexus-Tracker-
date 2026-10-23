import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  Download, 
  Share2, 
  PlusSquare, 
  Check, 
  X, 
  ShieldCheck, 
  Radio, 
  Sparkles,
  Zap,
  BellRing,
  ExternalLink,
  ChevronDown
} from 'lucide-react';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  deferredPrompt: any;
  onInstallSuccess?: () => void;
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({
  isOpen,
  onClose,
  deferredPrompt,
  onInstallSuccess
}) => {
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [activeTab, setActiveTab] = useState<'apk' | 'ios' | 'pwa'>('apk');
  const [showApkSteps, setShowApkSteps] = useState(false);

  useEffect(() => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);
    if (isIosDevice) {
      setActiveTab('ios');
    } else {
      setActiveTab('apk');
    }

    const isInStandalone = 
      window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone === true ||
      Boolean((window as any).NexusNative?.isNative());
    setIsStandalone(Boolean(isInStandalone));
  }, []);

  if (!isOpen) return null;

  const handlePwaInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        onInstallSuccess?.();
        onClose();
      }
    } catch (err) {
      console.warn('Install prompt error:', err);
    } finally {
      setInstalling(false);
    }
  };

  const handleDownloadApk = () => {
    // Direct link to the APK hosted on Vercel / site
    const apkUrl = '/NexusTracker.apk';
    const link = document.createElement('a');
    link.href = apkUrl;
    link.download = 'NexusTracker.apk';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowApkSteps(true);
  };

  const githubApkFallback = 'https://raw.githubusercontent.com/25cs026-oss/Nexus-Tracker-/main/NexusTracker-v1.0.apk';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in font-sans">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl overflow-hidden relative max-h-[90vh] flex flex-col">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icon */}
        <div className="text-center mb-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/25 mb-2.5">
            <Smartphone className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
            Install Nexus Tracker
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
            Choose your installation method below for live 24/7 background family tracking.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('apk')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'apk'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            ⚡ Android APK
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ios')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'ios'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            🍎 iPhone
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pwa')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'pwa'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            🌐 Web App
          </button>
        </div>

        {/* Tab Content */}
        <div className="overflow-y-auto space-y-3.5 pr-1 -mr-1">
          {activeTab === 'apk' && (
            <div className="space-y-3">
              {/* Featured APK Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-purple-500/10 border border-blue-500/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-600 dark:text-blue-400">
                    ⭐ Recommended
                  </span>
                  <span className="text-[11px] font-bold text-slate-400">v1.0 • ~3.9 MB</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Nexus Tracker Native App
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Full background GPS tracking that never stops even when app is closed or phone is locked.
                </p>

                {/* Badges */}
                <div className="grid grid-cols-2 gap-1.5 mt-3 text-[11px] text-slate-700 dark:text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>24/7 background GPS</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <BellRing className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span>Loud SOS siren & alert</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>Auto-updates over internet</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span>Eco battery saver</span>
                  </div>
                </div>

                {/* Primary Download Button */}
                <button
                  onClick={handleDownloadApk}
                  className="mt-4 w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-2xl text-sm shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Android App (.apk)</span>
                </button>

                {/* GitHub Fallback Link */}
                <div className="text-center mt-2">
                  <a
                    href={githubApkFallback}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-blue-500 hover:underline"
                  >
                    <span>Alternative GitHub mirror</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Step-by-Step Installation Steps */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 rounded-2xl space-y-2">
                <button
                  type="button"
                  onClick={() => setShowApkSteps(!showApkSteps)}
                  className="w-full flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  <span>How to install the APK (3 simple steps)</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showApkSteps ? 'rotate-180' : ''}`} />
                </button>

                {showApkSteps && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">1</span>
                      <span>Tap <strong>Download Android App</strong> above. When asked, choose <em>Download anyway</em>.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">2</span>
                      <span>Open the downloaded file and tap <strong>Install</strong> (allow <em>Unknown sources</em> if prompted).</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">3</span>
                      <span>Open app & select <strong>Allow all the time</strong> for Location permission. You're set!</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'ios' && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-2xl space-y-3">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[11px] shrink-0">1</span>
                <span>Open this site in <strong>Safari</strong> on your iPhone.</span>
              </div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[11px] shrink-0">2</span>
                <span>Tap the <strong>Share</strong> button <Share2 className="w-3.5 h-3.5 inline mx-1 text-blue-500" /> at the bottom.</span>
              </div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[11px] shrink-0">3</span>
                <span>Scroll down and tap <strong>"Add to Home Screen"</strong> <PlusSquare className="w-3.5 h-3.5 inline mx-1 text-slate-600 dark:text-slate-300" />.</span>
              </div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[11px] shrink-0">4</span>
                <span>Tap <strong>Add</strong> at top right. Nexus Tracker icon will appear on your Home Screen!</span>
              </div>
            </div>
          )}

          {activeTab === 'pwa' && (
            <div className="space-y-3">
              {deferredPrompt ? (
                <button
                  onClick={handlePwaInstall}
                  disabled={installing}
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-2xl text-sm shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-98"
                >
                  <Download className="w-4 h-4" />
                  <span>{installing ? 'Installing...' : '1-Tap Install Web App (PWA)'}</span>
                </button>
              ) : (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-2xl space-y-2 text-xs text-slate-600 dark:text-slate-400">
                  <div className="font-bold text-slate-800 dark:text-slate-200">How to install via browser:</div>
                  <div>1. Tap the 3 dots <strong>(⋮)</strong> in Chrome or Edge menu.</div>
                  <div>2. Select <strong>"Install Nexus Tracker"</strong> or <strong>"Add to Home screen"</strong>.</div>
                  <div>3. The web app will launch without any browser URL bar.</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
