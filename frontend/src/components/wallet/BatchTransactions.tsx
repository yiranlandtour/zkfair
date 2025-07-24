import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { ethers } from 'ethers';
import { useSmartWallet } from '../../contexts/SmartWalletContext';
import { 
  Package, 
  Plus, 
  Trash2, 
  Send, 
  Calculator,
  DollarSign,
  FileText,
  Copy,
  Download,
  Upload,
  AlertCircle,
  CheckCircle,
  Clock,
  ArrowRight,
  Settings
} from 'lucide-react';

interface Transaction {
  id: string;
  to: string;
  value: string;
  data: string;
  description: string;
  gasEstimate?: string;
  status?: 'pending' | 'success' | 'failed';
}

interface BatchTemplate {
  id: string;
  name: string;
  description: string;
  transactions: Transaction[];
  createdAt: Date;
  lastUsed?: Date;
}

interface GasEstimate {
  perTransaction: string[];
  total: string;
  totalUsd: string;
}

export const BatchTransactions: React.FC = () => {
  const { address } = useAccount();
  const { sendUserOperation, estimateGas, getBalance } = useSmartWallet();
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [templates, setTemplates] = useState<BatchTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [isEstimatingGas, setIsEstimatingGas] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [gasEstimate, setGasEstimate] = useState<GasEstimate | null>(null);
  const [executionResults, setExecutionResults] = useState<any[]>([]);
  
  const [newTx, setNewTx] = useState<Transaction>({
    id: '',
    to: '',
    value: '0',
    data: '0x',
    description: ''
  });
  
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    name: '',
    description: ''
  });

  useEffect(() => {
    loadTemplates();
  }, [address]);

  const loadTemplates = async () => {
    try {
      const response = await fetch(`/api/batch-templates/${address}`);
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const addTransaction = () => {
    if (!ethers.isAddress(newTx.to)) {
      alert('Invalid recipient address');
      return;
    }

    const tx: Transaction = {
      ...newTx,
      id: Date.now().toString(),
      value: ethers.parseEther(newTx.value || '0').toString()
    };

    setTransactions([...transactions, tx]);
    setNewTx({
      id: '',
      to: '',
      value: '0',
      data: '0x',
      description: ''
    });
    setGasEstimate(null);
  };

  const removeTransaction = (id: string) => {
    setTransactions(transactions.filter(tx => tx.id !== id));
    setGasEstimate(null);
  };

  const updateTransaction = (id: string, updates: Partial<Transaction>) => {
    setTransactions(transactions.map(tx => 
      tx.id === id ? { ...tx, ...updates } : tx
    ));
    setGasEstimate(null);
  };

  const estimateBatchGas = async () => {
    if (transactions.length === 0) return;

    setIsEstimatingGas(true);
    try {
      const estimates = await Promise.all(
        transactions.map(tx => 
          estimateGas(tx.to, tx.data, BigInt(tx.value))
        )
      );

      const total = estimates.reduce((sum, est) => sum + est, 0n);
      const gasPrice = await getGasPrice();
      const totalUsd = calculateUsdValue(total, gasPrice);

      setGasEstimate({
        perTransaction: estimates.map(e => ethers.formatEther(e)),
        total: ethers.formatEther(total),
        totalUsd
      });

      // Update transactions with gas estimates
      setTransactions(transactions.map((tx, i) => ({
        ...tx,
        gasEstimate: ethers.formatEther(estimates[i])
      })));
    } catch (error) {
      console.error('Failed to estimate gas:', error);
    } finally {
      setIsEstimatingGas(false);
    }
  };

  const getGasPrice = async (): Promise<bigint> => {
    // Mock gas price - in production, fetch from provider
    return ethers.parseGwei('20');
  };

  const calculateUsdValue = (gas: bigint, gasPrice: bigint): string => {
    // Mock ETH price - in production, fetch from price oracle
    const ethPrice = 2000;
    const totalEth = parseFloat(ethers.formatEther(gas * gasPrice));
    return (totalEth * ethPrice).toFixed(2);
  };

  const executeBatch = async () => {
    if (transactions.length === 0) return;

    setIsExecuting(true);
    setExecutionResults([]);

    try {
      // Encode batch transaction
      const batchData = encodeBatchTransaction(transactions);
      
      // Send as single user operation
      const userOpHash = await sendUserOperation(
        process.env.REACT_APP_BATCH_CONTRACT || ethers.ZeroAddress,
        batchData
      );

      // Mock execution results - in production, monitor actual execution
      const results = transactions.map((tx, i) => ({
        id: tx.id,
        status: 'success',
        hash: `0x${i.toString().padStart(64, '0')}`
      }));

      setExecutionResults(results);
      
      // Clear transactions after successful execution
      setTimeout(() => {
        setTransactions([]);
        setExecutionResults([]);
      }, 5000);
    } catch (error) {
      console.error('Failed to execute batch:', error);
      const results = transactions.map(tx => ({
        id: tx.id,
        status: 'failed',
        error: error.message
      }));
      setExecutionResults(results);
    } finally {
      setIsExecuting(false);
    }
  };

  const encodeBatchTransaction = (txs: Transaction[]): string => {
    // Encode transactions for batch execution
    // This is a simplified version - actual implementation depends on contract
    const targets = txs.map(tx => tx.to);
    const values = txs.map(tx => tx.value);
    const datas = txs.map(tx => tx.data);

    return ethers.AbiCoder.defaultAbiCoder().encode(
      ['address[]', 'uint256[]', 'bytes[]'],
      [targets, values, datas]
    );
  };

  const saveAsTemplate = async () => {
    if (transactions.length === 0 || !templateForm.name) return;

    try {
      const response = await fetch('/api/batch-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: address,
          name: templateForm.name,
          description: templateForm.description,
          transactions
        })
      });

      if (response.ok) {
        await loadTemplates();
        setShowSaveTemplate(false);
        setTemplateForm({ name: '', description: '' });
      }
    } catch (error) {
      console.error('Failed to save template:', error);
    }
  };

  const loadTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setTransactions(template.transactions.map(tx => ({
        ...tx,
        id: Date.now().toString() + Math.random()
      })));
      setSelectedTemplate(templateId);
    }
  };

  const exportBatch = () => {
    const data = {
      transactions,
      metadata: {
        created: new Date().toISOString(),
        creator: address
      }
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBatch = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.transactions && Array.isArray(data.transactions)) {
          setTransactions(data.transactions.map(tx => ({
            ...tx,
            id: Date.now().toString() + Math.random()
          })));
        }
      } catch (error) {
        console.error('Failed to import batch:', error);
        alert('Invalid batch file');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-8 h-8 text-green-600" />
            Batch Transactions
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => document.getElementById('import-batch')?.click()}
              className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm flex items-center gap-1"
            >
              <Upload className="w-4 h-4" />
              Import
            </button>
            <input
              id="import-batch"
              type="file"
              accept=".json"
              onChange={importBatch}
              className="hidden"
            />
            <button
              onClick={exportBatch}
              disabled={transactions.length === 0}
              className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm flex items-center gap-1 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        {/* Template Selector */}
        {templates.length > 0 && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Load from Template
            </label>
            <select
              value={selectedTemplate}
              onChange={(e) => loadTemplate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
            >
              <option value="">Select a template...</option>
              {templates.map(template => (
                <option key={template.id} value={template.id}>
                  {template.name} - {template.transactions.length} transactions
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Add Transaction Form */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold mb-3">Add Transaction</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <input
                type="text"
                value={newTx.description}
                onChange={(e) => setNewTx({ ...newTx, description: e.target.value })}
                placeholder="e.g., Payment to vendor"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Recipient Address
              </label>
              <input
                type="text"
                value={newTx.to}
                onChange={(e) => setNewTx({ ...newTx, to: e.target.value })}
                placeholder="0x..."
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Value (ETH)
              </label>
              <input
                type="text"
                value={newTx.value}
                onChange={(e) => setNewTx({ ...newTx, value: e.target.value })}
                placeholder="0.0"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data (optional)
              </label>
              <input
                type="text"
                value={newTx.data}
                onChange={(e) => setNewTx({ ...newTx, data: e.target.value })}
                placeholder="0x"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
          <button
            onClick={addTransaction}
            disabled={!newTx.to || !newTx.description}
            className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Transaction
          </button>
        </div>

        {/* Transaction List */}
        {transactions.length > 0 && (
          <div className="space-y-4 mb-6">
            <h3 className="text-lg font-semibold">
              Batch Queue ({transactions.length} transactions)
            </h3>
            {transactions.map((tx, index) => (
              <div key={tx.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">#{index + 1}</span>
                      <p className="font-medium">{tx.description}</p>
                      {executionResults.find(r => r.id === tx.id)?.status === 'success' && (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      )}
                      {executionResults.find(r => r.id === tx.id)?.status === 'failed' && (
                        <XCircle className="w-4 h-4 text-red-600" />
                      )}
                    </div>
                    <div className="mt-2 space-y-1">
                      <p className="text-sm text-gray-600">
                        To: <span className="font-mono">{tx.to}</span>
                      </p>
                      <p className="text-sm text-gray-600">
                        Value: {ethers.formatEther(tx.value)} ETH
                      </p>
                      {tx.data !== '0x' && (
                        <p className="text-sm text-gray-600">
                          Data: <span className="font-mono">{tx.data.slice(0, 10)}...</span>
                        </p>
                      )}
                      {tx.gasEstimate && (
                        <p className="text-sm text-gray-600">
                          Est. Gas: {tx.gasEstimate} ETH
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => removeTransaction(tx.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Gas Estimate */}
        {gasEstimate && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <Calculator className="w-5 h-5" />
              Gas Estimate
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Total Gas</p>
                <p className="font-medium">{gasEstimate.total} ETH</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Estimated Cost</p>
                <p className="font-medium">${gasEstimate.totalUsd} USD</p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {transactions.length > 0 && (
          <div className="flex gap-3">
            <button
              onClick={estimateBatchGas}
              disabled={isEstimatingGas}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
            >
              {isEstimatingGas ? (
                <>
                  <Clock className="w-4 h-4 animate-spin" />
                  Estimating...
                </>
              ) : (
                <>
                  <Calculator className="w-4 h-4" />
                  Estimate Gas
                </>
              )}
            </button>
            <button
              onClick={() => setShowSaveTemplate(true)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Save as Template
            </button>
            <button
              onClick={executeBatch}
              disabled={isExecuting || transactions.length === 0}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isExecuting ? (
                <>
                  <Clock className="w-4 h-4 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Execute Batch ({transactions.length} transactions)
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Save Template Modal */}
      {showSaveTemplate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Save as Template</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Template Name
                </label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  placeholder="e.g., Monthly Payments"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={templateForm.description}
                  onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                  placeholder="Template description..."
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">
                  This template will save {transactions.length} transactions that can be reused later.
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={saveAsTemplate}
                  disabled={!templateForm.name}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  Save Template
                </button>
                <button
                  onClick={() => {
                    setShowSaveTemplate(false);
                    setTemplateForm({ name: '', description: '' });
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