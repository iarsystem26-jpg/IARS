import { CheckCircle2, Clock, FileCheck2, ListChecks, XCircle } from 'lucide-react';
import { MetricCard } from './Page';

export default function ApprovalStatistics({ rows, includePartial = false, loading = false }: {
  rows: readonly { status: string }[];
  includePartial?: boolean;
  loading?: boolean;
}) {
  const metrics = [
    { label: 'Total requests', value: rows.length, icon: ListChecks },
    { label: 'Pending', value: rows.filter(row => row.status === 'pending').length, icon: Clock },
    { label: 'Approved', value: rows.filter(row => row.status === 'approved').length, icon: CheckCircle2 },
    { label: 'Rejected', value: rows.filter(row => row.status === 'rejected').length, icon: XCircle },
    ...(includePartial ? [{ label: 'Partially approved', value: rows.filter(row => row.status === 'partially_approved').length, icon: FileCheck2 }] : []),
  ];

  return <div aria-label="Request statistics" aria-busy={loading} className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${includePartial ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
    {metrics.map(({ label, value, icon: Icon }) => <MetricCard key={label} label={label} value={loading ? '…' : value} icon={<Icon size={20} />} />)}
  </div>;
}
