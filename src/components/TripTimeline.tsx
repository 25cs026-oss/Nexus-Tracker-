import React from 'react';
import { HistoryPoint, DeviceMember } from '../types';
import { formatRelativeTime, formatFullTime, formatSpeed, formatDistance, calculateDistanceMeters } from '../utils/geo';
import { History, Trash2, MapPin, Navigation, Clock } from 'lucide-react';

interface TripTimelineProps {
  member: DeviceMember;
  history: HistoryPoint[];
  onClearHistory: () => Promise<void>;
  isCurrentUser: boolean;
}

export const TripTimeline: React.FC<TripTimelineProps> = ({
  member,
  history,
  onClearHistory,
  isCurrentUser
}) => {
  // Calculate total path distance
  const totalMeters = React.useMemo(() => {
    if (history.length < 2) return 0;
    let dist = 0;
    for (let i = 0; i < history.length - 1; i++) {
      dist += calculateDistanceMeters(
        history[i].lat,
        history[i].lng,
        history[i + 1].lat,
        history[i + 1].lng
      );
    }
    return dist;
  }, [history]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 flex flex-col h-full shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-blue-500" />
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
            {member.name}'s Location History
          </h3>
        </div>

        {history.length > 0 && isCurrentUser && (
          <button
            onClick={() => {
              if (window.confirm('Are you sure you want to clear your location timeline?')) {
                onClearHistory();
              }
            }}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
            title="Clear History"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Summary Stats */}
      {history.length > 1 && (
        <div className="mt-3 p-2.5 bg-blue-50/60 dark:bg-blue-950/40 rounded-xl border border-blue-100 dark:border-blue-900/50 flex items-center justify-between text-xs text-blue-900 dark:text-blue-200">
          <div className="flex items-center gap-1.5">
            <Navigation className="w-3.5 h-3.5 text-blue-500" />
            <span>Distance Logged:</span>
          </div>
          <span className="font-bold">{formatDistance(totalMeters)}</span>
        </div>
      )}

      {/* History List */}
      <div className="flex-1 overflow-y-auto mt-3 pr-1 space-y-3 min-h-[160px]">
        {history.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <Clock className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-xs font-medium">No recorded movements yet</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Updates will automatically log as {member.name} moves
            </p>
          </div>
        ) : (
          history.map((point, index) => (
            <div key={index} className="flex items-start gap-3 relative group">
              {/* Timeline Connector Line */}
              {index < history.length - 1 && (
                <div className="absolute left-[7px] top-4 bottom-[-14px] w-[2px] bg-slate-200 dark:bg-slate-800" />
              )}

              {/* Bullet Node */}
              <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 z-10 ${
                index === 0
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-300 dark:bg-slate-700'
              }`}>
                {index === 0 && <span className="w-1.5 h-1.5 bg-white rounded-full"></span>}
              </div>

              {/* Point Details */}
              <div className="flex-1 pb-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {point.placeName || `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {formatFullTime(point.timestamp)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                  <span>{formatRelativeTime(point.timestamp)}</span>
                  {point.speed !== undefined && (
                    <>
                      <span>•</span>
                      <span>{formatSpeed(point.speed)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
