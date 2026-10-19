import React from 'react';
import { Check, X } from 'lucide-react';
import { passwordRequirements } from '../../lib/passwordPolicy';

interface PasswordStrengthMeterProps {
  password?: string;
}

export function getPasswordStrength(password: string) {
  if (!password) {
    return { score: 0, label: 'Very Weak', color: 'bg-slate-200 dark:bg-slate-700', textColor: 'text-slate-400' };
  }

  let score = 0;
  
  // Length checks
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  
  // Complexity checks
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  // Max score is 5, map score to strength levels
  // score 1: Weak, score 2-3: Fair, score 4: Strong, score 5: Very Strong
  if (score <= 1) {
    return { score: 1, label: 'Weak', color: 'bg-red-500', textColor: 'text-red-500' };
  } else if (score <= 2) {
    return { score: 2, label: 'Fair', color: 'bg-amber-500', textColor: 'text-amber-500' };
  } else if (score <= 4) {
    return { score: 3, label: 'Good', color: 'bg-emerald-500', textColor: 'text-emerald-500' };
  } else {
    return { score: 4, label: 'Strong', color: 'bg-emerald-600', textColor: 'text-emerald-600' };
  }
}

export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({ password = '' }) => {
  const strength = getPasswordStrength(password);
  
  const requirements = passwordRequirements(password);

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2 animate-in fade-in duration-base">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Password Strength:
        </span>
        <span className={`text-[10px] font-black uppercase tracking-wider ${strength.textColor}`}>
          {strength.label}
        </span>
      </div>

      {/* Progress Bars */}
      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((step) => (
          <div
            key={step}
            className={`h-1.5 flex-1 rounded-full transition-all duration-base ${
              step <= strength.score ? strength.color : 'bg-slate-200 dark:bg-slate-700'
            }`}
          />
        ))}
      </div>

      {/* Requirements Checklist */}
      <div className="grid grid-cols-2 gap-1 pt-1">
        {requirements.map((req, idx) => (
          <div key={idx} className="flex items-center gap-1 text-[10px]">
            {req.met ? (
              <Check size={12} className="text-emerald-500 shrink-0" />
            ) : (
              <X size={12} className="text-slate-400 dark:text-slate-600 shrink-0" />
            )}
            <span className={req.met ? 'text-slate-700 font-semibold dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}>
              {req.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PasswordStrengthMeter;
