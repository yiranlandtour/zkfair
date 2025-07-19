import React from 'react';
import { render, screen } from '@testing-library/react';
import { BalanceCard } from '../BalanceCard';
import { parseUnits } from 'ethers';

describe('BalanceCard', () => {
  const defaultProps = {
    title: 'USDC Balance',
    balance: parseUnits('100.5', 6),
    symbol: 'USDC',
    decimals: 6,
  };

  it('renders the title', () => {
    render(<BalanceCard {...defaultProps} />);
    expect(screen.getByText('USDC Balance')).toBeInTheDocument();
  });

  it('renders the symbol', () => {
    render(<BalanceCard {...defaultProps} />);
    expect(screen.getByText('USDC')).toBeInTheDocument();
  });

  it('formats balance correctly with 6 decimals', () => {
    render(<BalanceCard {...defaultProps} />);
    expect(screen.getByText('100.5000')).toBeInTheDocument();
  });

  it('formats balance correctly with 18 decimals', () => {
    const props = {
      title: 'ETH Balance',
      balance: parseUnits('1.23456789', 18),
      symbol: 'ETH',
      decimals: 18,
    };
    render(<BalanceCard {...props} />);
    expect(screen.getByText('1.2346')).toBeInTheDocument();
  });

  it('handles zero balance', () => {
    const props = {
      ...defaultProps,
      balance: BigInt(0),
    };
    render(<BalanceCard {...props} />);
    expect(screen.getByText('0.0000')).toBeInTheDocument();
  });

  it('handles very small balances', () => {
    const props = {
      ...defaultProps,
      balance: parseUnits('0.0001', 6),
    };
    render(<BalanceCard {...props} />);
    expect(screen.getByText('0.0001')).toBeInTheDocument();
  });

  it('handles very large balances', () => {
    const props = {
      ...defaultProps,
      balance: parseUnits('1000000', 6),
    };
    render(<BalanceCard {...props} />);
    expect(screen.getByText('1000000.0000')).toBeInTheDocument();
  });

  it('has proper styling classes', () => {
    const { container } = render(<BalanceCard {...defaultProps} />);
    const card = container.firstChild;
    expect(card).toHaveClass('bg-white', 'rounded-lg', 'shadow-md', 'p-6');
  });
});