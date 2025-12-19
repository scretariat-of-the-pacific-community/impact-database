'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/lib/auth-utils';
import Image from 'next/image';
import { sanitizeText } from '@/lib/sanitize';
import {
  UserPlusIcon,
  UserIcon,
  PencilIcon,
  TrashIcon,
  LockClosedIcon,
  LockOpenIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  EyeIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';

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
}

const UserManagement: React.FC = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    role: '',
    status: '',
    organization: ''
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);

  const queryClient = useQueryClient();

  // Fetch users
  const { data: usersData, isLoading, error } = useQuery({
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
    }
  });

  // Fetch roles
  const { data: roles } = useQuery({
    queryKey: ['admin-roles'],
    queryFn: async () => {
      const response = await authFetch('/api/admin/roles');
      if (!response.ok) throw new Error('Failed to fetch roles');
      return response.json();
    }
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (userData: CreateUserData) => {
      const response = await authFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(userData)
      });
      if (!response.ok) throw new Error('Failed to create user');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowCreateModal(false);
    }
  });

  // Lock/unlock user mutation
  const lockUserMutation = useMutation({
    mutationFn: async ({ userId, lock }: { userId: string; lock: boolean }) => {
      const response = await authFetch(`/api/admin/users/${userId}/${lock ? 'lock' : 'unlock'}`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error(`Failed to ${lock ? 'lock' : 'unlock'} user`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    }
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await authFetch(`/api/admin/users/${userId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete user');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    }
  });

  const getRoleColor = (role: string) => {
    switch (role.toLowerCase()) {
      case 'super_admin': return 'bg-purple-100 text-purple-800';
      case 'admin': return 'bg-red-100 text-red-800';
      case 'curator': return 'bg-blue-100 text-blue-800';
      case 'contributor': return 'bg-green-100 text-green-800';
      case 'viewer': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
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
      sendInvite: true
    });

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      createUserMutation.mutate(formData);
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md"
        >
          <h3 className="text-lg font-medium text-gray-900 mb-4">Create New User</h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email *
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role *
              </label>
              <select
                required
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select Role</option>
                {roles?.map((role: any) => (
                  <option key={role.name} value={role.name}>
                    {role.displayName || role.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Organization
              </label>
              <input
                type="text"
                value={formData.organization}
                onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div className="flex items-center">
              <input
                type="checkbox"
                id="sendInvite"
                checked={formData.sendInvite}
                onChange={(e) => setFormData({ ...formData, sendInvite: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="sendInvite" className="ml-2 block text-sm text-gray-900">
                Send invitation email
              </label>
            </div>
            
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
                <UserIcon className="h-8 w-8 text-gray-400" />
              )}
            </div>
            <div>
              <h4 className="text-xl font-medium text-gray-900">
                {sanitizeText(user.firstName)} {sanitizeText(user.lastName)}
              </h4>
              <p className="text-gray-600">{sanitizeText(user.email)}</p>
              <div className="flex items-center space-x-2 mt-1">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(user.role)}`}>
                  {sanitizeText(user.role)}
                </span>
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(user)}`}>
                  {getStatusText(user)}
                </span>
              </div>
            </div>
          </div>
          
          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Organization</label>
              <p className="mt-1 text-sm text-gray-900">{sanitizeText(user.organization || 'Not specified')}</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Last Login</label>
              <p className="mt-1 text-sm text-gray-900">
                {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Created</label>
              <p className="mt-1 text-sm text-gray-900">
                {new Date(user.createdAt).toLocaleString()}
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Login Attempts</label>
              <p className="mt-1 text-sm text-gray-900">{user.loginAttempts}</p>
            </div>
          </div>
          
          {/* Permissions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
            <div className="flex flex-wrap gap-2">
              {user.permissions.map(permission => (
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
              onClick={() => lockUserMutation.mutate({ userId: user.id, lock: !user.isLocked })}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                user.isLocked
                  ? 'text-green-600 bg-green-100 hover:bg-green-200'
                  : 'text-red-600 bg-red-100 hover:bg-red-200'
              }`}
            >
              {user.isLocked ? (
                <>
                  <LockOpenIcon className="h-4 w-4 inline mr-1" />
                  Unlock User
                </>
              ) : (
                <>
                  <LockClosedIcon className="h-4 w-4 inline mr-1" />
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
              <TrashIcon className="h-4 w-4 inline mr-1" />
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
          <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error loading users</h3>
            <p className="text-sm text-red-700 mt-1">Please try refreshing the page.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
        >
          <UserPlusIcon className="h-4 w-4 mr-2" />
          Add User
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <select
            value={filters.role}
            onChange={(e) => setFilters({ ...filters, role: e.target.value })}
            className="border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Roles</option>
            {roles?.map((role: any) => (
              <option key={role.name} value={role.name}>
                {role.displayName || role.name}
              </option>
            ))}
          </select>
          
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="locked">Locked</option>
            <option value="inactive">Inactive</option>
          </select>
          
          <input
            type="text"
            placeholder="Organization"
            value={filters.organization}
            onChange={(e) => setFilters({ ...filters, organization: e.target.value })}
            className="border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
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
                {usersData?.users?.map((user: User) => (
                  <motion.tr
                    key={user.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="hover:bg-gray-50"
                  >
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
                            <UserIcon className="h-5 w-5 text-gray-400" />
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                {sanitizeText(user.firstName)} {sanitizeText(user.lastName)}
              </div>
              <div className="text-sm text-gray-500">{sanitizeText(user.email)}</div>
              {user.organization && (
                <div className="text-xs text-gray-400">{sanitizeText(user.organization)}</div>
              )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(user.role)}`}>
                        <ShieldCheckIcon className="h-3 w-3 mr-1" />
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(user)}`}>
                        {getStatusText(user)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setShowUserModal(true);
                        }}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <EyeIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => lockUserMutation.mutate({ userId: user.id, lock: !user.isLocked })}
                        className={user.isLocked ? 'text-green-600 hover:text-green-900' : 'text-red-600 hover:text-red-900'}
                      >
                        {user.isLocked ? <LockOpenIcon className="h-4 w-4" /> : <LockClosedIcon className="h-4 w-4" />}
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {usersData?.total > pageSize && (
          <div className="px-6 py-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, usersData.total)} of {usersData.total} results
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                >
                  <ChevronLeftIcon className="h-5 w-5" />
                </button>
                <span className="text-sm text-gray-700">
                  Page {currentPage} of {Math.ceil(usersData.total / pageSize)}
                </span>
                <button
                  onClick={() => setCurrentPage(Math.min(Math.ceil(usersData.total / pageSize), currentPage + 1))}
                  disabled={currentPage === Math.ceil(usersData.total / pageSize)}
                  className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                >
                  <ChevronRightIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showCreateModal && <CreateUserModal />}
        {showUserModal && selectedUser && <UserDetailModal user={selectedUser} />}
      </AnimatePresence>
    </div>
  );
};

export default UserManagement;
