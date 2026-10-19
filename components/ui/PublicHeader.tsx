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
      <button type="button" className="flex min-w-0 items-center gap-2 text-left sm:gap-3" onClick={() => openSection('home')} aria-label="IARS home">
        <img src={`${import.meta.env.BASE_URL}academic-seal-transparent.png`} alt="IARS Academic Seal" className="w-10 h-10 rounded-full object-contain p-0.5 shadow-lg ring-2 ring-gold-400/50 hover:scale-105 transition-transform shrink-0" />
        <span className="min-w-0">
          <span className="block font-black uppercase tracking-tighter leading-none text-brand-900 dark:text-white text-base">IARS</span>
          <span className="hidden text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400 sm:block">Attendance & Records System</span>
        </span>
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
