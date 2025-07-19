import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

// Load test environment
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://zkfair:zkfair123@localhost:5432/zkfair_test?schema=public';

// Mock external services
jest.mock('../services/eventListener', () => ({
  EventListener: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Global test utilities
global.testPrisma = new PrismaClient();

// Cleanup after all tests
afterAll(async () => {
  await global.testPrisma.$disconnect();
});