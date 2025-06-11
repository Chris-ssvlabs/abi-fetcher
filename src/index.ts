import { fetchFullAbi } from './abiFetcher';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as dotenv from 'dotenv';

dotenv.config();

// Validate environment variables
if (!process.env.ETHERSCAN_API_KEY) {
  console.error('Error: ETHERSCAN_API_KEY is not set in .env file');
  process.exit(1);
}

const argv = yargs(hideBin(process.argv))
  .option('address', {
    alias: 'a',
    description: 'Main contract address',
    type: 'string',
    demandOption: true
  })
  .option('network', {
    alias: 'n',
    description: 'Network where the contract is deployed (e.g. mainnet, sepolia, etc)',
    type: 'string',
    demandOption: true
  })
  .option('getters', {
    alias: 'g',
    description: 'Comma-separated list of contract getter names',
    type: 'string',
    demandOption: true
  })
  .help()
  .alias('help', 'h')
  .parseSync();

// Extract and format getter names
const getterNames = argv.getters.split(',').map(name => name.trim());

// Execute the ABI fetching process
fetchFullAbi({
  mainContractAddress: argv.address,
  network: argv.network,
  getterNames
})
  .then(() => {
    console.log('✅ Full ABI successfully generated and saved to fullAbi.json');
  })
  .catch(error => {
    console.error('❌ Error fetching full ABI:', error.message);
    process.exit(1);
  });
