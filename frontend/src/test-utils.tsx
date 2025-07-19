import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { WagmiConfig } from 'wagmi';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { SmartWalletProvider } from './contexts/SmartWalletContext';

// Mock config for testing
const mockConfig = {
  autoConnect: false,
  connectors: [],
  publicClient: {},
  webSocketPublicClient: {},
} as any;

const mockChains = [] as any;

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  includeProviders?: boolean;
}

const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <WagmiConfig config={mockConfig}>
      <RainbowKitProvider chains={mockChains}>
        <SmartWalletProvider>{children}</SmartWalletProvider>
      </RainbowKitProvider>
    </WagmiConfig>
  );
};

const customRender = (
  ui: ReactElement,
  options?: CustomRenderOptions
) => {
  const { includeProviders = true, ...renderOptions } = options || {};

  if (includeProviders) {
    return render(ui, { wrapper: AllTheProviders, ...renderOptions });
  }

  return render(ui, renderOptions);
};

// Re-export everything
export * from '@testing-library/react';
export { customRender as render };

// Mock data generators
export const mockAddress = (seed = '1234567890') => 
  `0x${seed.padEnd(40, '0')}`;

export const mockTransaction = (overrides = {}) => ({
  userOpHash: '0x123',
  sender: mockAddress(),
  target: mockAddress('abcd'),
  value: '0',
  success: true,
  timestamp: Math.floor(Date.now() / 1000),
  actualGasCost: '21000000000000',
  transactionHash: mockAddress('9876'),
  ...overrides,
});

export const mockBalance = (value: string, decimals: number) => ({
  value: BigInt(value),
  decimals,
  formatted: (Number(value) / Math.pow(10, decimals)).toFixed(4),
});