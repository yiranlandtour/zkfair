import React from 'react';
import { render, screen } from '@testing-library/react';
import { Header } from '../Header';

// Mock RainbowKit ConnectButton
jest.mock('@rainbow-me/rainbowkit', () => ({
  ConnectButton: () => <button>Connect Wallet</button>,
}));

describe('Header', () => {
  it('renders the app title', () => {
    render(<Header />);
    expect(screen.getByText('ZKFair L2')).toBeInTheDocument();
  });

  it('renders the tagline', () => {
    render(<Header />);
    expect(
      screen.getByText('Polygon CDK + Celestia DA + Stablecoin Gas')
    ).toBeInTheDocument();
  });

  it('renders documentation link', () => {
    render(<Header />);
    const docsLink = screen.getByText('Docs');
    expect(docsLink).toBeInTheDocument();
    expect(docsLink).toHaveAttribute('href', 'https://docs.zkfair.io');
    expect(docsLink).toHaveAttribute('target', '_blank');
    expect(docsLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders faucet link', () => {
    render(<Header />);
    const faucetLink = screen.getByText('Faucet');
    expect(faucetLink).toBeInTheDocument();
    expect(faucetLink).toHaveAttribute('href', 'https://faucet.zkfair.io');
    expect(faucetLink).toHaveAttribute('target', '_blank');
    expect(faucetLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders connect wallet button', () => {
    render(<Header />);
    expect(screen.getByText('Connect Wallet')).toBeInTheDocument();
  });

  it('has proper styling classes', () => {
    const { container } = render(<Header />);
    const header = container.querySelector('header');
    expect(header).toHaveClass('bg-white', 'shadow-sm', 'border-b');
  });
});