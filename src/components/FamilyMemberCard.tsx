import React from 'react';
import { DeviceMember } from '../types';
import { 
  formatRelativeTime, 
  formatSpeed, 
  formatDistance, 
  calculateDistanceMeters
} from '../utils/geo';
import { 
  Battery, 
  BatteryCharging, 
  BatteryWarning, 
  Navigation, 
  MapPin, 
  AlertTriangle,
  Trash2
} from 'lucide-react';

interface FamilyMemberCardProps {
  member: DeviceMember;
  currentUser?: DeviceMember | null;
  isSelected: boolean;
  isRoomOwner?: boolean;
  isCurrentUserOwner?: boolean;
  onSelect: (member: DeviceMember) => void;
  onNavigate?: (member: DeviceMember) => void;
  onDelete?: (memberId: string) => void;
}

export const FamilyMemberCard: React.FC<FamilyMemberCardProps> = ({
  member,
  currentUser,
  isSelected,
  isRoomOwner,
  isCurrentUserOwner,
  onSelect,
  onNavigate,
  onDelete
}) => {
  const isSelf = currentUser?.id === member.id;
  
  // Distance from current user
  const distanceStr = (!isSelf && currentUser) 
    ? formatDistance(calculateDistanceMeters(
        currentUser.lastLat, 
        currentUser.lastLng, 
        member.lastLat, 
        member.lastLng
      ))
    : null;

  const isLowBattery = member.battery !== undefined && member.battery <= 20;

  return (
    <div
      onClick={() => onSelect(member)}
      className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
        isSelected
          ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-400 dark:border-blue-600 shadow-sm'
          : member.isSosActive
            ? 'bg-red-50/80 dark:bg-red-950/40 border-red-400 dark:border-red-600'
            : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
      }`}
    >
      {/* SOS Alert Banner */}
      {member.isSosActive && (
        <div className="mb-2 py-1 px-2.5 bg-red-600 text-white text-[11px] font-bold rounded-lg flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>EMERGENCY SOS ALERT!</span>
          </div>
          <span className="text-[10px] underline">View on Map</span>
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        {/* Left: Avatar & Info */}
        <div className="flex items-start gap-3">
          <div className="relative">
            <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-2xl shadow-inner border border-slate-200 dark:border-slate-700">
              {member.avatar || (member.name ? member.name.charAt(0).toUpperCase() : '👤')}
            </div>
            {member.isSosActive ? (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-white">!</span>
            ) : member.isCharging ? (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 text-white rounded-full flex items-center justify-center text-[8px] border border-white">⚡</span>
            ) : (
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white"></span>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-snug">
                {member.name || 'Member'}
              </h4>
              {isSelf && (
                <span className="text-[10px] px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 font-bold rounded-md">
                  You
                </span>
              )}
            </div>

            {/* Role & Status */}
            <div className="flex items-center gap-2 mt-0.5">
              {member.role && (
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                  {member.role}
                </span>
              )}
              {distanceStr && (
                <>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                    {distanceStr} away
                  </span>
                </>
              )}
            </div>

            {/* Current Place or Speed */}
            <div className="mt-1.5 flex items-center gap-1.5 text-xs">
              {member.currentPlace ? (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full text-[11px]">
                  <MapPin className="w-3 h-3" />
                  At {member.currentPlace}
                </span>
              ) : (
                <span className="text-slate-500 dark:text-slate-400 text-[11px] flex items-center gap-1">
                  <Navigation className="w-3 h-3" />
                  {formatSpeed(member.speed)}
                </span>
              )}
            </div>

            {/* Status Message if any */}
            {member.statusMessage && (
              <div className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 italic bg-slate-50 dark:bg-slate-800/60 px-2 py-1 rounded-lg border border-slate-100 dark:border-slate-800">
                "{member.statusMessage}"
              </div>
            )}
          </div>
        </div>

        {/* Right: Battery & Updated */}
        <div className="flex flex-col items-end shrink-0">
          <div className={`flex items-center gap-1 text-xs font-semibold ${
            isLowBattery ? 'text-red-500' : 'text-slate-600 dark:text-slate-300'
          }`}>
            {member.isCharging ? (
              <BatteryCharging className="w-4 h-4 text-amber-500" />
            ) : isLowBattery ? (
              <BatteryWarning className="w-4 h-4 text-red-500" />
            ) : (
              <Battery className="w-4 h-4 text-emerald-500" />
            )}
            <span>{member.battery ?? '--'}%</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1">
            {formatRelativeTime(member.lastUpdated)}
          </span>

          <div className="flex items-center gap-1 mt-2.5">
            {onNavigate && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(member);
                }}
                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950 transition-colors"
                title="Get Directions"
              >
                <Navigation className="w-3.5 h-3.5" />
              </button>
            )}

            {!isSelf && onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Remove ${member.name} from this family circle?`)) {
                    onDelete(member.id);
                  }
                }}
                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                title="Remove Member"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
