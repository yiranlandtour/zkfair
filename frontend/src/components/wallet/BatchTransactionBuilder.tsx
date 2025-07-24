import React, { useState, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  Chip,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  InputAdornment,
  Grid,
  FormHelperText,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Send as SendIcon,
  PlayArrow as PlayIcon,
  Clear as ClearIcon,
  ExpandMore as ExpandMoreIcon,
  FileCopy as CopyIcon,
  Calculate as CalculateIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Schedule as ScheduleIcon,
  AccountBalanceWallet as WalletIcon,
  SwapHoriz as SwapIcon,
  Code as CodeIcon,
} from '@mui/icons-material';
import { useSmartWallet } from '../../contexts/SmartWalletContext';
import { ethers } from 'ethers';

interface BatchTransaction {
  id: string;
  type: 'transfer' | 'contract' | 'swap';
  to: string;
  value: string;
  data: string;
  description: string;
  token?: string;
  estimatedGas?: string;
  functionName?: string;
  functionArgs?: any[];
}

interface GasEstimation {
  total: string;
  perTransaction: Record<string, string>;
  token: string;
}

const TRANSACTION_TYPES = [
  { value: 'transfer', label: 'Token Transfer', icon: <SendIcon /> },
  { value: 'contract', label: 'Contract Call', icon: <CodeIcon /> },
  { value: 'swap', label: 'Token Swap', icon: <SwapIcon /> },
];

const SUPPORTED_TOKENS = [
  { address: ethers.constants.AddressZero, symbol: 'ETH', decimals: 18 },
  { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6 },
  { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6 },
];

export const BatchTransactionBuilder: React.FC = () => {
  const { smartWallet, sendUserOperation, estimateUserOpGas } = useSmartWallet();
  const [transactions, setTransactions] = useState<BatchTransaction[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gasEstimation, setGasEstimation] = useState<GasEstimation | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executionStatus, setExecutionStatus] = useState<Record<string, 'pending' | 'success' | 'failed'>>({});

  // Form states
  const [txType, setTxType] = useState<'transfer' | 'contract' | 'swap'>('transfer');
  const [to, setTo] = useState('');
  const [value, setValue] = useState('');
  const [token, setToken] = useState(ethers.constants.AddressZero);
  const [description, setDescription] = useState('');
  const [contractData, setContractData] = useState('');
  const [functionName, setFunctionName] = useState('');

  const handleAddTransaction = () => {
    if (!ethers.utils.isAddress(to)) {
      alert('Invalid recipient address');
      return;
    }

    const newTx: BatchTransaction = {
      id: Date.now().toString(),
      type: txType,
      to,
      value: value || '0',
      data: contractData || '0x',
      description,
      token: txType === 'transfer' ? token : undefined,
      functionName: txType === 'contract' ? functionName : undefined,
    };

    setTransactions([...transactions, newTx]);
    
    // Reset form
    setTo('');
    setValue('');
    setDescription('');
    setContractData('');
    setFunctionName('');
    setAddDialogOpen(false);
  };

  const handleRemoveTransaction = (id: string) => {
    setTransactions(transactions.filter(tx => tx.id !== id));
  };

  const handleDuplicateTransaction = (tx: BatchTransaction) => {
    const newTx = {
      ...tx,
      id: Date.now().toString(),
      description: `${tx.description} (Copy)`,
    };
    setTransactions([...transactions, newTx]);
  };

  const handleClearAll = () => {
    if (confirm('Are you sure you want to clear all transactions?')) {
      setTransactions([]);
      setGasEstimation(null);
      setExecutionStatus({});
    }
  };

  const estimateGas = async () => {
    if (!smartWallet || transactions.length === 0) return;

    try {
      setLoading(true);
      
      // Build batch operation
      const calls = transactions.map(tx => ({
        to: tx.to,
        value: ethers.utils.parseEther(tx.value || '0'),
        data: tx.data || '0x',
      }));

      // Estimate gas for batch
      const estimation = await estimateUserOpGas(calls);
      
      // Mock per-transaction estimation
      const perTx: Record<string, string> = {};
      transactions.forEach((tx, index) => {
        perTx[tx.id] = ethers.utils.formatUnits(
          ethers.BigNumber.from(estimation).div(transactions.length),
          'gwei'
        );
      });

      setGasEstimation({
        total: ethers.utils.formatUnits(estimation, 'gwei'),
        perTransaction: perTx,
        token: 'USDC', // Assuming USDC for gas payment
      });
    } catch (error) {
      console.error('Failed to estimate gas:', error);
      alert('Failed to estimate gas for batch');
    } finally {
      setLoading(false);
    }
  };

  const executeBatch = async () => {
    if (!smartWallet || transactions.length === 0) return;

    try {
      setExecuting(true);
      setPreviewDialogOpen(false);
      
      // Initialize status
      const status: Record<string, 'pending' | 'success' | 'failed'> = {};
      transactions.forEach(tx => {
        status[tx.id] = 'pending';
      });
      setExecutionStatus(status);

      // Build batch operation
      const calls = transactions.map(tx => ({
        to: tx.to,
        value: ethers.utils.parseEther(tx.value || '0'),
        data: tx.data || '0x',
      }));

      // Execute batch
      const userOpHash = await sendUserOperation(calls);
      
      // Simulate sequential execution status updates
      for (let i = 0; i < transactions.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        setExecutionStatus(prev => ({
          ...prev,
          [transactions[i].id]: 'success',
        }));
      }

      alert(`Batch executed successfully! Hash: ${userOpHash}`);
      
      // Clear transactions after successful execution
      setTransactions([]);
      setGasEstimation(null);
    } catch (error) {
      console.error('Failed to execute batch:', error);
      
      // Mark remaining as failed
      setExecutionStatus(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(id => {
          if (updated[id] === 'pending') {
            updated[id] = 'failed';
          }
        });
        return updated;
      });
      
      alert('Failed to execute batch transaction');
    } finally {
      setExecuting(false);
    }
  };

  const exportBatch = () => {
    const data = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      wallet: smartWallet?.address,
      transactions: transactions.map(tx => ({
        type: tx.type,
        to: tx.to,
        value: tx.value,
        data: tx.data,
        description: tx.description,
        token: tx.token,
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-transactions-${Date.now()}.json`;
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
        if (data.version === '1.0' && Array.isArray(data.transactions)) {
          const imported = data.transactions.map((tx: any) => ({
            ...tx,
            id: Date.now().toString() + Math.random(),
          }));
          setTransactions(imported);
          alert(`Imported ${imported.length} transactions`);
        }
      } catch (error) {
        alert('Failed to import batch file');
      }
    };
    reader.readAsText(file);
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getTransactionIcon = (type: string) => {
    const txType = TRANSACTION_TYPES.find(t => t.value === type);
    return txType?.icon || <SendIcon />;
  };

  const getExecutionStatusIcon = (status: 'pending' | 'success' | 'failed') => {
    switch (status) {
      case 'success':
        return <CheckIcon color="success" />;
      case 'failed':
        return <WarningIcon color="error" />;
      default:
        return <CircularProgress size={16} />;
    }
  };

  if (!smartWallet) {
    return (
      <Alert severity="warning">
        Please connect your smart wallet to use the batch transaction builder.
      </Alert>
    );
  }

  return (
    <Box>
      <Grid container spacing={3}>
        {/* Overview Card */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <ScheduleIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Batch Overview</Typography>
              </Box>
              
              <Box mb={2}>
                <Typography variant="body2" color="text.secondary">
                  Transactions
                </Typography>
                <Typography variant="h4">{transactions.length}</Typography>
              </Box>
              
              <Box mb={2}>
                <Typography variant="body2" color="text.secondary">
                  Total Value
                </Typography>
                <Typography variant="h6">
                  {transactions.reduce((sum, tx) => {
                    return sum + parseFloat(tx.value || '0');
                  }, 0).toFixed(4)} ETH
                </Typography>
              </Box>
              
              {gasEstimation && (
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Estimated Gas
                  </Typography>
                  <Typography variant="h6">
                    {gasEstimation.total} Gwei
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Paid in {gasEstimation.token}
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Actions Card */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Batch Actions
              </Typography>
              
              <Box display="flex" gap={2} flexWrap="wrap" mb={2}>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setAddDialogOpen(true)}
                >
                  Add Transaction
                </Button>
                
                <Button
                  variant="outlined"
                  startIcon={<CalculateIcon />}
                  onClick={estimateGas}
                  disabled={transactions.length === 0 || loading}
                >
                  Estimate Gas
                </Button>
                
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<PlayIcon />}
                  onClick={() => setPreviewDialogOpen(true)}
                  disabled={transactions.length === 0}
                >
                  Execute Batch
                </Button>
                
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<ClearIcon />}
                  onClick={handleClearAll}
                  disabled={transactions.length === 0}
                >
                  Clear All
                </Button>
              </Box>

              <Box display="flex" gap={2}>
                <Button
                  variant="text"
                  size="small"
                  onClick={exportBatch}
                  disabled={transactions.length === 0}
                >
                  Export
                </Button>
                
                <Button
                  variant="text"
                  size="small"
                  component="label"
                >
                  Import
                  <input
                    type="file"
                    accept=".json"
                    hidden
                    onChange={importBatch}
                  />
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Transactions List */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Transaction Queue
              </Typography>
              
              {transactions.length === 0 ? (
                <Box textAlign="center" py={4}>
                  <Typography color="text.secondary">
                    No transactions in queue. Add transactions to build your batch.
                  </Typography>
                </Box>
              ) : (
                <List>
                  {transactions.map((tx, index) => (
                    <React.Fragment key={tx.id}>
                      <ListItem>
                        <Box display="flex" alignItems="center" width="100%">
                          <Box mr={2}>
                            <Chip
                              label={`#${index + 1}`}
                              size="small"
                              color="primary"
                            />
                          </Box>
                          
                          <Box mr={2}>
                            {getTransactionIcon(tx.type)}
                          </Box>
                          
                          <Box flex={1}>
                            <Typography variant="body1">
                              {tx.description || `${tx.type} to ${formatAddress(tx.to)}`}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              To: {formatAddress(tx.to)} | Value: {tx.value || '0'} ETH
                              {tx.token && ` | Token: ${SUPPORTED_TOKENS.find(t => t.address === tx.token)?.symbol}`}
                            </Typography>
                            {gasEstimation && (
                              <Typography variant="caption" color="primary">
                                Est. Gas: {gasEstimation.perTransaction[tx.id]} Gwei
                              </Typography>
                            )}
                          </Box>
                          
                          <Box display="flex" alignItems="center" gap={1}>
                            {executionStatus[tx.id] && (
                              <Box mr={1}>
                                {getExecutionStatusIcon(executionStatus[tx.id])}
                              </Box>
                            )}
                            
                            <Tooltip title="Duplicate">
                              <IconButton
                                size="small"
                                onClick={() => handleDuplicateTransaction(tx)}
                                disabled={executing}
                              >
                                <CopyIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            
                            <Tooltip title="Remove">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleRemoveTransaction(tx.id)}
                                disabled={executing}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </Box>
                      </ListItem>
                      {index < transactions.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Add Transaction Dialog */}
      <Dialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Transaction to Batch</DialogTitle>
        <DialogContent>
          <Box mt={2}>
            <FormControl fullWidth margin="normal">
              <InputLabel>Transaction Type</InputLabel>
              <Select
                value={txType}
                onChange={(e) => setTxType(e.target.value as any)}
                label="Transaction Type"
              >
                {TRANSACTION_TYPES.map(type => (
                  <MenuItem key={type.value} value={type.value}>
                    <Box display="flex" alignItems="center">
                      {type.icon}
                      <Box ml={1}>{type.label}</Box>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Recipient Address"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              fullWidth
              margin="normal"
              required
            />

            {txType === 'transfer' && (
              <>
                <FormControl fullWidth margin="normal">
                  <InputLabel>Token</InputLabel>
                  <Select
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    label="Token"
                  >
                    {SUPPORTED_TOKENS.map(t => (
                      <MenuItem key={t.address} value={t.address}>
                        {t.symbol}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  label="Amount"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  fullWidth
                  margin="normal"
                  type="number"
                  inputProps={{ step: '0.01' }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        {SUPPORTED_TOKENS.find(t => t.address === token)?.symbol}
                      </InputAdornment>
                    ),
                  }}
                />
              </>
            )}

            {txType === 'contract' && (
              <>
                <TextField
                  label="Function Name"
                  value={functionName}
                  onChange={(e) => setFunctionName(e.target.value)}
                  fullWidth
                  margin="normal"
                  placeholder="e.g., transfer, approve"
                />

                <TextField
                  label="Value (ETH)"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  fullWidth
                  margin="normal"
                  type="number"
                  inputProps={{ step: '0.01' }}
                />

                <TextField
                  label="Call Data (Hex)"
                  value={contractData}
                  onChange={(e) => setContractData(e.target.value)}
                  fullWidth
                  margin="normal"
                  multiline
                  rows={3}
                  placeholder="0x..."
                  helperText="Encoded function call data"
                />
              </>
            )}

            {txType === 'swap' && (
              <Alert severity="info" sx={{ mt: 2 }}>
                Swap functionality coming soon. For now, you can use contract calls to interact with DEX contracts.
              </Alert>
            )}

            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              margin="normal"
              multiline
              rows={2}
              placeholder="Optional description for this transaction"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAddTransaction}
            disabled={!to}
          >
            Add to Batch
          </Button>
        </DialogActions>
      </Dialog>

      {/* Preview & Execute Dialog */}
      <Dialog
        open={previewDialogOpen}
        onClose={() => setPreviewDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Review Batch Transaction</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Please review all transactions carefully before execution. This action cannot be undone.
          </Alert>

          <Box mb={2}>
            <Typography variant="subtitle1" gutterBottom>
              Batch Summary
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">
                  Total Transactions: {transactions.length}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">
                  Total Value: {transactions.reduce((sum, tx) => sum + parseFloat(tx.value || '0'), 0).toFixed(4)} ETH
                </Typography>
              </Grid>
              {gasEstimation && (
                <>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Estimated Gas: {gasEstimation.total} Gwei
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Gas Token: {gasEstimation.token}
                    </Typography>
                  </Grid>
                </>
              )}
            </Grid>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle1" gutterBottom>
            Transaction Details
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>To</TableCell>
                  <TableCell>Value</TableCell>
                  <TableCell>Description</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.map((tx, index) => (
                  <TableRow key={tx.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>
                      <Chip label={tx.type} size="small" />
                    </TableCell>
                    <TableCell>{formatAddress(tx.to)}</TableCell>
                    <TableCell>{tx.value || '0'} ETH</TableCell>
                    <TableCell>{tx.description || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewDialogOpen(false)}>Cancel</Button>
          {!gasEstimation ? (
            <Button
              variant="outlined"
              onClick={estimateGas}
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : 'Estimate Gas'}
            </Button>
          ) : (
            <Button
              variant="contained"
              color="success"
              onClick={executeBatch}
              disabled={executing}
            >
              {executing ? <CircularProgress size={24} /> : 'Execute Batch'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Execution Progress */}
      {executing && (
        <Dialog open={executing} maxWidth="sm" fullWidth>
          <DialogTitle>Executing Batch Transaction</DialogTitle>
          <DialogContent>
            <Box py={2}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Processing {transactions.length} transactions...
              </Typography>
              
              <List>
                {transactions.map((tx, index) => (
                  <ListItem key={tx.id}>
                    <ListItemText
                      primary={`Transaction ${index + 1}`}
                      secondary={tx.description || formatAddress(tx.to)}
                    />
                    <ListItemSecondaryAction>
                      {executionStatus[tx.id] && getExecutionStatusIcon(executionStatus[tx.id])}
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            </Box>
          </DialogContent>
        </Dialog>
      )}
    </Box>
  );
};