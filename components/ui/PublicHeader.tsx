import { educationalUnit } from '../../lib/educationalUnit';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

interface PublicHeaderProps {
  onSection?: (id: string) => void;
  onLogin?: () => void;
}

const PublicHeader: React.FC<PublicHeaderProps> = ({ onSection, onLogin }) => {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(() => window.scrollY > 20);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const openSection = (id: string) => {
    if (onSection) onSection(id);
    else navigate('/', { state: { homeSection: id } });
  };

  return <header className={`fixed top-0 left-0 right-0 z-40 transition-all duration-base ${scrolled ? 'bg-white/85 dark:bg-slate-900/85 backdrop-blur-md shadow-sm py-4 border-b border-slate-200/50 dark:border-slate-800/50' : 'bg-transparent py-6'}`}>
    <nav aria-label="Main navigation" className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 sm:flex-nowrap sm:px-6">
      <button type="button" className="flex min-w-0 shrink-0 flex-col items-start text-left" onClick={() => openSection('home')} aria-label="IARS home">
          {educationalUnit.name && <img src={educationalUnit.logoUrl} alt={`${educationalUnit.name} logo`} className="mb-2 h-10 w-10 rounded-lg bg-white object-contain" />}
        <span className="relative block w-28 sm:w-36">
          <img src={educationalUnit.wordmarkUrl} alt="IARS — Institution Attendance & Records System" className="block w-full" />
          <img src={educationalUnit.wordmarkUrl} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 hidden w-full brightness-0 invert [clip-path:inset(0_0_0_41%)] dark:block" />
        </span>
        {educationalUnit.name && <span className="mt-1 block max-w-28 truncate text-[9px] font-bold text-emerald-600 dark:text-emerald-400 sm:max-w-36">{educationalUnit.name}</span>}
      </button>
      <div className="hidden lg:flex items-center gap-4 lg:gap-6 bg-white/60 dark:bg-slate-800/60 px-6 py-3 rounded-full border border-slate-200/60 dark:border-slate-700/60 backdrop-blur-sm shadow-sm">
        {[
          { id: 'home', label: 'Home' },
          { id: 'features', label: 'Features' },
          { id: 'modules', label: 'Who it helps' },
          { id: 'workflow', label: 'How it works' },
          { id: 'security', label: 'Privacy' },
        ].map(item => <button key={item.id} type="button" onClick={() => openSection(item.id)} className="whitespace-nowrap text-[11px] font-bold uppercase tracking-widest text-brand-900 dark:text-slate-200 hover:text-gold-600 dark:hover:text-gold-400 transition-colors">{item.label}</button>)}
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <ThemeToggle />
        <button type="button" onClick={onLogin || (() => navigate('/login'))} className="px-3 py-2.5 bg-brand-900 dark:bg-gold-500 text-white dark:text-brand-950 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-800 dark:hover:bg-gold-400 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 sm:px-6">Log In</button>
      </div>
    </nav>
  </header>;
};

export default PublicHeader;
