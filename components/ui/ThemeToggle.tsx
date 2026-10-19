import React, { useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../ThemeContext';

interface ThemeToggleProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '', size = 'md' }) => {
  const { theme, toggleTheme } = useTheme();
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsAnimating(true);
    toggleTheme();
    setTimeout(() => setIsAnimating(false), 500);
  };

  const getThemeDetails = () => {
    switch (theme) {
      case 'light':
        return {
          label: 'Light Mode',
          nextLabel: 'Dark Mode',
          icon: (
            <Sun 
              className={`transition-all duration-base text-amber-500 ${
                isAnimating ? 'rotate-180 scale-110' : 'rotate-0 scale-100'
              }`} 
              size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} 
            />
          ),
        };
      case 'dark':
        return {
          label: 'Dark Mode',
          nextLabel: 'System Theme',
          icon: (
            <Moon 
              className={`transition-all duration-base text-slate-700 ${
                isAnimating ? '-rotate-180 scale-110' : 'rotate-0 scale-100'
              }`} 
              size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} 
            />
          ),
        };
      case 'system':
      default:
        return {
          label: 'System Theme',
          nextLabel: 'Light Mode',
          icon: (
            <Monitor 
              className={`transition-all duration-base text-slate-600 ${
                isAnimating ? 'scale-110' : 'scale-100'
              }`} 
              size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} 
            />
          ),
        };
    }
  };

  const details = getThemeDetails();

  const dimensionClasses = {
    sm: 'w-7 h-7',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
  }[size];

  return (
    <button
      onClick={handleClick}
      type="button"
      aria-label={`Current theme: ${details.label}. Click to switch to ${details.nextLabel}`}
      title={`Theme: ${details.label} (Click for ${details.nextLabel})`}
      className={`group relative flex items-center justify-center rounded-full border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 shadow-sm transition-all duration-fast active:scale-90 cursor-pointer select-none shrink-0 ${dimensionClasses} ${className}`}
    >
      <div className="relative flex items-center justify-center shrink-0">
        {details.icon}
      </div>
    </button>
  );
};

export default ThemeToggle;
