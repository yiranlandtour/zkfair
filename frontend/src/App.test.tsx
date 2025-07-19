import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// Mock wagmi
jest.mock('wagmi', () => ({
  WagmiConfig: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  createConfig: jest.fn(() => ({})),
  configureChains: jest.fn(() => ({
    chains: [],
    publicClient: {},
    webSocketPublicClient: {},
  })),
}));

// Mock wagmi/providers/public
jest.mock('wagmi/providers/public', () => ({
  publicProvider: jest.fn(() => ({})),
}));

// Mock RainbowKit
jest.mock('@rainbow-me/rainbowkit', () => ({
  RainbowKitProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  getDefaultWallets: jest.fn(() => ({ connectors: [] })),
  ConnectButton: () => <button>Connect Wallet</button>,
}));

// Mock components
jest.mock('./components/Header', () => ({
  Header: () => <header data-testid="header">Header</header>,
}));

jest.mock('./components/Dashboard', () => ({
  Dashboard: () => <div data-testid="dashboard">Dashboard</div>,
}));

jest.mock('./contexts/SmartWalletContext', () => ({
  SmartWalletProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
  });

  it('has proper layout structure', () => {
    const { container } = render(<App />);
    
    // Check for main container
    const mainContainer = container.querySelector('.min-h-screen.bg-gray-50');
    expect(mainContainer).toBeInTheDocument();
    
    // Check for main content area
    const mainContent = container.querySelector('main.container.mx-auto');
    expect(mainContent).toBeInTheDocument();
  });

  it('wraps components in required providers', () => {
    // This test verifies that the providers are instantiated
    // The actual provider functionality is tested in their respective test files
    const wagmiSpy = jest.spyOn(require('wagmi'), 'createConfig');
    const rainbowSpy = jest.spyOn(require('@rainbow-me/rainbowkit'), 'getDefaultWallets');
    
    render(<App />);
    
    expect(wagmiSpy).toHaveBeenCalled();
    expect(rainbowSpy).toHaveBeenCalled();
  });

  it('configures zkFair chain correctly', () => {
    const configureChainsSpy = jest.spyOn(require('wagmi'), 'configureChains');
    
    render(<App />);
    
    expect(configureChainsSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 67890,
          name: 'ZKFair L2',
          network: 'zkfair',
          nativeCurrency: {
            decimals: 18,
            name: 'ZKFair Gas',
            symbol: 'ZKG',
          },
        }),
      ]),
      expect.any(Array)
    );
  });
});