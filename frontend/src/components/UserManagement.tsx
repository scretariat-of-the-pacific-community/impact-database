'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backendFetch, authFetch } from '@/lib/auth-utils';
import Image from 'next/image';
import { sanitizeText } from '@/lib/sanitize';
import {
  UserPlus,
  User,
  Pencil,
  Trash2,
  Lock,
  Unlock,
  ShieldCheck,
  AlertTriangle,
  Search,
  Filter,
  Eye,
  ChevronLeft,
  ChevronRight,
  Mail,
  RefreshCw,
  Users,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Select } from '@/components/design-system';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  permissions: string[];
  organization?: string;
  isActive: boolean;
  isLocked: boolean;
  lastLogin?: string;
  createdAt: string;
  loginAttempts: number;
  profilePicture?: string;
}

interface CreateUserData {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  organization?: string;
  sendInvite: boolean;
  username?: string;
  password?: string;
}

const UserManagement: React.FC = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showQuickInvite, setShowQuickInvite] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [quickInviteEmail, setQuickInviteEmail] = useState('');
  const [quickInviteRole, setQuickInviteRole] = useState('contributor');
  const [filters, setFilters] = useState({
    search: '',
    role: '',
    status: '',
    organization: '',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);

  const queryClient = useQueryClient();

  // Fetch users
  const {
    data: usersData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['admin-users', filters, currentPage, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries({
        ...filters,
        page: currentPage.toString(),
        page_size: pageSize.toString(),
      }).forEach(([key, value]) => {
        if (value) params.append(key, value.toString());
      });

      const response = await authFetch(`/api/admin/users?${params}`);
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json();
    },
  });

  // Fetch roles
  const { data: roles } = useQuery({
    queryKey: ['admin-roles'],
    queryFn: async () => {
      const response = await authFetch('/api/admin/roles');
      if (!response.ok) throw new Error('Failed to fetch roles');
      const data = await response.json();
      // Some backends return { roles: [...] }, others return an array directly
      return Array.isArray(data?.roles)
        ? data.roles
        : Array.isArray(data)
          ? data
          : [];
    },
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (userData: CreateUserData) => {
      // Use invite endpoint when sendInvite is true
      const endpoint = userData.sendInvite
        ? '/api/admin/users/invite'
        : '/api/admin/users';

      const response = await authFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(userData),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.detail || errorData.error || 'Failed to create user'
        );
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowCreateModal(false);
    },
  });

  // Lock/unlock user mutation
  const lockUserMutation = useMutation({
    mutationFn: async ({ userId, lock }: { userId: string; lock: boolean }) => {
      const response = await backendFetch(
        `/api/admin/users/${userId}/${lock ? 'lock' : 'unlock'}`,
        {
          method: 'POST',
        }
      );
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: 'Unknown error' }));
        console.error('Lock/unlock failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
        });
        throw new Error(
          errorData.detail ||
            `Failed to ${lock ? 'lock' : 'unlock'} user (${response.status})`
        );
      }
      return response.json();
    },
    onSuccess: (data: any, variables: any) => {
      console.log(
        `User ${variables.lock ? 'locked' : 'unlocked'} successfully:`,
        data
      );
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (error: any) => {
      console.error('Lock/unlock error:', error);
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await authFetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete user');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  // Quick invite mutation
  const quickInviteMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      const response = await authFetch('/api/admin/users/invite', {
        method: 'POST',
        body: JSON.stringify({ email, role, sendInvite: true }),
      });
      if (!response.ok) throw new Error('Failed to send invite');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowQuickInvite(false);
      setQuickInviteEmail('');
      setQuickInviteRole('contributor');
    },
  });

  // Bulk lock mutation
  const bulkLockMutation = useMutation({
    mutationFn: async ({
      userIds,
      lock,
    }: {
      userIds: string[];
      lock: boolean;
    }) => {
      const response = await authFetch('/api/admin/users/bulk-action', {
        method: 'POST',
        body: JSON.stringify({
          user_ids: userIds,
          action: lock ? 'lock' : 'unlock',
        }),
      });
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: 'Unknown error' }));
        console.error('Bulk action failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
        });
        throw new Error(
          errorData.detail ||
            `Failed to ${lock ? 'lock' : 'unlock'} users (${response.status})`
        );
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      console.log('Bulk action successful:', data);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setSelectedUsers(new Set());
    },
    onError: (error: any) => {
      console.error('Bulk action error:', error);
    },
  });

  // Toggle user selection
  const toggleUserSelection = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  // Select all users on current page
  const toggleSelectAll = () => {
    if (!(usersData as any)?.users) return;
    const allSelected = (usersData as any).users.every((u: User) =>
      selectedUsers.has(u.id)
    );
    if (allSelected) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(
        new Set((usersData as any).users.map((u: User) => u.id))
      );
    }
  };

  const getRoleColor = (role: string) => {
    switch (role.toLowerCase()) {
      case 'super_admin':
        return 'bg-purple-100 text-purple-800';
      case 'admin':
        return 'bg-red-100 text-red-800';
      case 'curator':
        return 'bg-blue-100 text-blue-800';
      case 'contributor':
        return 'bg-green-100 text-green-800';
      case 'viewer':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (user: User) => {
    if (!user.isActive) return 'bg-gray-100 text-gray-800';
    if (user.isLocked) return 'bg-red-100 text-red-800';
    return 'bg-green-100 text-green-800';
  };

  const getStatusText = (user: User) => {
    if (!user.isActive) return 'Inactive';
    if (user.isLocked) return 'Locked';
    return 'Active';
  };

  const CreateUserModal = () => {
    const [formData, setFormData] = useState<CreateUserData>({
      email: '',
      firstName: '',
      lastName: '',
      role: '',
      organization: '',
      sendInvite: true,
      username: '',
      password: '',
    });

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();

      // Validate required fields based on sendInvite flag
      if (!formData.sendInvite && (!formData.username || !formData.password)) {
        alert('Username and password are required when not sending an invite');
        return;
      }

      createUserMutation.mutate(formData);
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md"
        >
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Create New User
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="create-user-firstname"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  First Name *
                </label>
                <input
                  id="create-user-firstname"
                  name="firstName"
                  type="text"
                  autoComplete="given-name"
                  required
                  value={formData.firstName}
                  onChange={(
                    e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
                  ) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>
              <div>
                <label
                  htmlFor="create-user-lastname"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Last Name *
                </label>
                <input
                  id="create-user-lastname"
                  name="lastName"
                  type="text"
                  autoComplete="family-name"
                  required
                  value={formData.lastName}
                  onChange={(
                    e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
                  ) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="create-user-email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email *
              </label>
              <input
                id="create-user-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={(
                  e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
                ) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              />
            </div>

            <div>
              <Select
                id="create-user-role"
                name="role"
                label="Role *"
                required
                autoComplete="off"
                value={formData.role}
                onChange={(
                  e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
                ) => setFormData({ ...formData, role: e.target.value })}
                variant="light"
                size="md"
                error={!formData.role ? undefined : undefined}
              >
                <option value="">Select Role</option>
                {(roles as any)?.map((role: any) => (
                  <option key={role.name} value={role.name}>
                    {role.displayName || role.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label
                htmlFor="create-user-organization"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Organization
              </label>
              <input
                id="create-user-organization"
                name="organization"
                type="text"
                autoComplete="organization"
                value={formData.organization}
                onChange={(
                  e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
                ) => setFormData({ ...formData, organization: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="sendInvite"
                checked={formData.sendInvite}
                onChange={(
                  e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
                ) =>
                  setFormData({
                    ...formData,
                    sendInvite: (e.target as HTMLInputElement).checked,
                  })
                }
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label
                htmlFor="sendInvite"
                className="ml-2 block text-sm text-gray-900"
              >
                Send invitation email
              </label>
            </div>

            {!formData.sendInvite && (
              <>
                <div>
                  <label
                    htmlFor="create-user-username"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Username *
                  </label>
                  <input
                    id="create-user-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    required={!formData.sendInvite}
                    value={formData.username || ''}
                    onChange={(
                      e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
                    ) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>

                <div>
                  <label
                    htmlFor="create-user-password"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Password *
                  </label>
                  <input
                    id="create-user-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required={!formData.sendInvite}
                    value={formData.password || ''}
                    onChange={(
                      e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
                    ) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Minimum 8 characters
                  </p>
                </div>
              </>
            )}

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createUserMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {createUserMutation.isPending ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    );
  };

  const UserDetailModal = ({ user }: { user: User }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-medium text-gray-900">User Details</h3>
          <button
            onClick={() => setShowUserModal(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>

        <div className="space-y-6">
          {/* Profile Section */}
          <div className="flex items-center space-x-4">
            <div className="h-16 w-16 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
              {user.profilePicture ? (
                <div className="relative h-16 w-16">
                  <Image
                    src={user.profilePicture}
                    alt={`${user.firstName} ${user.lastName}`}
                    fill
                    sizes="64px"
                    className="rounded-full object-cover"
                    unoptimized
                  />
                </div>
              ) : (
                <User className="h-8 w-8 text-gray-400" />
              )}
            </div>
            <div>
              <h4 className="text-xl font-medium text-gray-900">
                {sanitizeText(user.firstName)} {sanitizeText(user.lastName)}
              </h4>
              <p className="text-gray-600">{sanitizeText(user.email)}</p>
              <div className="flex items-center space-x-2 mt-1">
                <span
                  className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(user.role)}`}
                >
                  {sanitizeText(user.role)}
                </span>
                <span
                  className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(user)}`}
                >
                  {getStatusText(user)}
                </span>
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Organization
              </label>
              <p className="mt-1 text-sm text-gray-900">
                {sanitizeText(user.organization || 'Not specified')}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Last Login
              </label>
              <p className="mt-1 text-sm text-gray-900">
                {user.lastLogin
                  ? new Date(user.lastLogin).toLocaleString()
                  : 'Never'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Created
              </label>
              <p className="mt-1 text-sm text-gray-900">
                {new Date(user.createdAt).toLocaleString()}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Login Attempts
              </label>
              <p className="mt-1 text-sm text-gray-900">{user.loginAttempts}</p>
            </div>
          </div>

          {/* Permissions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Permissions
            </label>
            <div className="flex flex-wrap gap-2">
              {user.permissions.map((permission: any) => (
                <span
                  key={permission}
                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                >
                  {permission}
                </span>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              onClick={() =>
                lockUserMutation.mutate({
                  userId: user.id,
                  lock: !user.isLocked,
                })
              }
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                user.isLocked
                  ? 'text-green-600 bg-green-100 hover:bg-green-200'
                  : 'text-red-600 bg-red-100 hover:bg-red-200'
              }`}
            >
              {user.isLocked ? (
                <>
                  <Unlock className="h-4 w-4 inline mr-1" />
                  Unlock User
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 inline mr-1" />
                  Lock User
                </>
              )}
            </button>

            <button
              onClick={() => {
                if (confirm('Are you sure you want to delete this user?')) {
                  deleteUserMutation.mutate(user.id);
                  setShowUserModal(false);
                }
              }}
              className="px-4 py-2 text-sm font-medium text-red-600 bg-red-100 rounded-md hover:bg-red-200"
            >
              <Trash2 className="h-4 w-4 inline mr-1" />
              Delete User
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">
              Error loading users
            </h3>
            <p className="text-sm text-red-700 mt-1">
              Please try refreshing the page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Users</p>
              <p className="text-2xl font-bold text-gray-900">
                {(usersData as any)?.total || 0}
              </p>
            </div>
            <Users className="h-8 w-8 text-blue-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Active Users</p>
              <p className="text-2xl font-bold text-gray-900">
                {(usersData as any)?.active_count ||
                  (usersData as any)?.total ||
                  0}
              </p>
            </div>
            <Check className="h-8 w-8 text-green-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Locked</p>
              <p className="text-2xl font-bold text-gray-900">
                {(usersData as any)?.locked_count || 0}
              </p>
            </div>
            <Lock className="h-8 w-8 text-red-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">
                Pending Invites
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {(usersData as any)?.pending_count || 0}
              </p>
            </div>
            <Mail className="h-8 w-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Header with Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
        <div className="flex flex-wrap gap-2">
          {/* Quick Invite */}
          <button
            onClick={() => setShowQuickInvite(!showQuickInvite)}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <Mail className="h-4 w-4 mr-2" />
            Quick Invite
          </button>
          {/* Add User */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add User
          </button>
        </div>
      </div>

      {/* Quick Invite Panel */}
      <AnimatePresence>
        {showQuickInvite && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow-md p-6 border border-blue-200"
          >
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <Mail className="h-5 w-5 mr-2 text-blue-600" />
              Send Quick Invitation
            </h3>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label htmlFor="quick-invite-email" className="sr-only">
                  Email for quick invite
                </label>
                <input
                  id="quick-invite-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="email@example.com"
                  value={quickInviteEmail}
                  onChange={(
                    e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
                  ) => setQuickInviteEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder:text-gray-400"
                />
              </div>
              <div className="w-full sm:w-48">
                <Select
                  id="quick-invite-role"
                  name="role"
                  aria-label="Select role for invite"
                  autoComplete="off"
                  value={quickInviteRole}
                  onChange={(
                    e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
                  ) => setQuickInviteRole(e.target.value)}
                  variant="light"
                  size="md"
                >
                  <option value="viewer">Viewer</option>
                  <option value="contributor">Contributor</option>
                  <option value="curator">Curator</option>
                  <option value="admin">Admin</option>
                </Select>
              </div>
              <button
                onClick={() =>
                  quickInviteMutation.mutate({
                    email: quickInviteEmail,
                    role: quickInviteRole,
                  })
                }
                disabled={!quickInviteEmail || quickInviteMutation.isPending}
                className="inline-flex items-center px-6 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                {quickInviteMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4 mr-2" />
                )}
                Send Invite
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              An email invitation will be sent with a link to set up their
              account.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {selectedUsers.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between"
          >
            <span className="text-sm font-medium text-blue-800">
              {selectedUsers.size} user{selectedUsers.size !== 1 ? 's' : ''}{' '}
              selected
            </span>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  bulkLockMutation.mutate({
                    userIds: Array.from(selectedUsers),
                    lock: true,
                  })
                }
                disabled={bulkLockMutation.isPending}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded-md hover:bg-red-200"
              >
                <Lock className="h-4 w-4 mr-1" />
                Lock Selected
              </button>
              <button
                onClick={() =>
                  bulkLockMutation.mutate({
                    userIds: Array.from(selectedUsers),
                    lock: false,
                  })
                }
                disabled={bulkLockMutation.isPending}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 rounded-md hover:bg-green-200"
              >
                <Unlock className="h-4 w-4 mr-1" />
                Unlock Selected
              </button>
              <button
                onClick={() => setSelectedUsers(new Set())}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Clear Selection
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <label htmlFor="user-search" className="sr-only">
              Search users
            </label>
            <Search className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              id="user-search"
              name="search"
              type="text"
              placeholder="Search users..."
              value={filters.search}
              onChange={(
                e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
              ) => setFilters({ ...filters, search: e.target.value })}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder:text-gray-400"
            />
          </div>

          <Select
            id="filter-role"
            name="role"
            aria-label="Filter by role"
            autoComplete="off"
            value={filters.role}
            onChange={(
              e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
            ) => setFilters({ ...filters, role: e.target.value })}
            variant="light"
            size="md"
            fullWidth={false}
          >
            <option value="">All Roles</option>
            {(roles as any)?.map((role: any) => (
              <option key={role.name} value={role.name}>
                {role.displayName || role.name}
              </option>
            ))}
          </Select>

          <Select
            id="filter-status"
            name="status"
            aria-label="Filter by status"
            autoComplete="off"
            value={filters.status}
            onChange={(
              e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
            ) => setFilters({ ...filters, status: e.target.value })}
            variant="light"
            size="md"
            fullWidth={false}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="locked">Locked</option>
            <option value="inactive">Inactive</option>
          </Select>

          <label htmlFor="filter-organization" className="sr-only">
            Filter by organization
          </label>
          <input
            id="filter-organization"
            name="organization"
            type="text"
            placeholder="Organization"
            value={filters.organization}
            onChange={(
              e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
            ) => setFilters({ ...filters, organization: e.target.value })}
            className="border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <label htmlFor="select-all-users" className="sr-only">
                    Select all users
                  </label>
                  <input
                    id="select-all-users"
                    name="selectAllUsers"
                    type="checkbox"
                    checked={
                      (usersData as any)?.users?.length > 0 &&
                      selectedUsers.size === (usersData as any).users.length
                    }
                    onChange={toggleSelectAll}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <AnimatePresence>
                {(usersData as any)?.users?.map((user: User) => (
                  <motion.tr
                    key={user.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={`hover:bg-gray-50 ${selectedUsers.has(user.id) ? 'bg-blue-50' : ''}`}
                  >
                    <td className="px-4 py-4 whitespace-nowrap">
                      <label
                        htmlFor={`select-user-${user.id}`}
                        className="sr-only"
                      >
                        Select user {user.firstName} {user.lastName}
                      </label>
                      <input
                        id={`select-user-${user.id}`}
                        name="selectedUsers"
                        type="checkbox"
                        checked={selectedUsers.has(user.id)}
                        onChange={() => toggleUserSelection(user.id)}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
                          {user.profilePicture ? (
                            <div className="relative h-10 w-10">
                              <Image
                                src={user.profilePicture}
                                alt={`${user.firstName} ${user.lastName}`}
                                fill
                                sizes="40px"
                                className="rounded-full object-cover"
                                unoptimized
                              />
                            </div>
                          ) : (
                            <User className="h-5 w-5 text-gray-400" />
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {sanitizeText(user.firstName)}{' '}
                            {sanitizeText(user.lastName)}
                          </div>
                          <div className="text-sm text-gray-500">
                            {sanitizeText(user.email)}
                          </div>
                          {user.organization && (
                            <div className="text-xs text-gray-400">
                              {sanitizeText(user.organization)}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(user.role)}`}
                      >
                        <ShieldCheck className="h-3 w-3 mr-1" />
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(user)}`}
                      >
                        {getStatusText(user)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.lastLogin
                        ? new Date(user.lastLogin).toLocaleDateString()
                        : 'Never'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setShowUserModal(true);
                        }}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() =>
                          lockUserMutation.mutate({
                            userId: user.id,
                            lock: !user.isLocked,
                          })
                        }
                        className={
                          user.isLocked
                            ? 'text-green-600 hover:text-green-900'
                            : 'text-red-600 hover:text-red-900'
                        }
                      >
                        {user.isLocked ? (
                          <Unlock className="h-4 w-4" />
                        ) : (
                          <Lock className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {(usersData as any)?.total > pageSize && (
          <div className="px-6 py-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing {(currentPage - 1) * pageSize + 1} to{' '}
                {Math.min(currentPage * pageSize, (usersData as any).total)} of{' '}
                {(usersData as any).total} results
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-sm text-gray-700">
                  Page {currentPage} of{' '}
                  {Math.ceil((usersData as any).total / pageSize)}
                </span>
                <button
                  onClick={() =>
                    setCurrentPage(
                      Math.min(
                        Math.ceil((usersData as any).total / pageSize),
                        currentPage + 1
                      )
                    )
                  }
                  disabled={
                    currentPage ===
                    Math.ceil((usersData as any).total / pageSize)
                  }
                  className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showCreateModal && <CreateUserModal />}
        {showUserModal && selectedUser && (
          <UserDetailModal user={selectedUser} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default UserManagement;
