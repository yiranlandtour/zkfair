import { Bundler } from './bundler';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  entryPointAddress: process.env.ENTRY_POINT_ADDRESS || '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  beneficiary: process.env.BUNDLER_BENEFICIARY || '0x0000000000000000000000000000000000000000',
  rpcUrl: process.env.L2_RPC_URL || 'http://localhost:8545',
  port: parseInt(process.env.BUNDLER_PORT || '3000'),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  maxBundleSize: parseInt(process.env.MAX_BUNDLE_SIZE || '10'),
  bundleInterval: parseInt(process.env.BUNDLE_INTERVAL || '2000'),
  privateKey: process.env.BUNDLER_PRIVATE_KEY || ''
};

async function main() {
  const bundler = new Bundler(config);
  
  await bundler.start();
  
  console.log('ZKFair Bundler started successfully');
  console.log(`Entry Point: ${config.entryPointAddress}`);
  console.log(`RPC URL: ${config.rpcUrl}`);
  console.log(`Port: ${config.port}`);
  
  process.on('SIGINT', async () => {
    console.log('Shutting down bundler...');
    await bundler.stop();
    process.exit(0);
  });
}

main().catch(error => {
  console.error('Failed to start bundler:', error);
  process.exit(1);
});