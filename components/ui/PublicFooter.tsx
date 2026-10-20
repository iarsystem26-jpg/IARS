import { educationalUnit } from '../../lib/educationalUnit';
import React from 'react';
import { Link } from 'react-router-dom';
import { legalLinks, privacyContact } from '../../lib/legal';

const PublicFooter: React.FC = () => (
  <footer className="border-t border-slate-200 bg-white px-6 py-10 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
    <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-2">
      <div className="space-y-3">
          {educationalUnit.name && <img src={educationalUnit.logoUrl} alt={`${educationalUnit.name} logo`} className="mb-2 h-10 w-10 rounded-lg bg-white object-contain" />}
        <div className="relative w-56 max-w-full">
          <img src={educationalUnit.wordmarkUrl} alt="IARS — Institution Attendance & Records System" className="w-full" />
          <img src={educationalUnit.wordmarkUrl} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 hidden w-full brightness-0 invert [clip-path:inset(0_0_0_41%)] dark:block" />
        </div>
        {educationalUnit.name && <p className="font-semibold">{educationalUnit.name}</p>}
        <p className="max-w-md text-sm leading-relaxed">Your place for school attendance, event schedules, and student records.</p>
        <p className="text-sm">For account help, contact your school officer. For privacy requests, contact {privacyContact.office}.
          {privacyContact.email && <> <a className="break-words font-semibold underline underline-offset-4" href={`mailto:${privacyContact.email}`}>{privacyContact.email}</a></>}
        </p>
      </div>
      <nav aria-label="Legal information" className="space-y-3">
        <p className="font-bold text-brand-900 dark:text-white">Your information & your rights</p>
        <ul className="grid gap-3 text-sm sm:grid-cols-2">
          {legalLinks.map(link => <li key={link.path}><Link to={link.path} className="inline-block py-1 underline-offset-4 hover:underline focus-visible:underline">{link.title}</Link></li>)}
        </ul>
      </nav>
    </div>
    <div className="mx-auto mt-8 max-w-7xl border-t border-slate-200 pt-5 text-sm dark:border-slate-800">
      © {new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date())} {privacyContact.school || 'Institution Attendance & Records System'}. All rights reserved.
    </div>
  </footer>
);

export default PublicFooter;
