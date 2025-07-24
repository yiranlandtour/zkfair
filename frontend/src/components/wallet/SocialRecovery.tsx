import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { 
  UserPlus, 
  Shield, 
  Key, 
  AlertTriangle, 
  CheckCircle,
  XCircle,
  Clock,
  Users,
  Mail,
  Phone,
  Lock,
  Unlock
} from 'lucide-react';

interface Guardian {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  walletAddress?: string;
  status: 'pending' | 'active' | 'removed';
  addedAt: Date;
  lastActive?: Date;
}

interface RecoveryRequest {
  id: string;
  initiator: string;
  newOwner: string;
  reason: string;
  approvals: string[];
  rejections: string[];
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  createdAt: Date;
  expiresAt: Date;
}

interface RecoveryConfig {
  threshold: number;
  cooldownPeriod: number; // hours
  expiryPeriod: number; // hours
  guardians: Guardian[];
  isLocked: boolean;
}

export const SocialRecovery: React.FC = () => {
  const { address } = useAccount();
  
  const [config, setConfig] = useState<RecoveryConfig>({
    threshold: 3,
    cooldownPeriod: 48,
    expiryPeriod: 72,
    guardians: [],
    isLocked: false
  });
  
  const [activeRequests, setActiveRequests] = useState<RecoveryRequest[]>([]);
  const [showAddGuardian, setShowAddGuardian] = useState(false);
  const [showInitiateRecovery, setShowInitiateRecovery] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  
  const [newGuardian, setNewGuardian] = useState({
    name: '',
    email: '',
    phone: '',
    walletAddress: ''
  });
  
  const [recoveryForm, setRecoveryForm] = useState({
    newOwner: '',
    reason: ''
  });

  useEffect(() => {
    loadRecoveryConfig();
  }, [address]);

  const loadRecoveryConfig = async () => {
    setIsLoadingConfig(true);
    try {
      const response = await fetch(`/api/recovery/${address}`);
      if (response.ok) {
        const data = await response.json();
        setConfig(data.config);
        setActiveRequests(data.activeRequests);
      }
    } catch (error) {
      console.error('Failed to load recovery config:', error);
    } finally {
      setIsLoadingConfig(false);
    }
  };

  const addGuardian = async () => {
    try {
      const response = await fetch('/api/recovery/guardians', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          guardian: newGuardian
        })
      });

      if (response.ok) {
        await loadRecoveryConfig();
        setNewGuardian({ name: '', email: '', phone: '', walletAddress: '' });
        setShowAddGuardian(false);
      }
    } catch (error) {
      console.error('Failed to add guardian:', error);
    }
  };

  const removeGuardian = async (guardianId: string) => {
    if (!confirm('Are you sure you want to remove this guardian?')) return;

    try {
      const response = await fetch(`/api/recovery/guardians/${guardianId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address })
      });

      if (response.ok) {
        await loadRecoveryConfig();
      }
    } catch (error) {
      console.error('Failed to remove guardian:', error);
    }
  };

  const initiateRecovery = async () => {
    try {
      const response = await fetch('/api/recovery/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          ...recoveryForm
        })
      });

      if (response.ok) {
        await loadRecoveryConfig();
        setRecoveryForm({ newOwner: '', reason: '' });
        setShowInitiateRecovery(false);
      }
    } catch (error) {
      console.error('Failed to initiate recovery:', error);
    }
  };

  const approveRecovery = async (requestId: string) => {
    try {
      const response = await fetch(`/api/recovery/requests/${requestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guardian: address
        })
      });

      if (response.ok) {
        await loadRecoveryConfig();
      }
    } catch (error) {
      console.error('Failed to approve recovery:', error);
    }
  };

  const rejectRecovery = async (requestId: string) => {
    try {
      const response = await fetch(`/api/recovery/requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guardian: address
        })
      });

      if (response.ok) {
        await loadRecoveryConfig();
      }
    } catch (error) {
      console.error('Failed to reject recovery:', error);
    }
  };

  const executeRecovery = async (requestId: string) => {
    try {
      const response = await fetch(`/api/recovery/requests/${requestId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executor: address
        })
      });

      if (response.ok) {
        await loadRecoveryConfig();
      }
    } catch (error) {
      console.error('Failed to execute recovery:', error);
    }
  };

  const updateConfig = async (updates: Partial<RecoveryConfig>) => {
    try {
      const response = await fetch('/api/recovery/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          ...updates
        })
      });

      if (response.ok) {
        await loadRecoveryConfig();
      }
    } catch (error) {
      console.error('Failed to update config:', error);
    }
  };

  const getTimeRemaining = (expiresAt: Date) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const hours = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60));
    return hours > 0 ? `${hours}h remaining` : 'Expired';
  };

  if (isLoadingConfig) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-8 h-8 text-purple-600" />
            Social Recovery
          </h2>
          <div className="flex items-center gap-2">
            {config.isLocked ? (
              <div className="flex items-center gap-2 text-red-600">
                <Lock className="w-5 h-5" />
                <span className="font-medium">Wallet Locked</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-green-600">
                <Unlock className="w-5 h-5" />
                <span className="font-medium">Wallet Active</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Recovery Threshold</p>
            <div className="flex items-center justify-between">
              <p className="text-2xl font-bold">{config.threshold}</p>
              <button
                onClick={() => {
                  const newThreshold = prompt('Enter new threshold:', config.threshold.toString());
                  if (newThreshold) {
                    updateConfig({ threshold: parseInt(newThreshold) });
                  }
                }}
                className="text-blue-600 hover:text-blue-700"
              >
                <Key className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Cooldown Period</p>
            <p className="text-2xl font-bold">{config.cooldownPeriod}h</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Active Guardians</p>
            <p className="text-2xl font-bold">
              {config.guardians.filter(g => g.status === 'active').length}
            </p>
          </div>
        </div>

        {/* Guardians Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Users className="w-5 h-5" />
              Guardians
            </h3>
            <button
              onClick={() => setShowAddGuardian(true)}
              className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm flex items-center gap-1"
            >
              <UserPlus className="w-4 h-4" />
              Add Guardian
            </button>
          </div>

          <div className="space-y-3">
            {config.guardians.map((guardian) => (
              <div key={guardian.id} className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{guardian.name}</p>
                      {guardian.status === 'active' ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : guardian.status === 'pending' ? (
                        <Clock className="w-4 h-4 text-yellow-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600" />
                      )}
                    </div>
                    <div className="mt-1 space-y-1">
                      {guardian.email && (
                        <p className="text-sm text-gray-600 flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {guardian.email}
                        </p>
                      )}
                      {guardian.phone && (
                        <p className="text-sm text-gray-600 flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {guardian.phone}
                        </p>
                      )}
                      {guardian.walletAddress && (
                        <p className="text-sm text-gray-600 font-mono">
                          {guardian.walletAddress.slice(0, 6)}...{guardian.walletAddress.slice(-4)}
                        </p>
                      )}
                    </div>
                  </div>
                  {guardian.status === 'active' && (
                    <button
                      onClick={() => removeGuardian(guardian.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {config.guardians.length === 0 && (
              <p className="text-gray-500 text-center py-8">
                No guardians added. Add at least {config.threshold} guardians to enable recovery.
              </p>
            )}
          </div>
        </div>

        {/* Active Recovery Requests */}
        {activeRequests.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              Active Recovery Requests
            </h3>
            <div className="space-y-3">
              {activeRequests.map((request) => (
                <div key={request.id} className="border border-yellow-300 bg-yellow-50 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">Recovery Request #{request.id.slice(0, 8)}</p>
                      <p className="text-sm text-gray-600 mt-1">
                        New Owner: <span className="font-mono">{request.newOwner}</span>
                      </p>
                      <p className="text-sm text-gray-600">Reason: {request.reason}</p>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="text-sm">
                          Approvals: {request.approvals.length}/{config.threshold}
                        </span>
                        <span className="text-sm">
                          Rejections: {request.rejections.length}
                        </span>
                        <span className="text-sm text-gray-500">
                          {getTimeRemaining(request.expiresAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {request.status === 'pending' && (
                        <>
                          <button
                            onClick={() => approveRecovery(request.id)}
                            className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => rejectRecovery(request.id)}
                            className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {request.status === 'approved' && (
                        <button
                          onClick={() => executeRecovery(request.id)}
                          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                        >
                          Execute
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Initiate Recovery Button */}
        {config.guardians.filter(g => g.status === 'active').length >= config.threshold && (
          <div className="mt-6 pt-6 border-t">
            <button
              onClick={() => setShowInitiateRecovery(true)}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center justify-center gap-2"
            >
              <AlertTriangle className="w-5 h-5" />
              Initiate Recovery Process
            </button>
          </div>
        )}
      </div>

      {/* Add Guardian Modal */}
      {showAddGuardian && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add Guardian</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Guardian Name *
                </label>
                <input
                  type="text"
                  value={newGuardian.name}
                  onChange={(e) => setNewGuardian({ ...newGuardian, name: e.target.value })}
                  placeholder="e.g., John Doe"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email (for notifications)
                </label>
                <input
                  type="email"
                  value={newGuardian.email}
                  onChange={(e) => setNewGuardian({ ...newGuardian, email: e.target.value })}
                  placeholder="guardian@example.com"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone (for SMS alerts)
                </label>
                <input
                  type="tel"
                  value={newGuardian.phone}
                  onChange={(e) => setNewGuardian({ ...newGuardian, phone: e.target.value })}
                  placeholder="+1234567890"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Wallet Address
                </label>
                <input
                  type="text"
                  value={newGuardian.walletAddress}
                  onChange={(e) => setNewGuardian({ ...newGuardian, walletAddress: e.target.value })}
                  placeholder="0x..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800">
                  The guardian will receive a notification to confirm their role. They must approve before becoming active.
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={addGuardian}
                  disabled={!newGuardian.name}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  Add Guardian
                </button>
                <button
                  onClick={() => {
                    setShowAddGuardian(false);
                    setNewGuardian({ name: '', email: '', phone: '', walletAddress: '' });
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Initiate Recovery Modal */}
      {showInitiateRecovery && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Initiate Recovery</h3>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-800">
                ⚠️ This will start the recovery process. Guardians will be notified to approve the new owner.
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Owner Address *
                </label>
                <input
                  type="text"
                  value={recoveryForm.newOwner}
                  onChange={(e) => setRecoveryForm({ ...recoveryForm, newOwner: e.target.value })}
                  placeholder="0x..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for Recovery *
                </label>
                <textarea
                  value={recoveryForm.reason}
                  onChange={(e) => setRecoveryForm({ ...recoveryForm, reason: e.target.value })}
                  placeholder="Lost access to private keys..."
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={initiateRecovery}
                  disabled={!recoveryForm.newOwner || !recoveryForm.reason}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  Start Recovery
                </button>
                <button
                  onClick={() => {
                    setShowInitiateRecovery(false);
                    setRecoveryForm({ newOwner: '', reason: '' });
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};