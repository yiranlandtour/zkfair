# Frontend Testing Guide

## Overview

The ZKFair L2 frontend uses React Testing Library and Jest for comprehensive component and integration testing.

## Test Structure

```
src/
├── components/
│   ├── __tests__/
│   │   ├── Header.test.tsx
│   │   ├── BalanceCard.test.tsx
│   │   ├── TransferModal.test.tsx
│   │   ├── TransactionHistory.test.tsx
│   │   └── Dashboard.test.tsx
│   └── ...
├── contexts/
│   ├── __tests__/
│   │   └── SmartWalletContext.test.tsx
│   └── ...
├── App.test.tsx
├── setupTests.ts
└── test-utils.tsx
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run tests in CI mode
npm run test:ci
```

## Writing Tests

### Component Tests

```typescript
import { render, screen } from '@testing-library/react';
import { MyComponent } from '../MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
});
```

### Testing with Context

```typescript
import { render, screen } from '../test-utils'; // Uses custom render with providers

describe('ComponentWithContext', () => {
  it('accesses context values', () => {
    render(<ComponentWithContext />);
    // Component has access to all providers
  });
});
```

### Testing User Interactions

```typescript
import userEvent from '@testing-library/user-event';

it('handles user input', async () => {
  render(<InputComponent />);
  
  const input = screen.getByRole('textbox');
  await userEvent.type(input, 'test value');
  
  expect(input).toHaveValue('test value');
});
```

## Mocking

### Mocking Modules

```typescript
jest.mock('@rainbow-me/rainbowkit', () => ({
  ConnectButton: () => <button>Connect Wallet</button>,
}));
```

### Mocking Hooks

```typescript
jest.mock('wagmi');
const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;

beforeEach(() => {
  mockUseAccount.mockReturnValue({
    address: '0x123...',
    isConnected: true,
  } as any);
});
```

## Coverage Requirements

- Branches: 80%
- Functions: 80%
- Lines: 80%
- Statements: 80%

## Common Test Patterns

### Testing Loading States

```typescript
it('shows loading spinner', () => {
  const { container } = render(<LoadingComponent />);
  expect(container.querySelector('.animate-spin')).toBeInTheDocument();
});
```

### Testing Async Operations

```typescript
it('loads data', async () => {
  render(<AsyncComponent />);
  
  await waitFor(() => {
    expect(screen.getByText('Loaded Data')).toBeInTheDocument();
  });
});
```

### Testing Error States

```typescript
it('handles errors gracefully', async () => {
  mockFetch.mockRejectedValue(new Error('Network error'));
  
  render(<ErrorComponent />);
  
  await waitFor(() => {
    expect(screen.getByText('Error occurred')).toBeInTheDocument();
  });
});
```

## Test Utilities

The `test-utils.tsx` file provides:
- Custom render function with all providers
- Mock data generators
- Common test helpers

```typescript
import { render, mockAddress, mockTransaction } from './test-utils';

const address = mockAddress('abcd'); // 0xabcd00000...
const tx = mockTransaction({ value: '1000' });
```

## Debugging Tests

```bash
# Run a specific test file
npm test Header.test.tsx

# Run tests matching a pattern
npm test -- --testNamePattern="renders correctly"

# Debug in VS Code
# Add breakpoint and use Jest Runner extension
```

## Best Practices

1. **Test behavior, not implementation**: Focus on what users see and do
2. **Use semantic queries**: Prefer `getByRole`, `getByLabelText` over `getByTestId`
3. **Avoid testing implementation details**: Don't test state variables directly
4. **Mock external dependencies**: Keep tests isolated and fast
5. **Write descriptive test names**: Use "should" or behavior descriptions
6. **Group related tests**: Use `describe` blocks for organization
7. **Keep tests DRY**: Extract common setup to beforeEach or helper functions
8. **Test edge cases**: Empty states, errors, loading, boundaries

## CI Integration

Tests run automatically on:
- Pull requests
- Commits to main/develop branches
- Pre-commit hooks (optional)

Failed tests block merges and deployments.