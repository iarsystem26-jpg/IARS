import { useMemo, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, CheckCircle, Clock, Lightbulb, Users } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { analyzeAttendance, attendanceGroups, attendanceTrend, AnalyticsCoverage, AnalyticsGrouping, AnalyticsPeriod, AnalyticsRecord } from '../../lib/attendanceAnalytics';
import { formatManilaDate } from '../../lib/dateTime';
import { MetricCard, Surface } from '../ui/Page';
import CustomSelect from '../ui/CustomSelect';
import Button from '../ui/Button';

const percentage = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`;
const shortDate = (value: number) => formatManilaDate(value, { month: 'short', day: 'numeric', year: 'numeric' });
const panelTitle = 'text-sm font-bold text-brand-900 dark:text-white';
const muted = 'text-xs leading-5 text-slate-500 dark:text-slate-400';

export default function AttendanceAnalytics({ records, period, range, now }: {
  records: AnalyticsRecord[]; period: AnalyticsPeriod; range: { start: string; end: string }; now: number;
}) {
  const [interval, setInterval] = useState<'day' | 'week' | 'month'>('week');
  const [grouping, setGrouping] = useState<AnalyticsGrouping>('eventName');
  const [showAll, setShowAll] = useState(false);
  const [showFollowUps, setShowFollowUps] = useState(false);
  const [coverage, setCoverage] = useState<AnalyticsCoverage>('live');
  const analytics = useMemo(() => analyzeAttendance(records, period, range, now, coverage), [records, period, range, now, coverage]);
  const trend = useMemo(() => attendanceTrend(analytics.current, interval).map(point => ({ ...point, label: shortDate(point.time) })), [analytics.current, interval]);
  const groups = useMemo(() => attendanceGroups(analytics.current, grouping), [analytics.current, grouping]);
  const { summary, comparison, followUps, provisionalEvents, provisionalEntries, completedMissing } = analytics;
  const delta = comparison.available && comparison.current.participationRate !== null && comparison.previous.participationRate !== null
    ? comparison.current.participationRate - comparison.previous.participationRate : null;
  const insights: { title: string; body: string }[] = [];
  if (!summary.total) insights.push({ title: 'No attendance in this scope', body: coverage === 'completed' ? 'Choose live attendance to include recorded attendance from unfinished events, or widen your filters.' : 'Record attendance or widen the date and event filters to see trends and comparisons.' });
  else {
    if (summary.resolved < 20) insights.push({ title: 'Small sample', body: `Only ${summary.resolved} resolved entries from ${summary.events} events are available. Treat differences as descriptive, not a reliable forecast.` });
    if (delta !== null) insights.push({ title: delta > 0 ? 'Participation increased' : delta < 0 ? 'Participation decreased' : 'Participation is unchanged', body: `${Math.abs(delta).toFixed(1)} percentage points ${delta > 0 ? 'higher' : delta < 0 ? 'lower' : 'difference'} versus the previous equal-length period. Compare the entry and student counts below before drawing conclusions.` });
    if (summary.late) insights.push({ title: 'Punctuality opportunity', body: `${summary.late} of ${summary.attended} attended entries were late. Review start-time reminders and session schedules.` });
    if (completedMissing) insights.push({ title: 'Records need reconciliation', body: `${completedMissing} entries in completed events still have no status. Resolve them before using rates for decisions.` });
    if (summary.not_recorded > completedMissing) insights.push({ title: 'Attendance is still being collected', body: `${summary.not_recorded - completedMissing} entries in unfinished events are awaiting a status. Live rates are provisional and exclude these entries from their denominators.` });
    if (followUps.length) insights.push({ title: 'Repeated absences', body: `${followUps.length} students have at least two absent entries. Review the sessions and contact students for context before taking action.` });
    const comparableGroups = groups.filter(group => group.resolved >= 10 && group.participationRate !== null);
    if (comparableGroups.length > 1) {
      const best = comparableGroups[0], lowest = comparableGroups[comparableGroups.length - 1];
      const gap = best.participationRate! - lowest.participationRate!;
      if (gap >= 10) insights.push({ title: 'Uneven participation', body: `${best.name} and ${lowest.name} differ by ${gap.toFixed(1)} percentage points. Each has at least 10 resolved entries; check audience and schedule differences.` });
    }
    if (!insights.length) insights.push({ title: 'No attendance flags in this scope', body: 'No late entries, unresolved statuses, or repeated absences were found. Continue monitoring as more sessions finish.' });
  }

  return <section aria-label="Attendance analytics" className="min-w-0 space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div>
      <h2 className="flex items-center gap-2 text-lg font-bold text-brand-900 dark:text-white"><Activity size={20} className="text-gold-500" /> Attendance intelligence</h2>
      <p className={muted}>{coverage === 'live' ? 'Completed + live attendance' : 'Completed events only'} · {summary.events} events · {summary.students} unique students · {summary.total} entries · Manila time</p>
      </div>
      <div className="w-full sm:w-64"><CustomSelect label="Analytics coverage" value={coverage} onChange={value => setCoverage(value as AnalyticsCoverage)} options={[{ value: 'live', label: 'Completed + live attendance' }, { value: 'completed', label: 'Completed events only' }]} /></div>
    </div>
    {!!provisionalEvents && <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">Live results: {provisionalEntries} entries from {provisionalEvents} unfinished events are included. Rates reflect recorded statuses and may change as attendance is collected. Unrecorded students are not counted as absent; repeated-absence follow-ups use completed events only.</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Participation rate" value={percentage(summary.participationRate)} icon={<Users size={20} />} detail={`${summary.attended} present or late / ${summary.resolved} resolved entries`} />
      <MetricCard label="Attendance credit" value={percentage(summary.attendanceRate)} icon={<CheckCircle size={20} />} detail="Present + late + excused / resolved entries" />
      <MetricCard label="On-time arrival" value={percentage(summary.punctualityRate)} icon={<Clock size={20} />} detail={`${summary.present} present / ${summary.attended} present or late entries`} />
      <MetricCard label="Record completeness" value={percentage(summary.coverageRate)} icon={<Activity size={20} />} detail={`${summary.not_recorded} entries awaiting a status`} />
    </div>
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Surface className="min-w-0 p-4 sm:p-6" aria-labelledby="attendance-trend-heading">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div><h3 id="attendance-trend-heading" className={panelTitle}>Participation & punctuality trends</h3><p className={muted}>Rates by attendance session date. Gaps without sessions are omitted.</p></div>
          <div role="group" aria-label="Trend interval" className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
            {(['day', 'week', 'month'] as const).map(value => <button key={value} type="button" aria-pressed={interval === value} onClick={() => setInterval(value)} className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize ${interval === value ? 'bg-white text-brand-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-300'}`}>{value}</button>)}
          </div>
        </div>
        {trend.length ? <>
          <div role="region" aria-label="Participation trend chart" className="h-64 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 256 }}>
              <LineChart data={trend} margin={{ top: 10, right: 12, bottom: 0, left: -15 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" /><XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} minTickGap={35} /><YAxis domain={[0, 100]} tickFormatter={value => `${value}%`} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip content={({ active, payload }) => {
                  const point = payload?.[0]?.payload;
                  return active && point ? <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-white"><p className="font-bold">{point.label}</p><p>Participation: {percentage(point.participationRate)}</p><p>On time: {percentage(point.punctualityRate)}</p><p>{point.resolved} resolved / {point.total} entries</p></div> : null;
                }} /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Line name="Participation" dataKey="participationRate" stroke="#10b981" strokeWidth={3} type="linear" dot={{ r: 3 }} connectNulls={false} />
                <Line name="On time" dataKey="punctualityRate" stroke="#3b82f6" strokeWidth={2} type="linear" dot={{ r: 3 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {trend.length === 1 && <p className={muted}>One time bucket is available. Choose a finer interval or widen the dates to see a trend.</p>}
          <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-brand-900 dark:text-slate-200">View trend data</summary><div className="mt-3 max-h-64 overflow-auto"><table aria-label="Attendance trend data" className="w-full text-left text-xs"><thead><tr><th className="py-2">Period starting</th><th>Participation</th><th>On time</th><th>Resolved / total</th></tr></thead><tbody>{trend.map(point => <tr key={point.time} className="border-t border-slate-200 dark:border-slate-700"><td className="py-2">{point.label}</td><td>{percentage(point.participationRate)}</td><td>{percentage(point.punctualityRate)}</td><td>{point.resolved} / {point.total}</td></tr>)}</tbody></table></div></details>
        </> : <p className="flex h-64 items-center justify-center text-center text-sm text-slate-500">{coverage === 'completed' ? 'No completed attendance sessions match these filters. Choose live attendance to include unfinished events.' : 'No recorded attendance sessions match these filters.'}</p>}
      </Surface>
      <Surface className="min-w-0 p-4 sm:p-6" aria-labelledby="attendance-comparison-heading">
        <h3 id="attendance-comparison-heading" className={panelTitle}>Period comparison</h3>
        <p className={`${muted} mt-1`}>{period === 'all' || !range.start && period === 'custom' ? 'Latest half of observed history versus the preceding equal-length span.' : 'Selected period to date versus the preceding equal-length span.'}</p>
        <div className="my-5 rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
          <p className="text-xs font-semibold text-slate-500">Participation change</p>
          <p className={`mt-2 flex items-center gap-2 text-3xl font-bold ${delta === null || delta === 0 ? 'text-slate-600 dark:text-slate-300' : delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {delta !== null && (delta < 0 ? <ArrowDownRight size={26} /> : delta > 0 ? <ArrowUpRight size={26} /> : null)}{delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} pp`}
          </p><p className={muted}>{delta === null ? 'Resolved entries are needed in both periods.' : 'pp = percentage points'}</p>
        </div>
        {comparison.end > comparison.start && <div className="space-y-4">
          {([{ title: 'Current', start: comparison.start, end: comparison.end, stats: comparison.current }, { title: 'Previous', start: comparison.previousStart, end: comparison.start, stats: comparison.previous }] as const).map(item => <div key={item.title} className="border-b border-slate-200 pb-3 last:border-0 dark:border-slate-700"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-brand-900 dark:text-white">{item.title}</p><span className="font-bold text-brand-900 dark:text-white">{percentage(item.stats.participationRate)}</span></div><p className={muted}>{shortDate(item.start)} – {shortDate(item.end - 1)}</p><p className={muted}>{item.stats.resolved} resolved entries · {item.stats.students} students · {item.stats.events} events</p></div>)}
        </div>}
        <p className={`${muted} mt-3`}>Audience and event mix may differ between periods. Missing records are excluded from rate denominators.</p>
      </Surface>
    </div>
    <Surface className="min-w-0 p-4 sm:p-6" aria-labelledby="attendance-groups-heading">
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h3 id="attendance-groups-heading" className={panelTitle}>Group comparison</h3><p className={muted}>Highest participation first. Counts represent attendance entries, including multiple sessions per student.</p></div><div className="w-full sm:w-56"><CustomSelect label="Compare by" value={grouping} onChange={value => { setGrouping(value as AnalyticsGrouping); setShowAll(false); }} options={[{ value: 'eventName', label: 'Event' }, { value: 'program', label: 'Program / strand' }, { value: 'section', label: 'Section' }, { value: 'level', label: 'Year / grade level' }]} /></div></div>
      {groups.length ? <><div className="overflow-x-auto"><table aria-label="Attendance group comparison" className="w-full min-w-[600px] text-left text-xs"><thead className="text-slate-500 dark:text-slate-400"><tr><th className="py-3 pr-4">Group</th><th className="pr-4">Participation</th><th className="pr-4">On time</th><th className="pr-4">Absent</th><th className="pr-4">Excused</th><th className="pr-4">Resolved / total</th><th>Students</th></tr></thead><tbody>{(showAll ? groups : groups.slice(0, 8)).map(group => <tr key={group.id} className="border-t border-slate-200 dark:border-slate-700"><th className="max-w-72 py-3 pr-4 font-semibold text-brand-900 dark:text-white">{group.name}{group.resolved < 10 && <span className="block font-normal text-slate-500">Small sample</span>}</th><td className="pr-4"><span className="font-bold">{percentage(group.participationRate)}</span><div aria-hidden="true" className="mt-1 h-1.5 w-20 rounded-full bg-slate-100 dark:bg-slate-700"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${group.participationRate || 0}%` }} /></div></td><td className="pr-4">{percentage(group.punctualityRate)}</td><td className="pr-4">{group.absent}</td><td className="pr-4">{group.excused}</td><td className="pr-4">{group.resolved} / {group.total}</td><td>{group.students}</td></tr>)}</tbody></table></div>{groups.length > 8 && <Button className="mt-4" size="sm" variant="secondary" fullWidth={false} onClick={() => setShowAll(!showAll)}>{showAll ? 'Show top 8 groups' : `Show all ${groups.length} groups`}</Button>}</> : <p className="py-6 text-center text-sm text-slate-500">No attendance records to compare.</p>}
    </Surface>
    <Surface className="p-4 sm:p-6" aria-labelledby="attendance-insights-heading">
      <h3 id="attendance-insights-heading" className={`${panelTitle} flex items-center gap-2`}><Lightbulb size={18} className="text-gold-500" /> Insights & follow-up</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{insights.map(insight => <div key={insight.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900"><h4 className="text-sm font-semibold text-brand-900 dark:text-white">{insight.title}</h4><p className={`${muted} mt-1`}>{insight.body}</p></div>)}</div>
      {!!followUps.length && <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-brand-900 dark:text-white">Review {followUps.length} students with repeated absences</summary><p className={`${muted} mt-2`}>Two or more absent entries in completed sessions within this scope. Several entries may belong to one event.</p><ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-700">{(showFollowUps ? followUps : followUps.slice(0, 8)).map(student => <li key={student.uid} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="font-semibold text-brand-900 dark:text-white">{student.name}</span><span className={muted}>{student.absent} absent / {student.resolved} resolved entries · {student.events} events</span></li>)}</ul>{followUps.length > 8 && <Button size="sm" variant="secondary" fullWidth={false} onClick={() => setShowFollowUps(!showFollowUps)}>{showFollowUps ? 'Show first 8 students' : `Show all ${followUps.length} students`}</Button>}</details>}
      <details className="mt-4"><summary className="cursor-pointer text-xs font-semibold text-slate-500 dark:text-slate-300">How these analytics are calculated</summary><p className={`${muted} mt-2`}>One entry is one student attendance record for an event or session. By default, completed events and unfinished events with recorded attendance are analyzed; future session dates are excluded. Choose Completed events only to restrict results to finalized events. Unfinished event rates are provisional, and repeated-absence follow-ups use completed events only. Session dates come from the attendance slot, falling back to the check-in time or event start. Participation counts present and late; attendance credit also counts excused. Both divide by present + late + excused + absent. On-time arrival is present / (present + late). No Record affects completeness but is excluded from rates. Comparisons use equal numbers of calendar days, including today for week and month filters. This panel applies your event and academic filters to both periods. Insights use explicit rules and do not predict future attendance.</p></details>
    </Surface>
  </section>;
}
