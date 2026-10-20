import { errorMessage } from '../lib/errors';
import ErrorNotice from '../components/ui/ErrorNotice';
import RecordPagination from '../components/ui/RecordPagination';
import { usePagination } from '../components/usePagination';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../components/AuthContext';
import { appData } from '../lib/backend';
import { SchoolNode, UserProfile } from '../types';
import { 
  ChevronRight, Plus, Users, School, GraduationCap, 
  BookOpen, Layers, UserPlus, Building2, Crown, FileUp
} from 'lucide-react';
import CustomSelect from '../components/ui/CustomSelect';
import SearchInput from '../components/ui/SearchInput';
import Button from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Page, PageHeader, Surface } from '../components/ui/Page';
import { getAllowedChildTypes, serializeAcademicAssignment } from '../lib/academicDirectory';
import BulkMemberImportModal from '../components/members/BulkMemberImportModal';
import { MemberCsvErrors, MemberCsvRow, validateMemberCsvRows } from '../lib/memberCsv';
import { hasPermission } from '../lib/accessControl';

const deriveSchoolData = (path: SchoolNode[]): UserProfile['school_data'] => {
  const serialized = serializeAcademicAssignment(path);
  return { ...serialized.schoolData, school_id: serialized.assignment.campusId || '', academic_assignment: serialized.assignment };
};

const ManageMembers: React.FC = () => {
  const { isMock, profile, revision } = useAuth();
  const [structure, setStructure] = useState<SchoolNode[]>([]);
  const [currentPath, setCurrentPath] = useState<SchoolNode[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showBulkMemberModal, setShowBulkMemberModal] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberRole, setMemberRole] = useState<'all' | UserProfile['role']>('all');
  const [, setRegistryRevision] = useState(0);
  
  // Create Modal State
  const [newItemName, setNewItemName] = useState('');
  const [newItemType, setNewItemType] = useState('');
  const [assignOfficer, setAssignOfficer] = useState(false);
  const [officerData, setOfficerData] = useState({ name: '', email: '', username: '' });
  const emptyMemberData = { name: '', email: '', username: '', studentId: '', role: 'student' as UserProfile['role'], phone: '', guardianName: '', guardianContact: '', guardianEmail: '' };
  const [memberData, setMemberData] = useState(emptyMemberData);
  const [memberErrors, setMemberErrors] = useState<MemberCsvErrors>({});
  const [memberSubmitError, setMemberSubmitError] = useState('');

  useEffect(() => {
    {
      const data = appData.getSchoolStructure();
      setStructure(data);
      if (data.length > 0 && currentPath.length === 0) {
        setCurrentPath([data[0]]); // Start at root
      }
    }
  }, [revision]);

  const currentNode = useMemo(() => {
    if (currentPath.length === 0) return null;
    return currentPath[currentPath.length - 1];
  }, [currentPath]);

  const handleNavigate = (node: SchoolNode) => {
    setCurrentPath([...currentPath, node]);
  };

  const handleBreadcrumbClick = (index: number) => {
    setCurrentPath(currentPath.slice(0, index + 1));
  };

  const getChildType = (parentType: string, parentName?: string): string => {
    const semantic = getAllowedChildTypes({ type: parentType as SchoolNode['type'] });
    if (semantic.length > 0) return semantic[0];
    switch (parentType) {
      case 'school': return 'department';
      case 'department': return 'college'; // Default fallback
      case 'college': return 'program';
      case 'secondary': return 'sub_department'; // Junior/Senior High School
      case 'sub_department': 
        if (parentName?.toLowerCase().includes('senior')) return 'strand';
        return 'level'; // Junior High School -> Level
      case 'strand': return 'level'; // Or specialization (optional)
      case 'elementary': return 'level';
      case 'special': return 'level';
      case 'program': return 'level'; // Or major (optional)
      case 'level': return 'section';
      case 'track': return 'strand';
      default: return 'node';
    }
  };

  const handleCreate = async () => {
    if (!currentNode) return;
    
    // If user selected a specific type in modal (e.g., Major vs Level), use that
    const type = newItemType || getChildType(currentNode.type, currentNode.name);
    
    // Create Node
    const newNode: SchoolNode = {
      id: `${type}_${Date.now()}`,
      name: newItemName,
      type: type as any,
      children: []
    };

    // Add Node to Backend
    await appData.addSchoolNode(currentNode.id, newNode);

    // Create Officer if needed
    if (assignOfficer && officerData.name) {
      const role = type === 'section' ? 'mayor' : 'ssg'; // Governor/Council as SSG for now
      await appData.createUser({
        name: officerData.name,
        email: officerData.email,
        username: officerData.username,
        role: role,
        student_id: `OFF-${Date.now()}`,
        official_data: role === 'ssg' ? { body: 'SSG', position: 'Officer', scope: newNode.name } : undefined,
        school_data: deriveSchoolData([...currentPath, newNode]),
      });
    }

    // Refresh Structure
    const data = appData.getSchoolStructure();
    setStructure(data);
    
    // Re-build current path with new data references
    const newPath: SchoolNode[] = [];
    let searchNodes = data;
    
    for (const pathNode of currentPath) {
      const found = searchNodes.find(n => n.id === pathNode.id);
      if (found) {
        newPath.push(found);
        if (found.children) {
          searchNodes = found.children;
        }
      }
    }
    setCurrentPath(newPath);
    
    setShowCreateModal(false);
    setNewItemName('');
    setNewItemType('');
    setAssignOfficer(false);
    setOfficerData({ name: '', email: '', username: '' });
  };

  const handleCreateMember = async () => {
    if (!currentNode) return;
    const row: MemberCsvRow = {
      name: memberData.name.trim(),
      email: memberData.email.trim(),
      username: memberData.username.trim(),
      student_id: memberData.studentId.trim(),
      role: memberData.role,
      phone: memberData.phone.trim(),
      guardian_name: memberData.guardianName.trim(),
      guardian_contact: memberData.guardianContact.trim(),
      guardian_email: memberData.guardianEmail.trim(),
    };
    const validation = validateMemberCsvRows([row], appData.getAllAccountIdentities());
    if (!validation.valid) {
      setMemberErrors(validation.rows[0]?.errors || {});
      return;
    }
    const profile = {
      name: row.name,
      email: row.email,
      username: row.username,
      role: 'student',
      student_id: row.student_id,
      ...(row.phone ? { phone: row.phone } : {}),
      ...((row.guardian_name || row.guardian_contact || row.guardian_email) ? {
        guardian: {
          name: row.guardian_name,
          contact: row.guardian_contact,
          ...(row.guardian_email ? { email: row.guardian_email } : {}),
        },
      } : {}),
      school_data: deriveSchoolData(currentPath),
    } as const;
    try {
      await appData.createSectionMembers([{ profile, makeMayor: row.role === 'mayor' }], currentNode.id, currentNode.name);
      closeMemberModal();
      setRegistryRevision((revision) => revision + 1);
    } catch (error) {
      setMemberSubmitError(errorMessage(error));
    }
  };

  const closeMemberModal = () => {
    setMemberData(emptyMemberData);
    setMemberErrors({});
    setMemberSubmitError('');
    setShowMemberModal(false);
  };

  const handleBulkCreateMembers = async (rows: MemberCsvRow[]) => {
    if (!currentNode) return;
    const members = rows.map((row) => ({
      makeMayor: row.role === 'mayor',
      profile: {
        name: row.name,
        email: row.email,
        username: row.username,
        role: 'student',
        student_id: row.student_id,
        ...(row.phone ? { phone: row.phone } : {}),
        ...((row.guardian_name || row.guardian_contact || row.guardian_email) ? {
          guardian: {
            name: row.guardian_name,
            contact: row.guardian_contact,
            ...(row.guardian_email ? { email: row.guardian_email } : {}),
          },
        } : {}),
        school_data: deriveSchoolData(currentPath),
      } as const,
    }));
    await appData.createSectionMembers(members, currentNode.id, currentNode.name);
    setShowBulkMemberModal(false);
    setRegistryRevision((revision) => revision + 1);
  };

  const handleAssignMayor = async (member: UserProfile) => {
    if (!currentNode) return;
    if (await appData.assignSectionMayor(member.uid, currentNode.id, currentNode.name)) {
      setRegistryRevision((revision) => revision + 1);
    }
  };

  const renderIcon = (type: string) => {
    switch (type) {
      case 'school': return <School className="text-brand-900 dark:text-gold-400" />;
      case 'department': return <Building2 className="text-brand-900 dark:text-gold-400" />;
      case 'college': return <GraduationCap className="text-brand-900 dark:text-gold-400" />;
      case 'secondary': return <School className="text-brand-900 dark:text-gold-400" />;
      case 'elementary': return <School className="text-brand-900 dark:text-gold-400" />;
      case 'special': return <School className="text-brand-900 dark:text-gold-400" />;
      case 'program': return <BookOpen className="text-brand-900 dark:text-gold-400" />;
      case 'level': return <Layers className="text-brand-900 dark:text-gold-400" />;
      case 'section': return <Users className="text-brand-900 dark:text-gold-400" />;
      default: return <ChevronRight className="text-brand-900 dark:text-gold-400" />;
    }
  };

  const isSection = currentNode?.type === 'section' || currentNode?.type === 'block';
  const sectionMembers = currentNode && isSection
    ? appData.getStudentsBySection(currentNode.name, currentNode.id) as Array<UserProfile & { stats?: { sanction_hours: number } }>
    : [];
  const filteredMembers = sectionMembers.filter((member) => {
    const query = memberSearch.trim().toLowerCase();
    const matchesQuery = !query || [member.name, member.email, member.student_id, member.username]
      .some((value) => (value || '').toLowerCase().includes(query));
    return matchesQuery && (memberRole === 'all' || member.role === memberRole);
  }).sort((a, b) => a.name.localeCompare(b.name) || a.uid.localeCompare(b.uid));
  const memberPage = usePagination(filteredMembers, JSON.stringify([currentNode?.id, memberSearch, memberRole]));

  if (!currentNode) return <Page><p>Loading directory…</p></Page>;

  const childType = getChildType(currentNode.type, currentNode.name);
  const canManageStructure = hasPermission(profile?.role, 'directory.manage_structure') && hasPermission(profile?.role, 'directory.create_units');
  const canAddMembersManually = hasPermission(profile?.role, 'directory.add_members_manually', appData.getCustomRoles(), appData.getCoreRoles());
  const canChangeDesignation = hasPermission(profile?.role, 'directory.change_member_designation', appData.getCustomRoles(), appData.getCoreRoles());

  // Determine if we need to ask for specific types (e.g. Major vs Level)
  const needsTypeSelection = ['program', 'strand'].includes(currentNode.type);

  return (
    <Page>
      <PageHeader
        eyebrow="Staff tools"
        title="Directory & Management"
        description="Manage school structure, member records, and attendance officers."
        actions={!isSection && canManageStructure ? (
          <Button
            onClick={() => {
              setNewItemType('');
              setShowCreateModal(true);
            }}
            className="sm:w-auto"
          >
            <Plus size={16} /> Add
          </Button>
        ) : undefined}
      />

      {/* BREADCRUMBS */}
      <nav aria-label="Directory breadcrumb" className="flex items-center gap-2 overflow-x-auto pb-2">
        {currentPath.map((node, index) => (
          <React.Fragment key={node.id}>
            {index > 0 && <ChevronRight size={14} className="text-slate-400 flex-shrink-0" />}
            <button 
              onClick={() => handleBreadcrumbClick(index)}
              className={`text-xs font-bold uppercase tracking-wider whitespace-nowrap ${
                index === currentPath.length - 1 
                  ? 'text-brand-900 dark:text-gold-400 bg-gold-50 dark:bg-gold-950/40 px-3 py-1 rounded-full border border-gold-200 dark:border-gold-800' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-brand-900 dark:hover:text-slate-200'
              }`}
            >
              {node.name}
            </button>
          </React.Fragment>
        ))}
      </nav>

      {/* CONTENT */}
      <Surface className="min-h-[400px] p-4 sm:p-6">
        {isSection ? (
          <div className="space-y-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-brand-900 dark:text-white">{currentNode.name} member registry</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">{sectionMembers.length} members in this section</p>
              </div>
              <div className="grid w-full gap-3 sm:grid-cols-2 lg:flex lg:w-auto lg:flex-wrap">
                <SearchInput ariaLabel="Search section members" className="lg:w-64" onChange={setMemberSearch} placeholder="Search name, email, or ID" value={memberSearch} />
                <CustomSelect ariaLabel="Filter members by role" className="min-w-0" combobox label="Role" onChange={(value) => setMemberRole(value as typeof memberRole)} options={[{ value: 'all', label: 'All roles' }, { value: 'student', label: 'Students' }, { value: 'mayor', label: 'Mayors' }]} value={memberRole} />
                {canAddMembersManually ? <Button aria-label="Bulk create members" variant="secondary" className="lg:w-auto" onClick={() => setShowBulkMemberModal(true)}>
                  <FileUp size={16} /> Bulk create
                </Button> : null}
                {canAddMembersManually ? (
                  <Button aria-label="Add member" variant="gold" className="lg:w-auto" onClick={() => setShowMemberModal(true)}>
                    <UserPlus size={16} /> Add member
                  </Button>
                ) : null}
              </div>
            </div>

            {filteredMembers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-300">No members match the selected filters.</p>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table aria-label={`${currentNode.name} member registry`} className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300">
                      <tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Student ID</th><th className="p-3">Role</th><th className="p-3 text-right">Mayor</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {memberPage.visible.map((member) => (
                        <tr key={member.uid}>
                          <td className="p-3 font-semibold text-brand-900 [overflow-wrap:anywhere] dark:text-white">{member.name}</td>
                          <td className="p-3 text-slate-600 [overflow-wrap:anywhere] dark:text-slate-300">{member.email}</td>
                          <td className="p-3 font-mono text-slate-600 [overflow-wrap:anywhere] dark:text-slate-300">{member.student_id}</td>
                          <td className="p-3 capitalize text-slate-600 dark:text-slate-300">{member.role}</td>
                          <td className="p-3 text-right">
                            {member.role === 'mayor' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2.5 py-1 text-xs font-bold text-gold-800 dark:bg-gold-950/50 dark:text-gold-300"><Crown size={13} /> Current mayor</span>
                            ) : canChangeDesignation ? (
                              <Button aria-label={`Assign ${member.name} as mayor`} className="sm:w-auto" onClick={() => handleAssignMayor(member)} size="sm" variant="secondary">Assign mayor</Button>
                            ) : <span className="text-xs text-slate-400">No designation access</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="grid gap-3 md:hidden">
                  {memberPage.visible.map((member) => (
                    <article aria-label={member.name} className="mobile-data-card space-y-3" key={member.uid}>
                      <h3 className="font-bold text-brand-900 [overflow-wrap:anywhere] dark:text-white">{member.name}</h3>
                      <dl className="grid gap-3 text-sm">
                        <div><dt className="font-semibold text-slate-500 dark:text-slate-400">Email</dt><dd className="mt-1 text-slate-700 [overflow-wrap:anywhere] dark:text-slate-200">{member.email}</dd></div>
                        <div><dt className="font-semibold text-slate-500 dark:text-slate-400">Student ID</dt><dd className="mt-1 font-mono text-slate-700 [overflow-wrap:anywhere] dark:text-slate-200">{member.student_id}</dd></div>
                        <div><dt className="font-semibold text-slate-500 dark:text-slate-400">Role</dt><dd className="mt-1 capitalize text-slate-700 dark:text-slate-200">{member.role}</dd></div>
                      </dl>
                      {member.role === 'mayor' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2.5 py-1 text-xs font-bold text-gold-800 dark:bg-gold-950/50 dark:text-gold-300"><Crown size={13} /> Current mayor</span>
                      ) : canChangeDesignation ? (
                        <Button aria-label={`Assign ${member.name} as mayor`} onClick={() => handleAssignMayor(member)} size="sm" variant="secondary">Assign as mayor</Button>
                      ) : <span className="text-xs text-slate-400">No designation access</span>}
                    </article>
                  ))}
                </div>
              </>
            )}
            <RecordPagination {...memberPage} label="Member registry pagination" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {currentNode.children && currentNode.children.length > 0 ? (
              currentNode.children.map(child => (
                <button
                  key={child.id}
                  onClick={() => handleNavigate(child)}
                  className="group p-6 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-2xl cursor-pointer hover:border-gold-400 dark:hover:border-gold-400 hover:shadow-md transition-all flex flex-col items-center text-center gap-4"
                >
                  <div className="w-16 h-16 rounded-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 flex items-center justify-center group-hover:border-gold-400 transition-colors">
                    {renderIcon(child.type)}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-brand-900 dark:text-slate-100 uppercase tracking-tight group-hover:text-gold-600 dark:group-hover:text-gold-400 transition-colors">
                      {child.name}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
                      {child.type}
                    </p>
                  </div>
                </button>
              ))
            ) : (
              <div className="col-span-full text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                <p className="text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-widest">No {childType}s found</p>
                {canManageStructure ? (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="mt-4 text-brand-900 dark:text-gold-400 text-xs font-black uppercase tracking-widest hover:text-gold-600 dark:hover:text-gold-300"
                  >
                    Create
                  </button>
                ) : null}
              </div>
            )}
          </div>
        )}
      </Surface>

      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={`Create new ${needsTypeSelection ? 'item' : childType.replace('_', ' ')}`}
        description={`Add a unit beneath ${currentNode.name}.`}
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button variant="gold" onClick={handleCreate} disabled={!newItemName || (childType === 'department' && !newItemType)}>
              Create
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
              {childType === 'department' && (
                <div className="space-y-2">
                   <CustomSelect
                      label="Department Type"
                      options={[
                        { value: 'college', label: 'College (Tertiary)' },
                        { value: 'secondary', label: 'Secondary (High School)' },
                        { value: 'elementary', label: 'Elementary' },
                        { value: 'special', label: 'Special' }
                      ]}
                      value={newItemType}
                      onChange={(val) => setNewItemType(val as string)}
                      placeholder="Select Department Type..."
                   />
                </div>
              )}

              {childType === 'sub_department' && (
                <div className="space-y-2">
                   <CustomSelect
                      label="School Unit"
                      options={[
                        { value: 'Senior High School', label: 'Senior High School' },
                        { value: 'Junior High School', label: 'Junior High School' }
                      ]}
                      value={newItemName}
                      onChange={(val) => setNewItemName(val as string)}
                      placeholder="Select Unit..."
                   />
                </div>
              )}

              {currentNode.type === 'program' && (
                <div className="space-y-2">
                   <CustomSelect
                      label="Item Type"
                      options={[
                        { value: 'major', label: 'Major' },
                        { value: 'level', label: 'Year Level' }
                      ]}
                      value={newItemType}
                      onChange={(val) => setNewItemType(val as string)}
                      placeholder="Select Type..."
                   />
                </div>
              )}

              {currentNode.type === 'strand' && (
                <div className="space-y-2">
                   <CustomSelect
                      label="Item Type"
                      options={[
                        { value: 'specialization', label: 'Specialization' },
                        { value: 'level', label: 'Year Level' }
                      ]}
                      value={newItemType}
                      onChange={(val) => setNewItemType(val as string)}
                      placeholder="Select Type..."
                   />
                </div>
              )}

              {childType !== 'sub_department' && (
                <div className="space-y-2">
                  <label htmlFor="new-unit-name" className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Name</label>
                  <input 
                    id="new-unit-name"
                    type="text" 
                    className="app-control w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-brand-900 dark:text-slate-100 outline-none focus:border-gold-400"
                    placeholder={`Enter ${newItemType || childType} name...`}
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                  />
                </div>
              )}

              {/* Conditional Officer Creation */}
              {(childType === 'college' || childType === 'section') && (
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 accent-gold-400"
                      checked={assignOfficer}
                      onChange={(e) => setAssignOfficer(e.target.checked)}
                    />
                    <span className="text-xs font-bold text-brand-900 dark:text-slate-100 uppercase tracking-wide">
                      {childType === 'section' ? 'Assign Mayor / Attendance Officer' : 'Assign Governor / Local Council'}
                    </span>
                  </label>

                  {assignOfficer && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                      <input
                        aria-label="Officer name"
                        type="text" 
                        placeholder="Officer Name" 
                        className="app-control w-full p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-brand-900 dark:text-slate-100 outline-none focus:border-gold-400"
                        value={officerData.name}
                        onChange={(e) => setOfficerData({...officerData, name: e.target.value})}
                      />
                      <input
                        aria-label="Officer email address"
                        type="email" 
                        placeholder="Email Address" 
                        className="app-control w-full p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-brand-900 dark:text-slate-100 outline-none focus:border-gold-400"
                        value={officerData.email}
                        onChange={(e) => setOfficerData({...officerData, email: e.target.value})}
                      />
                      <input
                        aria-label="Officer username"
                        type="text" 
                        placeholder="Username" 
                        className="app-control w-full p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-brand-900 dark:text-slate-100 outline-none focus:border-gold-400"
                        value={officerData.username}
                        onChange={(e) => setOfficerData({...officerData, username: e.target.value})}
                      />
                    </div>
                  )}
                </div>
              )}

        </div>
      </Modal>

      <Modal
        open={showMemberModal}
        onClose={closeMemberModal}
        closeOnBackdrop={false}
        title={`Add member to ${currentNode.name}`}
        description="Create a member record and assign its initial directory role."
        size="md"
        footer={(
          <>
            <Button variant="secondary" onClick={closeMemberModal}>Cancel</Button>
            <Button
              aria-label="Create member"
              variant="gold"
              onClick={handleCreateMember}
              disabled={!memberData.name || !memberData.email || !memberData.username || !memberData.studentId}
            >
              Create
            </Button>
          </>
        )}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ['member-name', 'Legal full name', 'name', 'text'],
            ['member-email', 'Email address', 'email', 'email'],
            ['member-username', 'Username', 'username', 'text'],
            ['member-student-id', 'Student ID', 'studentId', 'text'],
          ].map(([id, label, key, type]) => (
            <label className="space-y-1.5" htmlFor={id} key={id}>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
              <input
                className="app-control h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-brand-900 outline-none focus:border-gold-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                id={id}
                placeholder={key === 'studentId' ? 'YYYY-XXXXXL' : undefined}
                aria-describedby={memberErrors[key === 'studentId' ? 'student_id' : key as keyof MemberCsvErrors] ? `${id}-error` : undefined}
                aria-invalid={Boolean(memberErrors[key === 'studentId' ? 'student_id' : key as keyof MemberCsvErrors])}
                onChange={(event) => {
                  const errorKey = key === 'studentId' ? 'student_id' : key as keyof MemberCsvErrors;
                  setMemberData({ ...memberData, [key]: event.target.value });
                  setMemberErrors((current) => ({ ...current, [errorKey]: undefined }));
                }}
                required
                type={type}
                value={memberData[key as keyof typeof memberData]}
              />
              {memberErrors[key === 'studentId' ? 'student_id' : key as keyof MemberCsvErrors] ? (
                <ErrorNotice id={`${id}-error`} error={memberErrors[key === 'studentId' ? 'student_id' : key as keyof MemberCsvErrors]} />
              ) : null}
            </label>
          ))}
          {[
            ['member-phone', 'Phone (optional)', 'phone', 'tel'],
            ['member-guardian-name', 'Guardian name (optional)', 'guardianName', 'text'],
            ['member-guardian-contact', 'Guardian contact (optional)', 'guardianContact', 'tel'],
            ['member-guardian-email', 'Guardian email (optional)', 'guardianEmail', 'email'],
          ].map(([id, label, key, type]) => (
            <label className="space-y-1.5" htmlFor={id} key={id}>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
              <input
                className="app-control h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-brand-900 outline-none focus:border-gold-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                id={id}
                aria-describedby={key === 'guardianEmail' && memberErrors.guardian_email ? `${id}-error` : undefined}
                aria-invalid={key === 'guardianEmail' ? Boolean(memberErrors.guardian_email) : undefined}
                onChange={(event) => {
                  setMemberData({ ...memberData, [key]: event.target.value });
                  if (key === 'guardianEmail') setMemberErrors((current) => ({ ...current, guardian_email: undefined }));
                }}
                type={type}
                value={memberData[key as keyof typeof memberData]}
              />
              {key === 'guardianEmail' && memberErrors.guardian_email ? <ErrorNotice id={`${id}-error`} error={memberErrors.guardian_email} /> : null}
            </label>
          ))}
          <CustomSelect className="sm:col-span-2" label="Initial role" onChange={(value) => setMemberData({ ...memberData, role: value as UserProfile['role'] })} options={[{ value: 'student', label: 'Student' }, { value: 'mayor', label: 'Mayor / attendance officer' }]} value={memberData.role} />
          {memberSubmitError ? <ErrorNotice error={memberSubmitError} operation="Manage Members"></ErrorNotice> : null}
        </div>
      </Modal>

      <BulkMemberImportModal
        existingMembers={appData.getAllAccountIdentities()}
        onClose={() => setShowBulkMemberModal(false)}
        onConfirm={handleBulkCreateMembers}
        open={showBulkMemberModal}
        sectionName={currentNode.name}
      />
    </Page>
  );
};

export default ManageMembers;

