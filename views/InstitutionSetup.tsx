import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import InstitutionSetupPage from '../components/academic/InstitutionSetupPage';
import { InstitutionRecord, loadInstitutions } from '../lib/institutions';
import { runtimeInstitution } from '../lib/institutionRuntime';
import { Page, PageHeader } from '../components/ui/Page';
import Button from '../components/ui/Button';

export default function InstitutionSetup() {
  const { institutionId } = useParams();
  const navigate = useNavigate();
  const [institution, setInstitution] = useState<InstitutionRecord>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(institutionId));
  const close = () => navigate('/admin/hierarchy');
  useEffect(() => {
    let active = true;
    if (!institutionId) { setLoading(false); return; }
    setLoading(true);
    loadInstitutions().then(records => {
      if (!active) return;
      const record = records.find(row => row.id === institutionId);
      if (!record || !['active', 'failed'].includes(record.status)) throw new Error('This institution is unavailable or setup is still running.');
      setInstitution(record);
    }).catch(caught => { if (active) setError(caught instanceof Error ? caught.message : 'Unable to load institution.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [institutionId]);
  if (loading || error || runtimeInstitution) return <Page><PageHeader title="Institution setup" /><p role={loading ? 'status' : 'alert'}>{runtimeInstitution ? 'Manage independent institutions from the main administrator workspace.' : loading ? 'Loading institution…' : error}</p><Button onClick={close}>Back to institutions</Button></Page>;
  return <InstitutionSetupPage key={institutionId || 'new'} institution={institution} onClose={close} onCreated={close} />;
}
