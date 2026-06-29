import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '../context/AppContext';
import { getProjectRolePermissions } from '../api/projects';

// All known project permission keys — used to grant system admins everything
const ALL_PROJECT_PERMISSIONS = new Set([
  'tickets.view', 'tickets.write', 'tickets.delete',
  'goals.view', 'goals.write', 'goals.delete', 'goals.lock',
  'sprints.view', 'sprints.manage',
  'members.view', 'members.manage',
  'time.view', 'time.log',
  'reports.view',
  'labels.manage', 'fields.manage', 'statuses.manage',
  'project.settings', 'project.delete',
]);

export function useProjectPermissions(project) {
  const { user } = useApp();
  const isSysAdmin = user?.role === 'admin';
  const projectId = project?.id;
  const projectRole = isSysAdmin ? 'owner' : project?.my_role;

  const { data: rolePerms, isLoading } = useQuery({
    queryKey: ['project-role-permissions', projectId],
    queryFn: () => getProjectRolePermissions(projectId),
    enabled: !!projectId && !isSysAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const myPerms = useMemo(() => {
    if (isSysAdmin) return ALL_PROJECT_PERMISSIONS;
    if (!rolePerms || !projectRole) return new Set();
    return new Set(rolePerms[projectRole] ?? []);
  }, [isSysAdmin, rolePerms, projectRole]);

  const can = (permission) => isSysAdmin || myPerms.has(permission);

  return {
    can,
    // Named shorthands used throughout the app
    canView:          can('tickets.view'),
    canWrite:         can('tickets.write'),
    canDelete:        can('tickets.delete'),
    canManageProject: can('project.settings'),
    canLockGoals:     can('goals.lock'),
    canOwn:           can('project.delete'),
    isSysAdmin,
    isViewer:         !isSysAdmin && !myPerms.has('tickets.write'),
    projectRole,
    isLoading:        !isSysAdmin && isLoading,
  };
}
