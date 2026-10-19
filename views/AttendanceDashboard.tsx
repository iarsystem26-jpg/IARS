import RecordPagination from '../components/ui/RecordPagination';
import { usePagination } from '../components/usePagination';
import { hasPermission } from '../lib/accessControl';
import { usePageMemory } from '../components/usePageMemory';
import { formatManilaDate, formatManilaTime, parseManilaDateTime } from '../lib/dateTime';
import { attendanceWindowTitle, eventDisplayTitle } from '../lib/eventGroups';
import { toast } from '../lib/toast';
import ErrorNotice from '../components/ui/ErrorNotice';
import { downloadCsv } from '../lib/export';
import { attendanceSpreadsheetRows } from '../lib/attendanceSpreadsheet';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../components/AuthContext';
import { appData } from '../lib/backend';
import { AppEvent } from '../types';
import CustomSelect from '../components/ui/CustomSelect';
import { Filter, Download, PieChart, Users, CheckCircle, XCircle, Clock, AlertCircle, FileText, Printer } from 'lucide-react';
import { 
  PieChart as RePieChart, Pie, Cell, BarChart as ReBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart as ReLineChart, Line
} from 'recharts';
import type { AttendanceReportOptions } from '../lib/attendanceReport';
import { useAttendanceReportPreview } from '../components/attendance/useAttendanceReportPreview';
import { studentBelongsToReportUnit } from '../lib/attendanceReportScope';
import { findNodePath } from '../lib/academicDirectory';
import { AcademicPathPicker } from '../components/academic/AcademicPathPicker';
import Button from '../components/ui/Button';
import { MetricCard, Page, PageHeader, Surface } from '../components/ui/Page';
import { Modal } from '../components/ui/Modal';
import AttendanceAnalytics from '../components/attendance/AttendanceAnalytics';
import { AnalyticsRecord, attendanceBounds, attendanceTrend } from '../lib/attendanceAnalytics';

// --- Types ---

type TimeFilter = 'all' | 'this_month' | 'this_week' | 'custom';
type LevelFilter = 'all' | 'tertiary' | 'secondary' | 'elementary';
type ChartType = 'pie' | 'donut' | 'column' | 'bar' | 'line';

interface FilterState {
  level: LevelFilter;
  // Tertiary
  college: string;
  program: string;
  major: string;
  yearLevel: string;
  section: string;
  // Secondary
  secondaryType: 'shs' | 'jhs' | '';
  strand: string;
  specialization: string;
  gradeLevel: string;
  // Elementary
  elemGradeLevel: string;
}

interface AttendanceRecord extends AnalyticsRecord {
  id: string;
  eventTitle: string;
  studentUid: string;
  studentId: string;
  studentName: string;
  status: 'present' | 'late' | 'excused' | 'absent' | 'not_recorded';
  timeIn?: number;
  recordedAt: number;
  section: string;
  program?: string; // or strand/track
  level: string;
}

const statusClasses: Record<AttendanceRecord['status'], string> = {
  present: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  late: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  excused: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  absent: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  not_recorded: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200',
};

const formatStatus = (status: AttendanceRecord['status']) =>
  status === 'not_recorded' ? 'No Record' : `${status.charAt(0).toUpperCase()}${status.slice(1)}`;

const AttendanceDashboard: React.FC = () => {
  const { isMock, profile, revision } = useAuth();
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [selectedEvents, setSelectedEvents] = usePageMemory<string[]>('selectedEvents', []);
  const [timeFilter, setTimeFilter] = usePageMemory<TimeFilter>('timeFilter', 'all');
  const [dateRange, setDateRange] = usePageMemory('dateRange', { start: '', end: '' });
  
  const [filters, setFilters] = usePageMemory<FilterState>('filters', {
    level: 'all',
    college: '', program: '', major: '', yearLevel: '', section: '',
    secondaryType: '', strand: '', specialization: '', gradeLevel: '',
    elemGradeLevel: ''
  });

  const [chartType, setChartType] = usePageMemory<ChartType>('chartType', 'pie');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportSettings, setExportSettings] = useState({
    groupBy: 'status' as 'status' | 'program' | 'section' | 'level',
    includeCharts: true,
    includeTables: true
  });

  const [showTimeModal, setShowTimeModal] = useState(false);
  const [showEventDropdown, setShowEventDropdown] = useState(false);
  const [eventSearch, setEventSearch] = usePageMemory('eventSearch', '');

  // Load initial data
  useEffect(() => {
    {
      setEvents((profile && typeof appData.getVisibleEvents === 'function' ? appData.getVisibleEvents(profile.uid) : appData.getEvents()).filter(event => !event.isGeneralEvent));
    }
  }, [revision, profile?.uid]);

  // Derived Data
  const analyticsNow = useMemo(() => Date.now(), [revision, timeFilter, dateRange]);
  const scopedAttendanceData = useMemo<AttendanceRecord[]>(() => {
    if (!profile) return [];
    const students = appData.getVisibleStudents(profile.uid);
    const allEvents = appData.getEvents();
    const studentRecords = new Map(students.map(student => [student.uid, appData.getAttendanceRecords?.(student.uid) || []]));
    return events.filter(event => !event.cancellationStatus && (!selectedEvents.length || selectedEvents.includes(event.id)))
      .flatMap(event => {
        const logs = appData.getAttendanceLogs(event.id);
        return students.filter(student => appData.isEventRecipient(event, student)).filter(student => {
          const data = student.school_data;
          if (filters.level === 'tertiary' && data.type !== 'College') return false;
          if (filters.level === 'secondary' && data.type !== 'High School') return false;
          if (filters.level === 'elementary' && !/grade [1-6]$/i.test(data.level)) return false;
          const matches = (value: string, actual?: string) => !value || (actual || '').toLowerCase().includes(value.toLowerCase());
          return matches(filters.section, data.section) && matches(filters.program, data.program) && matches(filters.strand, data.strand)
            && matches(filters.gradeLevel || filters.yearLevel || filters.elemGradeLevel, data.level)
            && matches(filters.major, data.major) && matches(filters.college, data.department)
            && (!filters.secondaryType || (filters.secondaryType === 'shs' ? /senior/i : /junior/i).test(data.department || ''));
        }).flatMap(student => {
          const records = studentRecords.get(student.uid)!.filter(record => record.event?.id === event.id);
          const rows = records.length ? records : [{ id: `${event.id}:${student.uid}`, slot: '', status: logs[student.uid]?.status || (event.status === 'done' ? 'absent' : 'not_recorded'), time_in: logs[student.uid]?.time_in }];
          return rows.map(record => ({ id: `${student.uid}:${record.id}`, studentUid: student.uid, studentId: student.student_id, studentName: student.name,
            eventId: event.id, eventName: eventDisplayTitle(event, allEvents), completed: event.status === 'done',
            attendanceDate: /^\d{4}-\d{2}-\d{2}(?::|$)/.test(record.slot) ? parseManilaDateTime(record.slot.split(':')[0]) : Number(record.time_in || event.startTime),
            eventTitle: [eventDisplayTitle(event, allEvents), record.slot === 'default' ? '' : record.slot.split(':')[0], attendanceWindowTitle(event, record.slot)].filter(Boolean).join(' / '),
            status: record.status as AttendanceRecord['status'], timeIn: record.time_in, recordedAt: Number(record.time_in || record.recorded_at || event.startTime || 0), section: student.school_data.section,
            program: student.school_data.program || student.school_data.strand, level: student.school_data.level,
          }));
        });
      }).sort((a, b) => b.recordedAt - a.recordedAt || a.studentName.localeCompare(b.studentName) || a.id.localeCompare(b.id));
  }, [events, filters, selectedEvents, profile?.uid, revision]);
  const attendanceData = useMemo(() => {
    const { start, end } = attendanceBounds(timeFilter, dateRange, analyticsNow);
    return scopedAttendanceData.filter(record => record.attendanceDate >= start && record.attendanceDate < end);
  }, [scopedAttendanceData, timeFilter, dateRange, analyticsNow]);
  const statusTrend = useMemo(() => attendanceTrend(attendanceData, 'day').map(point => ({ ...point, name: formatManilaDate(point.time, { month: 'short' }) })), [attendanceData]);
  const [exportPathIds, setExportPathIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const directory = useMemo(() => appData.getSchoolStructure(), [revision]);
  const exportPath = useMemo(() => {
    const path = findNodePath(directory, exportPathIds[exportPathIds.length - 1]) || [];
    return path.length === exportPathIds.length && path.every((node, index) => node.id === exportPathIds[index]
      && !node.metadata?.archived && node.metadata?.selectableForRegistration !== false) ? path : [];
  }, [directory, exportPathIds]);
  const canExportReport = hasPermission(profile?.role, 'attendance.manage');
  const selectedExportUnit = exportPath.some(node => !['campus', 'school'].includes(node.type)) ? exportPath[exportPath.length - 1] : undefined;
  const exportRecords = useMemo(() => {
    if (!selectedExportUnit || !profile) return [];
    const studentIds = new Set(appData.getVisibleStudents(profile.uid)
      .filter(student => studentBelongsToReportUnit(student, selectedExportUnit.id, directory))
      .map(student => student.uid));
    return attendanceData.filter(record => studentIds.has(record.studentUid));
  }, [attendanceData, selectedExportUnit, profile?.uid, directory, revision]);


  const reportPeriod = timeFilter === 'custom' ? `${dateRange.start || 'Beginning'} to ${dateRange.end || 'Present'}`
    : { all: 'All time', this_month: 'This month', this_week: 'This week' }[timeFilter];
  const reportEventScope = selectedEvents.length
    ? events.filter(event => selectedEvents.includes(event.id)).map(event => eventDisplayTitle(event, appData.getEvents())).join(', ')
    : 'All events';
  const reportFilterLabels: Record<string, string> = { level: 'Education level', college: 'College', program: 'Program', major: 'Major', yearLevel: 'Year', section: 'Section', secondaryType: 'Secondary type', strand: 'Strand', specialization: 'Specialization', gradeLevel: 'Grade', elemGradeLevel: 'Elementary grade' };
  const activeReportFilters = Object.entries(filters).filter(([key, value]) => key !== 'level' && value)
    .map(([key, value]) => `${reportFilterLabels[key]}: ${value}`).join(' | ');
  const reportDashboardLevel = { all: 'No additional restriction', tertiary: 'Tertiary (College)', secondary: 'Secondary (High School)', elementary: 'Elementary' }[filters.level];
  const reportAcademicLevel = [...exportPath].reverse().find(node => ['grade_level', 'year_level', 'level'].includes(node.type))?.name
    || (selectedExportUnit ? `All grades and years within ${selectedExportUnit.name}` : 'Choose an academic unit');
  const reportOptions = useMemo<AttendanceReportOptions | null>(() => {
    if (!showExportModal || !canExportReport || !selectedExportUnit) return null;
    return {
      schoolName: exportPath.find(node => !['campus', 'school'].includes(node.type))!.name,
      scope: `Academic unit: ${exportPath.map(node => node.name).join(' / ')} | Period: ${reportPeriod} | Events: ${reportEventScope}${filters.level !== 'all' ? ' | Dashboard education filter: ' + reportDashboardLevel : ''}${activeReportFilters ? ' | ' + activeReportFilters : ''}.`,
      records: exportRecords,
      ...exportSettings,
    };
  }, [showExportModal, canExportReport, selectedExportUnit, exportPath, reportPeriod, reportEventScope, filters.level, reportDashboardLevel, activeReportFilters, exportRecords, exportSettings]);
  const reportPreview = useAttendanceReportPreview(reportOptions);
  const reportStudentCount = new Set(exportRecords.map(record => record.studentUid)).size;

  const attendancePage = usePagination(attendanceData, JSON.stringify([profile?.uid, filters, selectedEvents, timeFilter, dateRange]));
  const recentRecords = attendanceData.filter(record => record.status !== 'not_recorded').slice(0, 10);
  
  const stats = useMemo(() => {
    const s = { present: 0, late: 0, excused: 0, absent: 0, not_recorded: 0, total: 0 };
    attendanceData.forEach(r => {
      s[r.status]++;
      s.total++;
    });
    return s;
  }, [attendanceData]);

  const chartData = useMemo(() => {
    const data = [
      { name: 'Present', value: stats.present, color: '#22c55e' },
      { name: 'Late', value: stats.late, color: '#eab308' },
      { name: 'Excused', value: stats.excused, color: '#3b82f6' },
      { name: 'Absent', value: stats.absent, color: '#ef4444' },
      { name: 'No Record', value: stats.not_recorded, color: '#94a3b8' },
    ];
    return data.filter(d => d.value > 0);
  }, [stats]);

  // Filtered Events for Search
  const filteredEvents = useMemo(() => {
    if (!eventSearch) return events;
    return events.filter(e => e.title.toLowerCase().includes(eventSearch.toLowerCase()));
  }, [events, eventSearch]);

  const toggleEventSelection = (eventId: string) => {
    if (selectedEvents.includes(eventId)) {
      setSelectedEvents(selectedEvents.filter(id => id !== eventId));
    } else {
      setSelectedEvents([...selectedEvents, eventId]);
    }
  };

  // --- Export Logic ---
  const handleExportPDF = async () => {
    if (exporting || !canExportReport || !selectedExportUnit || !reportPreview.doc) return;
    setExporting(true);
    try {
      await toast.track(async () => {
        const doc = reportPreview.doc!;
        const filename = exportPath.map(node => node.name).join('_').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
        await doc.save(`attendance_report_${filename || 'school'}.pdf`, { returnPromise: true });
        setShowExportModal(false);
      }, 'Export PDF', 'PDF download started');
    } finally {
      setExporting(false);
    }
  };

  const handleExportCSV = () => {
    downloadCsv('attendance_data.csv', attendanceSpreadsheetRows(attendanceData));
  };

  const [exportingSpreadsheet, setExportingSpreadsheet] = useState(false);
  const handleExportSpreadsheet = async () => {
    if (exportingSpreadsheet) return;
    setExportingSpreadsheet(true);
    const progress = toast.start('Export Excel report', ['Preparing summary and charts']);
    try {
      const { downloadAttendanceWorkbook } = await import('../lib/attendanceSpreadsheet');
      await downloadAttendanceWorkbook({
        records: attendanceData,
        scope: `Period: ${reportPeriod} | Events: ${reportEventScope} | Education filter: ${reportDashboardLevel}${activeReportFilters ? ' | ' + activeReportFilters : ''}`,
      });
      progress.complete('Excel report download started');
    } catch (error) {
      progress.fail(error, 'Could not export the Excel report. Please try again.');
    } finally {
      setExportingSpreadsheet(false);
    }
  };

  return (
    <Page className="max-w-[1600px] animate-in fade-in">
      <PageHeader
        actions={(
          <>
            <Button aria-label="Export report" disabled={!canExportReport} className="sm:w-auto" onClick={() => setShowExportModal(true)} size="sm">
              <Printer size={16} /> PDF report
            </Button>
            <Button aria-label="Export Excel report" title="Formatted workbook with a summary, charts, and detailed records (.xlsx)" disabled={exportingSpreadsheet} className="sm:w-auto" onClick={handleExportSpreadsheet} size="sm" variant="gold">
              <Download size={16} /> {exportingSpreadsheet ? 'Preparing Excel...' : 'Excel report'}
            </Button>
            <Button title="Plain data for importing into other tools; use Excel report for styling and charts" className="sm:w-auto dark:border-slate-600 dark:bg-slate-800 dark:text-white" onClick={handleExportCSV} size="sm" variant="secondary">
              <Download size={16} /> CSV
            </Button>
          </>
        )}
        className="flex-col sm:flex-row"
        description="Analytics & Reporting Module"
        eyebrow="Attendance Administration"
        title="Attendance Dashboard"
      />

      <Surface aria-label="Attendance filters" className="space-y-5 p-4 sm:p-6">
        <h2 id="attendance-filters-heading" className="flex items-center gap-2 border-b border-slate-200 pb-4 text-xs font-black uppercase tracking-widest text-brand-900 dark:border-slate-700 dark:text-white">
          <Filter size={14} className="text-gold-500" /> Data Filters
        </h2>
        <div className="flex flex-wrap gap-4 [&>*]:min-w-0 [&>*]:basis-full sm:[&>*]:basis-[calc(50%-0.5rem)] xl:[&>*]:basis-[calc(25%-0.75rem)]">
          <CustomSelect
            label="Event Scope"
            multi
            onChange={(value) => {
              if (Array.isArray(value)) setSelectedEvents(value);
              else setSelectedEvents([value]);
            }}
            options={events.map((event) => ({ value: event.id, label: eventDisplayTitle(event, appData.getEvents()) }))}
            placeholder="All Events"
            searchable
            value={selectedEvents}
          />
          <CustomSelect
            label="Time Period"
            onChange={(value) => {
              const nextFilter = value as TimeFilter;
              setTimeFilter(nextFilter);
              if (nextFilter === 'custom') setShowTimeModal(true);
            }}
            options={[
              { value: 'all', label: 'All Time' },
              { value: 'this_month', label: 'This Month' },
              { value: 'this_week', label: 'This Week' },
              { value: 'custom', label: 'Custom Range...' },
            ]}
            value={timeFilter}
          />
          <CustomSelect
            label="Education Level"
            onChange={(value) => setFilters({ ...filters, level: value as LevelFilter })}
            options={[
              { value: 'all', label: 'All Levels' },
              { value: 'tertiary', label: 'Tertiary (College)' },
              { value: 'secondary', label: 'Secondary (High School)' },
              { value: 'elementary', label: 'Elementary' },
            ]}
            value={filters.level}
          />
        </div>

        {filters.level === 'tertiary' ? (
          <div className="flex flex-wrap gap-4 animate-in fade-in slide-in-from-top-2 [&>*]:min-w-0 [&>*]:basis-full sm:[&>*]:basis-[calc(50%-0.5rem)] xl:[&>*]:basis-[calc(25%-0.75rem)]">
            <CustomSelect label="College" onChange={(value) => setFilters({ ...filters, college: value as string })} options={[{ value: '', label: 'All Colleges' }, { value: 'cas', label: 'Arts & Sciences' }, { value: 'cba', label: 'Business Admin' }, { value: 'ccje', label: 'Criminal Justice' }]} value={filters.college} />
            <CustomSelect label="Program" onChange={(value) => setFilters({ ...filters, program: value as string })} options={[{ value: '', label: 'All Programs' }, { value: 'bscs', label: 'BS Computer Science' }, { value: 'bsit', label: 'BS Info Tech' }]} value={filters.program} />
            <CustomSelect label="Year Level" onChange={(value) => setFilters({ ...filters, yearLevel: value as string })} options={[{ value: '', label: 'All Years' }, { value: '1', label: '1st Year' }, { value: '2', label: '2nd Year' }, { value: '3', label: '3rd Year' }, { value: '4', label: '4th Year' }]} value={filters.yearLevel} />
          </div>
        ) : null}

        {filters.level === 'secondary' ? (
          <div className="flex flex-wrap gap-4 animate-in fade-in slide-in-from-top-2 [&>*]:min-w-0 [&>*]:basis-full sm:[&>*]:basis-[calc(50%-0.5rem)] xl:[&>*]:basis-[calc(25%-0.75rem)]">
            <CustomSelect label="Type" onChange={(value) => setFilters({ ...filters, secondaryType: value as FilterState['secondaryType'] })} options={[{ value: '', label: 'All Secondary' }, { value: 'shs', label: 'Senior High' }, { value: 'jhs', label: 'Junior High' }]} value={filters.secondaryType} />
            {filters.secondaryType === 'shs' ? (
              <>
                <CustomSelect label="Strand" onChange={(value) => setFilters({ ...filters, strand: value as string })} options={[{ value: '', label: 'All Strands' }, { value: 'stem', label: 'STEM' }, { value: 'abm', label: 'ABM' }, { value: 'humss', label: 'HUMSS' }]} value={filters.strand} />
                <CustomSelect label="Grade" onChange={(value) => setFilters({ ...filters, gradeLevel: value as string })} options={[{ value: '', label: 'All Grades' }, { value: '11', label: 'Grade 11' }, { value: '12', label: 'Grade 12' }]} value={filters.gradeLevel} />
              </>
            ) : null}
            {filters.secondaryType === 'jhs' ? (
              <CustomSelect label="Grade" onChange={(value) => setFilters({ ...filters, gradeLevel: value as string })} options={[{ value: '', label: 'All Grades' }, { value: '7', label: 'Grade 7' }, { value: '8', label: 'Grade 8' }, { value: '9', label: 'Grade 9' }, { value: '10', label: 'Grade 10' }]} value={filters.gradeLevel} />
            ) : null}
          </div>
        ) : null}
      </Surface>

      <div aria-label="Attendance summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard detail={`${new Set(attendanceData.map(record => record.studentUid)).size} students / ${stats.total} entries`} icon={<CheckCircle size={22} />} label="Present" value={stats.present} />
        <MetricCard icon={<Clock size={22} />} label="Late" value={stats.late} />
        <MetricCard icon={<FileText size={22} />} label="Excused" value={stats.excused} />
        <MetricCard icon={<XCircle size={22} />} label="Absent" value={stats.absent} />
        <MetricCard icon={<AlertCircle size={22} />} label="No Record" value={stats.not_recorded} />
      </div>

      <AttendanceAnalytics records={scopedAttendanceData} period={timeFilter} range={dateRange} now={analyticsNow} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Surface className="min-w-0 p-4 sm:p-6 lg:col-span-2">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-brand-900 dark:text-white">
              <PieChart size={14} className="text-gold-500" /> Data Visualization
            </h2>
            <div aria-label="Chart type" className="flex max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900" role="group">
              {(['pie', 'donut', 'bar', 'column', 'line'] as ChartType[]).map((type) => (
                <button aria-pressed={chartType === type} className={`shrink-0 rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-widest ${chartType === type ? 'bg-white text-brand-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-300'}`} key={type} onClick={() => setChartType(type)} type="button">
                  {type}
                </button>
              ))}
            </div>
          </div>
          <div aria-label="Attendance visualization" className="h-64 min-h-64 min-w-0 w-full sm:h-72 sm:min-h-72" role="region">
            <ResponsiveContainer height="100%" initialDimension={{ width: 1, height: 256 }} minHeight={256} minWidth={0} width="100%">
              {chartType === 'pie' || chartType === 'donut' ? (
                <RePieChart>
                  <Pie data={chartData} dataKey="value" innerRadius={chartType === 'donut' ? 52 : 0} outerRadius={90} paddingAngle={2}>
                    {chartData.map((entry, index) => <Cell fill={entry.color} key={`cell-${index}`} />)}
                  </Pie>
                  <Tooltip /><Legend />
                </RePieChart>
              ) : chartType === 'bar' ? (
                <ReBarChart data={chartData} layout="vertical"><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis type="number" /><YAxis dataKey="name" type="category" width={80} /><Tooltip /><Legend /><Bar dataKey="value" fill="#D4AF37" radius={[0, 4, 4, 0]} /></ReBarChart>
              ) : chartType === 'column' ? (
                <ReBarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend /><Bar dataKey="value" fill="#0E1B42" radius={[4, 4, 0, 0]} /></ReBarChart>
              ) : (
                <ReLineChart data={statusTrend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Line name="Present" dataKey="present" dot={{ r: 4 }} stroke="#22c55e" strokeWidth={2} type="linear" /><Line name="Late" dataKey="late" stroke="#eab308" strokeWidth={2} type="linear" /><Line name="Absent" dataKey="absent" stroke="#ef4444" strokeWidth={2} type="linear" /><Line name="Excused" dataKey="excused" stroke="#3b82f6" strokeWidth={2} type="linear" /></ReLineChart>
              )}
            </ResponsiveContainer>
          </div>
        </Surface>

        <Surface className="flex min-w-0 flex-col p-4 sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-brand-900 dark:text-white"><Users size={14} className="text-gold-500" /> Recent Logs</h2>
          <div className="max-h-72 flex-1 space-y-3 overflow-y-auto pr-1">
            {recentRecords.map((record) => (
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900" key={record.id}>
                <span aria-hidden="true" className={`h-10 w-2 shrink-0 rounded-full ${record.status === 'present' ? 'bg-emerald-500' : record.status === 'late' ? 'bg-amber-500' : record.status === 'absent' ? 'bg-red-500' : 'bg-slate-300'}`} />
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-brand-900 dark:text-white">{record.studentName}<span className="block text-xs font-normal text-slate-500">{record.eventTitle}</span></p><p className="text-[10px] uppercase tracking-wider text-slate-500">{record.studentId}</p></div>
                <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-500">{record.timeIn ? formatManilaTime(record.timeIn, { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
              </div>
            ))}
            {!recentRecords.length && <p className="py-6 text-center text-sm text-slate-500">No recorded attendance yet.</p>}
          </div>
        </Surface>
      </div>

      <Surface aria-labelledby="attendance-records-heading" className="overflow-hidden">
        <div className="border-b border-slate-200 p-4 dark:border-slate-700 sm:p-6">
          <h2 id="attendance-records-heading" className="text-sm font-black uppercase tracking-widest text-brand-900 dark:text-white">Detailed Attendance Records</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{attendanceData.length} student attendance entries · Newest first</p>
        </div>
        <div className="desktop-data-table overflow-x-auto">
          <table aria-label="Attendance records" className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-900 dark:text-slate-300"><tr><th className="px-5 py-3">Student</th><th className="px-5 py-3">ID</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Section</th><th className="px-5 py-3">Level</th><th className="px-5 py-3">Date / time in</th></tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {attendancePage.visible.map((record) => <tr key={record.id}><td className="px-5 py-3 font-semibold text-brand-900 dark:text-white">{record.studentName}<span className="block text-xs font-normal text-slate-500">{record.eventTitle}</span></td><td className="px-5 py-3 font-mono text-xs text-slate-500">{record.studentId}</td><td className="px-5 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusClasses[record.status]}`}>{formatStatus(record.status)}</span></td><td className="px-5 py-3 text-slate-600 dark:text-slate-300">{record.section}</td><td className="px-5 py-3 text-slate-600 dark:text-slate-300">{record.level}</td><td className="px-5 py-3 text-slate-600 dark:text-slate-300"><span className="block font-semibold">{formatManilaDate(record.recordedAt, { month: 'short' })}</span><span className="mt-1 block text-xs text-slate-500">{record.timeIn ? formatManilaTime(record.timeIn) : 'Not recorded'}</span></td></tr>)}
              {!attendanceData.length && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-500">No attendance records match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 p-4 md:hidden">
          {attendancePage.visible.map((record) => (
            <article aria-label={`${record.studentName} attendance record`} className="mobile-data-card rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900" key={record.id}>
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-bold text-brand-900 dark:text-white">{record.studentName}<span className="block text-xs font-normal text-slate-500">{record.eventTitle}</span></h3><p className="font-mono text-xs text-slate-500">{record.studentId}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${statusClasses[record.status]}`}>{formatStatus(record.status)}</span></div>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt className="font-semibold text-slate-500">Section</dt><dd className="mt-0.5 text-slate-800 dark:text-slate-200">{record.section}</dd></div><div><dt className="font-semibold text-slate-500">Level</dt><dd className="mt-0.5 text-slate-800 dark:text-slate-200">{record.level}</dd></div><div className="col-span-2"><dt className="font-semibold text-slate-500">Date / time in</dt><dd className="mt-0.5 text-slate-800 dark:text-slate-200">{formatManilaDate(record.recordedAt, { month: 'short' })} · {record.timeIn ? formatManilaTime(record.timeIn) : 'Not recorded'}</dd></div></dl>
            </article>
          ))}
          {!attendanceData.length && <p className="p-4 text-center text-sm text-slate-500">No attendance records match these filters.</p>}
        </div>
        <RecordPagination {...attendancePage} label="Admin attendance pagination" />
      </Surface>

      <Modal
        footer={<>
          <p className="mr-auto self-center text-xs text-slate-500 dark:text-slate-400">{reportPreview.doc ? `${reportPreview.pages} ${reportPreview.pages === 1 ? 'page' : 'pages'} | A4 PDF | Manila time (UTC+8)` : 'Choose a unit and review the preview before downloading.'}</p>
          <Button variant="secondary" className="sm:w-auto" disabled={exporting} onClick={() => setShowExportModal(false)}>Cancel</Button>
          <Button aria-label="Generate PDF report" disabled={exporting || !canExportReport || !reportPreview.doc} className="sm:w-auto" onClick={handleExportPDF} variant="gold"><Download size={16} /> {exporting ? 'Downloading...' : 'Download PDF'}</Button>
        </>}
        onClose={() => { if (!exporting) setShowExportModal(false); }}
        open={showExportModal}
        size="xl"
        title="Download attendance report"
        description="Choose your academic scope, customize the contents, and review the exact PDF before downloading."
      >
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="min-w-0 space-y-5">
            <section className="space-y-3" aria-labelledby="export-scope-heading">
              <div><h3 id="export-scope-heading" className="text-sm font-bold text-brand-900 dark:text-white">1. Choose the academic unit</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Use the enrollment directory to select a whole educational unit or narrow it to a program, grade, year, or section. &ldquo;All of&rdquo; includes the students below that unit.</p></div>
              <AcademicPathPicker roots={directory} value={exportPathIds} purpose="registration" allowParentSelection
                disabled={exporting} onChange={path => setExportPathIds(path.map(node => node.id))} />
              <p className="text-xs text-slate-500 dark:text-slate-400">{!directory.length
                ? 'No educational units are available. Add a unit in the academic directory before exporting.'
                : selectedExportUnit ? `${exportRecords.length} attendance entries match this unit and your current filters.`
                  : 'Select an educational unit to prepare your report.'}</p>
            </section>
            <section aria-labelledby="export-filters-heading" className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
              <h3 id="export-filters-heading" className="text-sm font-bold text-brand-900 dark:text-white">Current report scope</h3>
              <dl className="mt-3 space-y-3 text-xs">
                {[['Selected academic scope', exportPath.map(node => node.name).join(' / ') || 'Choose an academic unit'], ['Grade / year', reportAcademicLevel], ['Period', reportPeriod], ['Events', reportEventScope], ['Dashboard education filter', reportDashboardLevel], ['Additional filters', activeReportFilters || 'None']].map(([label, value]) => <div key={label}><dt className="font-semibold text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-0.5 break-words text-slate-800 dark:text-slate-200">{value}</dd></div>)}
              </dl>
              <p className="mt-3 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500 dark:border-slate-700 dark:text-slate-400">The selected academic scope limits this report. Dashboard filters narrow it further; no additional restriction includes only students within your selection. Close this panel to change dashboard filters. Only students you are authorized to view are included.</p>
            </section>
            <section aria-labelledby="export-contents-heading" className="space-y-3">
              <div><h3 id="export-contents-heading" className="text-sm font-bold text-brand-900 dark:text-white">2. Customize report contents</h3><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Every report includes the school seal, generation time, student and entry totals, attendance rate, and a summary of all five statuses.</p></div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><input aria-label="Include Visualizations" disabled={exporting} checked={exportSettings.includeCharts} className="mt-0.5 h-4 w-4 shrink-0 accent-gold-500" onChange={event => setExportSettings({ ...exportSettings, includeCharts: event.target.checked })} type="checkbox" /><span><span className="block text-sm font-semibold text-brand-900 dark:text-white">Include Visualizations</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">Compact bars show entry counts and percentages for the grouping you choose.</span></span></label>
              <CustomSelect ariaLabel="Group data by" combobox label="Group visualization by" disabled={exporting || !exportSettings.includeCharts} onChange={value => setExportSettings({ ...exportSettings, groupBy: value as typeof exportSettings.groupBy })} options={[{ value: 'status', label: 'Attendance Status' }, { value: 'section', label: 'Section' }, { value: 'level', label: 'Level' }, { value: 'program', label: 'Program' }]} value={exportSettings.groupBy} />
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><input aria-label="Include Detailed Tables" disabled={exporting} checked={exportSettings.includeTables} className="mt-0.5 h-4 w-4 shrink-0 accent-gold-500" onChange={event => setExportSettings({ ...exportSettings, includeTables: event.target.checked })} type="checkbox" /><span><span className="block text-sm font-semibold text-brand-900 dark:text-white">Include Detailed Tables</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">Lists each student's name, ID, event or session, status, section, level, and attendance date and time.</span></span></label>
            </section>
          </div>
          <section aria-labelledby="export-preview-heading" className="min-w-0 space-y-3 lg:sticky lg:top-0 lg:self-start">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="export-preview-heading" className="text-sm font-bold text-brand-900 dark:text-white">3. Preview your PDF</h3>{reportPreview.url && <a href={reportPreview.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-gold-700 underline dark:text-gold-300">Open full preview</a>}</div>
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">This is the PDF you will download. It updates when you change the unit or report contents.</p>
            <dl aria-label="Export totals" className="grid grid-cols-3 gap-2">
              {[['Students', selectedExportUnit ? reportStudentCount : '—'], ['Entries', selectedExportUnit ? exportRecords.length : '—'], ['Pages', reportPreview.pages || '—']].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-100 p-3 dark:bg-slate-900"><dt className="text-[11px] text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 text-lg font-bold text-brand-900 dark:text-white">{value}</dd></div>)}
            </dl>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-900" aria-busy={reportPreview.loading}>
              {reportPreview.url ? <iframe title="Attendance PDF preview" src={`${reportPreview.url}#toolbar=0&navpanes=0&view=FitH`} className="h-[460px] w-full sm:h-[580px]" />
                : <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 p-6 text-center">
                  <FileText size={32} className="text-slate-400" />
                  {reportPreview.error ? <><ErrorNotice error={reportPreview.error} operation="Preview attendance report" /><Button onClick={reportPreview.retry} variant="secondary" fullWidth={false}>Retry preview</Button></>
                    : <p role="status" className="text-sm text-slate-500 dark:text-slate-400">{reportPreview.loading ? 'Preparing your PDF preview...' : 'Choose an educational unit to see your report here.'}</p>}
                </div>}
            </div>
            {selectedExportUnit && exportRecords.length === 0 && <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">No attendance entries match this unit and your dashboard filters. The PDF will contain an empty report. Choose another unit or adjust your dashboard filters.</p>}
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">A student can have several attendance entries across events and sessions. Attendance rate counts present, late, and excused entries. All dates and times use Asia/Manila (UTC+8). If your browser does not display the PDF here, use &ldquo;Open full preview.&rdquo;</p>
          </section>
        </div>
      </Modal>

      <Modal footer={<Button aria-label="Apply range" className="sm:w-auto" onClick={() => setShowTimeModal(false)} variant="gold">Apply</Button>} onClose={() => setShowTimeModal(false)} open={showTimeModal} size="sm" title="Select Date Range">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300" htmlFor="attendance-start-date">Start Date</label><input className="app-control w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-brand-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" id="attendance-start-date" onChange={(event) => setDateRange({ ...dateRange, start: event.target.value })} type="date" value={dateRange.start} /></div>
          <div className="space-y-2"><label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300" htmlFor="attendance-end-date">End Date</label><input className="app-control w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-brand-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" id="attendance-end-date" onChange={(event) => setDateRange({ ...dateRange, end: event.target.value })} type="date" value={dateRange.end} /></div>
        </div>
      </Modal>
    </Page>
  );
};

export default AttendanceDashboard;
