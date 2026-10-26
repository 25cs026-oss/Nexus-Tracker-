import React, { useState } from 'react';
import { CheckInPing } from '../types';
import { formatRelativeTime } from '../utils/geo';
import { MessageSquare, Send, CheckCircle2, X } from 'lucide-react';

interface CheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendCheckIn: (message: string) => Promise<void>;
  checkIns: CheckInPing[];
  memberName: string;
}

const PRESET_MESSAGES = [
  '🏡 Arrived safely at Home!',
  '🚗 Heading home now, see you soon',
  '🙋 Can someone pick me up?',
  '⏱️ Running 15 minutes late',
  '🏫 At school / campus',
  '🏢 In a meeting right now',
  '🪫 Phone battery is low, talk soon!',
  '👍 Doing great, all good!'
];

export const CheckInModal: React.FC<CheckInModalProps> = ({
  isOpen,
  onClose,
  onSendCheckIn,
  checkIns,
  memberName
}) => {
  const [customMsg, setCustomMsg] = useState('');
  const [sending, setSending] = useState(false);

  if (!isOpen) return null;

  const handleSend = async (text: string) => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await onSendCheckIn(text.trim());
      setCustomMsg('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div 
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[9995] flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm animate-fade-in pointer-events-auto"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl flex flex-col max-h-[85vh] select-text relative z-10 pointer-events-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
                Family Check-ins
              </h3>
              <p className="text-xs text-slate-500">
                Send quick status updates to keep everyone in the loop
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick presets */}
        <div className="py-3">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Quick 1-Tap Updates
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {PRESET_MESSAGES.map((msg, i) => (
              <button
                key={i}
                type="button"
                disabled={sending}
                onClick={() => handleSend(msg)}
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 text-xs font-medium text-left text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50 cursor-pointer active:scale-98"
              >
                {msg}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(customMsg);
          }}
          className="flex gap-2 pt-2 pb-4 border-b border-slate-100 dark:border-slate-800"
        >
          <input
            type="text"
            value={customMsg}
            onChange={(e) => setCustomMsg(e.target.value)}
            placeholder="Or write a custom update..."
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 select-text"
          />
          <button
            type="submit"
            disabled={sending || !customMsg.trim()}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer active:scale-95"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Post</span>
          </button>
        </form>

        {/* Recent Feed */}
        <div className="flex-1 overflow-y-auto pt-3">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Recent Circle Activity
          </label>
          {checkIns.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-400">
              No recent updates yet. Send the first check-in!
            </div>
          ) : (
            <div className="space-y-2">
              {checkIns.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-start gap-3"
                >
                  <span className="text-xl p-1.5 bg-white dark:bg-slate-800 rounded-xl shadow-xs">
                    {item.avatar || '👤'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        {item.memberName}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {formatRelativeTime(item.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                      {item.message}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
