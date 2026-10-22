import React, { useState, useEffect } from 'react';
import { DeviceMember } from '../types';
import { getDirectionsUrl } from '../utils/geo';
import { 
  AlertTriangle, 
  ShieldAlert, 
  Navigation, 
  PhoneCall, 
  X, 
  CheckCircle2,
  Volume2,
  VolumeX,
  XCircle
} from 'lucide-react';

interface SosModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerSos: () => Promise<void>;
  onCancelSos: () => Promise<void>;
  onResolveSos?: (memberDocId: string) => Promise<void>;
  activeSosMember: DeviceMember | null;
  isCurrentUserSos: boolean;
  isSirenMuted?: boolean;
  onToggleMuteSiren?: () => void;
}

export const SosModal: React.FC<SosModalProps> = ({
  isOpen,
  onClose,
  onTriggerSos,
  onCancelSos,
  onResolveSos,
  activeSosMember,
  isCurrentUserSos,
  isSirenMuted = false,
  onToggleMuteSiren
}) => {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    let timer: any;
    if (countdown !== null && countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (countdown === 0) {
      setCountdown(null);
      setTriggering(true);
      onTriggerSos().finally(() => setTriggering(false));
    }
    return () => clearTimeout(timer);
  }, [countdown, onTriggerSos]);

  // If modal is not open, do not render
  if (!isOpen) return null;

  // Active Emergency Broadcast Screen
  if (activeSosMember) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-red-950/80 backdrop-blur-md animate-fade-in">
        <div className="bg-white dark:bg-slate-900 border-2 border-red-500 rounded-3xl max-w-md w-full p-6 shadow-2xl text-center relative overflow-hidden">
          {/* Pulsing red top bar */}
          <div className="absolute top-0 left-0 right-0 h-2 bg-red-600 animate-pulse" />

          {/* Top Control Bar: Close & Mute Siren */}
          <div className="flex items-center justify-between mb-2">
            {onToggleMuteSiren && (
              <button
                onClick={onToggleMuteSiren}
                className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                  isSirenMuted 
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' 
                    : 'bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-300 animate-pulse'
                }`}
                title={isSirenMuted ? 'Unmute Siren Alarm' : 'Silence Siren Alarm'}
              >
                {isSirenMuted ? <VolumeX className="w-4 h-4 text-slate-500" /> : <Volume2 className="w-4 h-4 text-red-600" />}
                <span>{isSirenMuted ? 'Siren Muted' : 'Mute Alarm'}</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors ml-auto"
              title="Dismiss Alert Screen"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="w-16 h-16 rounded-3xl bg-red-100 dark:bg-red-950/80 text-red-600 mx-auto flex items-center justify-center mb-3 animate-bounce">
            <AlertTriangle className="w-9 h-9" />
          </div>

          <span className="inline-block px-3 py-1 rounded-full bg-red-100 dark:bg-red-950 text-red-600 text-xs font-bold tracking-wider uppercase mb-1">
            🚨 Emergency Alert Active
          </span>

          <h3 className="text-xl font-black text-slate-800 dark:text-white">
            {activeSosMember.name} Needs Help!
          </h3>

          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
            {isCurrentUserSos 
              ? 'You sent an emergency SOS alert to your family circle. Your live location is broadcasting.'
              : `${activeSosMember.name} has pressed the SOS emergency button.`}
          </p>

          {/* Member Coordinates & Battery */}
          <div className="my-4 p-3 bg-red-50 dark:bg-red-950/40 rounded-2xl border border-red-200 dark:border-red-900 text-left text-xs space-y-1">
            <div className="flex justify-between text-slate-700 dark:text-slate-200">
              <span className="font-semibold">Coordinates:</span>
              <span className="font-mono">{activeSosMember.lastLat.toFixed(5)}, {activeSosMember.lastLng.toFixed(5)}</span>
            </div>
            {activeSosMember.currentPlace && (
              <div className="flex justify-between text-slate-700 dark:text-slate-200">
                <span className="font-semibold">Location:</span>
                <span>Near {activeSosMember.currentPlace}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-700 dark:text-slate-200">
              <span className="font-semibold">Battery:</span>
              <span>{activeSosMember.battery ?? '--'}%</span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2.5">
            <a
              href={getDirectionsUrl(activeSosMember.lastLat, activeSosMember.lastLng)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-red-500/25 transition-transform active:scale-95 text-sm"
            >
              <Navigation className="w-4 h-4" />
              <span>Navigate Directly to Member</span>
            </a>

            <div className="flex gap-2">
              <a
                href="tel:911"
                className="flex-1 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <PhoneCall className="w-3.5 h-3.5 text-red-500" />
                <span>Call Emergency</span>
              </a>

              {isCurrentUserSos ? (
                <button
                  onClick={onCancelSos}
                  className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>I'm Safe Now</span>
                </button>
              ) : onResolveSos ? (
                <button
                  onClick={() => onResolveSos(activeSosMember.id)}
                  className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                  title="Mark emergency resolved for entire room"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Resolve SOS</span>
                </button>
              ) : null}
            </div>
          </div>

          {/* Dismiss Alert Screen Button */}
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center">
            <button
              onClick={onClose}
              className="py-2 px-4 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5"
            >
              <XCircle className="w-4 h-4 text-slate-400" />
              <span>Dismiss Alert Screen (View Map)</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // SOS Trigger Confirmation Modal
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl text-center">
        <div className="flex justify-end">
          <button
            onClick={() => {
              setCountdown(null);
              onClose();
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 mx-auto flex items-center justify-center mb-3">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <h3 className="text-lg font-bold text-slate-800 dark:text-white">
          Send Emergency SOS
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-5">
          This immediately alerts all members of your Family Circle with your exact coordinates and high-priority siren.
        </p>

        {countdown !== null ? (
          <div className="space-y-4">
            <div className="text-5xl font-black text-red-600 animate-pulse">
              {countdown}
            </div>
            <p className="text-xs font-semibold text-red-500">
              Broadcasting SOS in {countdown} seconds...
            </p>
            <button
              onClick={() => setCountdown(null)}
              className="w-full py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel Alert
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={() => setCountdown(3)}
              disabled={triggering}
              className="w-full py-3.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl text-sm shadow-lg shadow-red-500/30 transition-all hover:scale-102 active:scale-98"
            >
              Confirm SOS Alert
            </button>
            <button
              onClick={onClose}
              className="w-full py-2 text-xs font-medium text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
