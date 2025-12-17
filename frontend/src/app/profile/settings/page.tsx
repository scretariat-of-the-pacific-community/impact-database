'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  User,
  Bell,
  Shield,
  Upload,
  Key,
  Trash2,
  Download,
  Camera,
  Save,
  AlertTriangle,
  CheckCircle,
  Copy,
  RefreshCw,
  HardDrive,
} from 'lucide-react';
import { Card, Button } from '@/components/design-system';
import ErrorBanner from '@/components/ErrorBanner';
import { imageApi } from '@/lib/api';

interface UserSettings {
  profile: {
    avatar_url: string;
    bio: string;
    location: string;
    organization: string;
  };
  privacy: {
    public_profile: boolean;
    hide_stats: boolean;
    anonymous_contributions: boolean;
  };
  notifications: {
    email: {
      uploads: boolean;
      reviews: boolean;
      comments: boolean;
      achievements: boolean;
    };
    in_app: {
      uploads: boolean;
      reviews: boolean;
      comments: boolean;
      achievements: boolean;
    };
    push: {
      uploads: boolean;
      reviews: boolean;
      comments: boolean;
      achievements: boolean;
    };
  };
  default_metadata: {
    hazard_type?: string;
    location?: string;
    tags?: string[];
  };
}

interface StorageQuota {
  used: number;
  total: number;
  by_type: {
    images: number;
    videos: number;
    documents: number;
  };
}

interface APIToken {
  id: string;
  name: string;
  token: string;
  created_at: string;
  last_used?: string;
  usage_count: number;
}

const glassCard = 'rounded-3xl border border-white/10 bg-white/5 backdrop-blur shadow-xl';
const glassInput = 'rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-white placeholder-white/40 focus:border-pacific-400 focus:outline-none focus:ring-2 focus:ring-pacific-400/20';
const glassTextarea = 'rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-white placeholder-white/40 focus:border-pacific-400 focus:outline-none focus:ring-2 focus:ring-pacific-400/20 resize-none';

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeSection, setActiveSection] = useState<string>('profile');

  // Set active section from URL parameter
  useEffect(() => {
    const section = searchParams.get('section');
    if (section) {
      setActiveSection(section);
    }
  }, [searchParams]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showTokenGenerate, setShowTokenGenerate] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch user settings
  const { data: settings, isLoading: settingsLoading } = useQuery<UserSettings>({
    queryKey: ['user-settings'],
    queryFn: () => imageApi.userSettings(),
    enabled: !authLoading && isAuthenticated,
  });

  // Fetch storage quota
  const { data: storageQuota } = useQuery<StorageQuota>({
    queryKey: ['storage-quota'],
    queryFn: () => imageApi.storageQuota(),
    enabled: !authLoading && isAuthenticated,
  });

  // Fetch API tokens
  const { data: apiTokens, refetch: refetchTokens } = useQuery<APIToken[]>({
    queryKey: ['api-tokens'],
    queryFn: () => imageApi.apiTokens(),
    enabled: !authLoading && isAuthenticated,
  });

  const [formData, setFormData] = useState<UserSettings>(
    settings || {
      profile: { avatar_url: '', bio: '', location: '', organization: '' },
      privacy: { public_profile: true, hide_stats: false, anonymous_contributions: false },
      notifications: {
        email: { uploads: true, reviews: true, comments: true, achievements: false },
        in_app: { uploads: true, reviews: true, comments: true, achievements: true },
        push: { uploads: false, reviews: false, comments: false, achievements: false },
      },
      default_metadata: { tags: [] },
    }
  );

  // Update form data when settings load
  if (settings && !formData.profile.avatar_url && settings.profile.avatar_url) {
    setFormData(settings);
  }

  const updateSettingsMutation = useMutation({
    mutationFn: (data: Partial<UserSettings>) => imageApi.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-settings'] });
      queryClient.invalidateQueries({ queryKey: ['user-profile-stats'] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  const generateTokenMutation = useMutation({
    mutationFn: (name: string) => imageApi.generateToken(name),
    onSuccess: (data) => {
      setGeneratedToken(data.token);
      refetchTokens();
      setNewTokenName('');
    },
  });

  const deleteTokenMutation = useMutation({
    mutationFn: (tokenId: string) => imageApi.deleteToken(tokenId),
    onSuccess: () => {
      refetchTokens();
    },
  });

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const result = await imageApi.uploadAvatar(file);
        setFormData({
          ...formData,
          profile: { ...formData.profile, avatar_url: result.url },
        });
        // Auto-save avatar update
        updateSettingsMutation.mutate({ profile: { ...formData.profile, avatar_url: result.url } });
      } catch (error) {
        console.error('Failed to upload avatar:', error);
        alert('Failed to upload avatar. Please try again.');
      }
    }
  };

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate(formData);
  };

  const handleExportData = async () => {
    try {
      const blob = await imageApi.exportData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `impact-portal-data-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export data:', error);
      alert('Failed to export data. Please try again.');
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await imageApi.deleteAccount();
      // Clear local storage and redirect to home
      localStorage.removeItem('ocean_portal_session');
      document.cookie = 'ocean_portal_token=; Max-Age=0; path=/;';
      window.location.href = '/';
    } catch (error) {
      console.error('Failed to delete account:', error);
      alert('Failed to delete account. Please try again or contact support.');
      setShowDeleteConfirm(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (authLoading || settingsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-deep-950 via-deep-900 to-deep-950">
        <div className="text-center text-white">
          <RefreshCw className="mx-auto mb-4 h-12 w-12 animate-spin text-pacific-300" />
          <p className="text-lg">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    router.push('/auth/login?returnUrl=/profile/settings');
    return null;
  }

  const sections = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'privacy', label: 'Privacy', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'defaults', label: 'Upload Defaults', icon: Upload },
    { id: 'storage', label: 'Storage', icon: HardDrive },
    { id: 'api', label: 'API Access', icon: Key },
    { id: 'account', label: 'Account', icon: Trash2 },
  ];

  const renderProfileSection = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-4">Profile Customization</h3>
        <div className="flex items-start gap-6 mb-6">
          <div className="relative">
            <div className="h-24 w-24 rounded-2xl bg-gradient-to-br from-pacific-400 to-palm-400 p-1">
              <div className="flex h-full w-full items-center justify-center rounded-xl bg-deep-950/70 overflow-hidden">
                {formData.profile.avatar_url ? (
                  <img src={formData.profile.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-12 w-12 text-white/60" />
                )}
              </div>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-2 -right-2 rounded-full bg-pacific-500 p-2 text-white hover:bg-pacific-400 transition"
            >
              <Camera className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">Bio</label>
              <textarea
                className={glassTextarea}
                rows={3}
                placeholder="Tell us about yourself..."
                value={formData.profile.bio}
                onChange={(e) =>
                  setFormData({ ...formData, profile: { ...formData.profile, bio: e.target.value } })
                }
              />
            </div>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">Location</label>
            <input
              type="text"
              className={glassInput}
              placeholder="City, Country"
              value={formData.profile.location}
              onChange={(e) =>
                setFormData({ ...formData, profile: { ...formData.profile, location: e.target.value } })
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">Organization</label>
            <input
              type="text"
              className={glassInput}
              placeholder="Your organization"
              value={formData.profile.organization}
              onChange={(e) =>
                setFormData({ ...formData, profile: { ...formData.profile, organization: e.target.value } })
              }
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderPrivacySection = () => (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold text-white mb-4">Privacy Controls</h3>
      <div className="space-y-4">
        <label className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition">
          <div>
            <p className="font-medium text-white">Public Profile</p>
            <p className="text-sm text-white/60">Allow others to view your profile and contributions</p>
          </div>
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-white/20 bg-white/5 text-pacific-500 focus:ring-2 focus:ring-pacific-400/20"
            checked={formData.privacy.public_profile}
            onChange={(e) =>
              setFormData({
                ...formData,
                privacy: { ...formData.privacy, public_profile: e.target.checked },
              })
            }
          />
        </label>
        <label className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition">
          <div>
            <p className="font-medium text-white">Hide Statistics</p>
            <p className="text-sm text-white/60">Hide your upload count and approval rate from public view</p>
          </div>
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-white/20 bg-white/5 text-pacific-500 focus:ring-2 focus:ring-pacific-400/20"
            checked={formData.privacy.hide_stats}
            onChange={(e) =>
              setFormData({ ...formData, privacy: { ...formData.privacy, hide_stats: e.target.checked } })
            }
          />
        </label>
        <label className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition">
          <div>
            <p className="font-medium text-white">Anonymous Contributions</p>
            <p className="text-sm text-white/60">Display your uploads without linking to your profile</p>
          </div>
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-white/20 bg-white/5 text-pacific-500 focus:ring-2 focus:ring-pacific-400/20"
            checked={formData.privacy.anonymous_contributions}
            onChange={(e) =>
              setFormData({
                ...formData,
                privacy: { ...formData.privacy, anonymous_contributions: e.target.checked },
              })
            }
          />
        </label>
      </div>
    </div>
  );

  const renderNotificationsSection = () => (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold text-white mb-4">Notification Preferences</h3>
      {(['email', 'in_app', 'push'] as const).map((type) => (
        <div key={type}>
          <h4 className="text-lg font-medium text-white/90 mb-3 capitalize">
            {type === 'in_app' ? 'In-App' : type === 'push' ? 'Push (PWA)' : 'Email'}
          </h4>
          <div className="space-y-2">
            {(['uploads', 'reviews', 'comments', 'achievements'] as const).map((event) => (
              <label
                key={event}
                className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition"
              >
                <span className="text-sm text-white/80 capitalize">{event}</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-white/20 bg-white/5 text-pacific-500 focus:ring-2 focus:ring-pacific-400/20"
                  checked={formData.notifications[type][event]}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      notifications: {
                        ...formData.notifications,
                        [type]: { ...formData.notifications[type], [event]: e.target.checked },
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderDefaultsSection = () => (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold text-white mb-4">Default Upload Metadata</h3>
      <p className="text-white/70 text-sm mb-4">
        Set default values to pre-fill upload forms and speed up your workflow.
      </p>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">Default Hazard Type</label>
          <select
            className={glassInput}
            value={formData.default_metadata.hazard_type || ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                default_metadata: { ...formData.default_metadata, hazard_type: e.target.value },
              })
            }
          >
            <option value="">None</option>
            <option value="cyclone">Cyclone</option>
            <option value="earthquake">Earthquake</option>
            <option value="tsunami">Tsunami</option>
            <option value="flooding">Flooding</option>
            <option value="drought">Drought</option>
            <option value="volcanic_eruption">Volcanic Eruption</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">Default Location</label>
          <input
            type="text"
            className={glassInput}
            placeholder="e.g., Fiji, Pacific Ocean"
            value={formData.default_metadata.location || ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                default_metadata: { ...formData.default_metadata, location: e.target.value },
              })
            }
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">Default Tags (comma-separated)</label>
          <input
            type="text"
            className={glassInput}
            placeholder="e.g., field-survey, damage-assessment"
            value={formData.default_metadata.tags?.join(', ') || ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                default_metadata: {
                  ...formData.default_metadata,
                  tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                },
              })
            }
          />
        </div>
      </div>
    </div>
  );

  const renderStorageSection = () => {
    if (!storageQuota) return null;
    const usagePercent = (storageQuota.used / storageQuota.total) * 100;

    return (
      <div className="space-y-6">
        <h3 className="text-xl font-semibold text-white mb-4">Storage Usage</h3>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/80">Total Usage</span>
              <span className="text-white font-semibold">
                {formatBytes(storageQuota.used)} / {formatBytes(storageQuota.total)}
              </span>
            </div>
            <div className="h-3 rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full transition-all ${
                  usagePercent > 90 ? 'bg-coral-500' : usagePercent > 70 ? 'bg-amber-500' : 'bg-pacific-500'
                }`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            <p className="text-xs text-white/60 mt-1">{usagePercent.toFixed(1)}% used</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <p className="text-sm text-white/60">Images</p>
              <p className="text-lg font-semibold text-white">{formatBytes(storageQuota.by_type.images)}</p>
            </div>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <p className="text-sm text-white/60">Videos</p>
              <p className="text-lg font-semibold text-white">{formatBytes(storageQuota.by_type.videos)}</p>
            </div>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <p className="text-sm text-white/60">Documents</p>
              <p className="text-lg font-semibold text-white">{formatBytes(storageQuota.by_type.documents)}</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAPISection = () => (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold text-white mb-4">API Access Management</h3>
      <p className="text-white/70 text-sm mb-4">
        Generate API tokens to programmatically upload images and access your data.
      </p>

      {generatedToken && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-emerald-400 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-emerald-200 mb-2">Token Generated Successfully</p>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-black/20 font-mono text-sm text-emerald-100">
                <code className="flex-1 break-all">{generatedToken}</code>
                <button
                  onClick={() => copyToClipboard(generatedToken)}
                  className="p-1.5 rounded hover:bg-white/10 transition"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-emerald-200/70 mt-2">
                ⚠️ Save this token now. You won't be able to see it again.
              </p>
            </div>
          </div>
        </div>
      )}

      {showTokenGenerate && (
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <label className="block text-sm font-medium text-white/80 mb-2">Token Name</label>
          <div className="flex gap-2">
            <input
              type="text"
              className={`${glassInput} flex-1`}
              placeholder="e.g., Field Upload Script"
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value)}
            />
            <Button
              variant="primary"
              className="bg-pacific-500 hover:bg-pacific-400"
              onClick={() => generateTokenMutation.mutate(newTokenName)}
              disabled={!newTokenName || generateTokenMutation.isPending}
            >
              {generateTokenMutation.isPending ? 'Generating...' : 'Generate'}
            </Button>
            <Button
              variant="secondary"
              className="bg-white/10 hover:bg-white/20"
              onClick={() => {
                setShowTokenGenerate(false);
                setNewTokenName('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!showTokenGenerate && (
        <Button
          variant="primary"
          className="bg-pacific-500 hover:bg-pacific-400"
          onClick={() => setShowTokenGenerate(true)}
        >
          <Key className="h-4 w-4 mr-2" />
          Generate New Token
        </Button>
      )}

      {apiTokens && apiTokens.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-white/80 mb-3">Active Tokens</h4>
          {apiTokens.map((token) => (
            <div
              key={token.id}
              className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10"
            >
              <div>
                <p className="font-medium text-white">{token.name}</p>
                <p className="text-xs text-white/60">
                  Created {new Date(token.created_at).toLocaleDateString()} • Used {token.usage_count} times
                  {token.last_used && ` • Last used ${new Date(token.last_used).toLocaleDateString()}`}
                </p>
              </div>
              <Button
                variant="secondary"
                className="bg-coral-500/20 text-coral-200 hover:bg-coral-500/30"
                onClick={() => deleteTokenMutation.mutate(token.id)}
                disabled={deleteTokenMutation.isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderAccountSection = () => (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold text-white mb-4">Account Management</h3>
      <div className="space-y-4">
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-start gap-3 mb-4">
            <Download className="h-5 w-5 text-pacific-300 mt-0.5" />
            <div>
              <h4 className="font-medium text-white mb-1">Export Your Data</h4>
              <p className="text-sm text-white/60 mb-3">
                Download a copy of your profile, settings, and all your uploads in JSON format.
              </p>
              <Button
                variant="primary"
                className="bg-pacific-500 hover:bg-pacific-400"
                onClick={handleExportData}
              >
                <Download className="h-4 w-4 mr-2" />
                Export Data
              </Button>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-coral-500/10 border border-coral-500/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-coral-400 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-medium text-coral-200 mb-1">Delete Account</h4>
              <p className="text-sm text-coral-200/70 mb-3">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>
              {!showDeleteConfirm ? (
                <Button
                  variant="secondary"
                  className="bg-coral-500/20 text-coral-200 hover:bg-coral-500/30"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Account
                </Button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-coral-100">
                    Are you absolutely sure? Type "DELETE" to confirm:
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className={`${glassInput} flex-1`}
                      placeholder="Type DELETE"
                    />
                    <Button
                      variant="secondary"
                      className="bg-coral-500 text-white hover:bg-coral-400"
                      onClick={handleDeleteAccount}
                    >
                      Confirm Delete
                    </Button>
                    <Button
                      variant="secondary"
                      className="bg-white/10 hover:bg-white/20"
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-deep-950 via-deep-900 to-deep-950 px-4 py-10 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Settings & Preferences</h1>
            <p className="text-white/70 mt-1">Manage your profile, privacy, and account settings</p>
          </div>
          <Button
            variant="secondary"
            className="bg-white/10 hover:bg-white/20"
            onClick={() => router.push('/profile')}
          >
            Back to Profile
          </Button>
        </div>

        {saveSuccess && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-emerald-400" />
            <p className="text-emerald-200">Settings saved successfully!</p>
          </div>
        )}

        {updateSettingsMutation.isError && (
          <ErrorBanner
            title="Failed to save settings"
            message="Please try again or contact support if the problem persists."
            onRetry={handleSaveSettings}
          />
        )}

        <div className="grid gap-6 lg:grid-cols-[250px,1fr]">
          <Card className={`${glassCard} border-white/5 h-fit`}>
            <nav className="space-y-1">
              {sections.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                      isActive
                        ? 'bg-pacific-500 text-white'
                        : 'text-white/70 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {section.label}
                  </button>
                );
              })}
            </nav>
          </Card>

          <Card className={`${glassCard} border-white/5`}>
            <div className="p-6">
              {activeSection === 'profile' && renderProfileSection()}
              {activeSection === 'privacy' && renderPrivacySection()}
              {activeSection === 'notifications' && renderNotificationsSection()}
              {activeSection === 'defaults' && renderDefaultsSection()}
              {activeSection === 'storage' && renderStorageSection()}
              {activeSection === 'api' && renderAPISection()}
              {activeSection === 'account' && renderAccountSection()}

              {activeSection !== 'account' && activeSection !== 'api' && (
                <div className="flex items-center gap-3 mt-6 pt-6 border-t border-white/10">
                  <Button
                    variant="primary"
                    className="bg-pacific-500 hover:bg-pacific-400"
                    onClick={handleSaveSettings}
                    disabled={updateSettingsMutation.isPending}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {updateSettingsMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button
                    variant="secondary"
                    className="bg-white/10 hover:bg-white/20"
                    onClick={() => settings && setFormData(settings)}
                  >
                    Reset
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
