import { hierarchyPathForRole } from '../lib/workspaceRoutes';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../components/AuthContext';
import { appData } from '../lib/backend';
import { findNodePath } from '../lib/academicDirectory';
import { Page, PageHeader } from '../components/ui/Page';
import Button from '../components/ui/Button';
import StudentTransferWorkspace from '../components/members/StudentTransferWorkspace';

export default function StudentTransfers() {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const nodes = profile ? appData.getVisibleSchoolStructure(profile.uid) : [];
  const unit = new URLSearchParams(location.search).get('unit');
  const currentNode = unit ? findNodePath(nodes, unit)?.at(-1) : undefined;
  const initialNodeId = currentNode?.id;
  const backPath = `${hierarchyPathForRole(profile?.role)}${currentNode ? `?unit=${encodeURIComponent(currentNode.id)}` : ''}`;

  return <Page>
    <PageHeader eyebrow="Student directory" title="Transfer students" description="Move students to another class or year level. Attendance records and balances stay with each student." actions={<Button fullWidth={false} variant="secondary" onClick={() => navigate(backPath)}><ArrowLeft size={16} />Back to directory</Button>} />
    <StudentTransferWorkspace key={initialNodeId || 'all'} nodes={nodes} initialNodeId={initialNodeId} onShowProfile={student => navigate(`${hierarchyPathForRole(profile?.role)}/students/${encodeURIComponent(student.uid)}?unit=${encodeURIComponent(student.node_id)}`)} />
  </Page>;
}
