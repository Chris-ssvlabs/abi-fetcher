import * as fs from 'fs/promises';
import axios from 'axios';
import { createPublicClient, http } from 'viem';
import { type Chain, mainnet, sepolia, hoodi } from 'viem/chains';

interface FetchFullAbiParams {
  mainContractAddress: string;
  network: string;
  getterNames: string[];
}

interface EtherscanResponse {
  status: string;
  message: string;
  result: string;
}

type AbiItem = {
  type: string;
  name?: string;
  inputs?: any[];
  outputs?: any[];
  stateMutability?: string;
  anonymous?: boolean;
};

// Map network names to Viem chain objects
const chainMap: Record<string, Chain> = {
  mainnet,
  sepolia,
  hoodi
};

type SupportedNetwork = keyof typeof chainMap;

// Get Etherscan API URL based on network
function getEtherscanApiUrl(network: SupportedNetwork): string {
  switch (network.toLowerCase()) {
    case 'mainnet':
      return 'https://api.etherscan.io/api';
    case 'sepolia':
      return 'https://api-sepolia.etherscan.io/api';
    case 'hoodi':
      return 'https://api-hoodi.etherscan.io/api';
    default:
      throw new Error(`Unsupported network: ${network}`);
  }
}

// Fetch contract ABI from Etherscan
async function fetchContractAbi(contractAddress: string, network: SupportedNetwork): Promise<AbiItem[]> {
  const apiUrl = getEtherscanApiUrl(network);
  const apiKey = process.env.ETHERSCAN_API_KEY;

  console.log(`Fetching ABI for contract: ${contractAddress} on ${network}`);

  try {
    const response = await axios.get<EtherscanResponse>(apiUrl, {
      params: {
        module: 'contract',
        action: 'getabi',
        address: contractAddress,
        apikey: apiKey
      }
    });

    if (response.data.status !== '1') {
      throw new Error(`Etherscan API error: ${response.data.message}`);
    }

    return JSON.parse(response.data.result);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Failed to fetch ABI: ${error.message}`);
    }
    throw error;
  }
}

// Extract event definitions from an ABI
function extractEvents(abi: AbiItem[]): AbiItem[] {
  return abi.filter(item => item.type === 'event');
}

// Save ABI to a JSON file
async function saveAbiToFile(abi: AbiItem[], filePath: string): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(abi, null, 2), 'utf8');
  console.log(`ABI saved to ${filePath}`);
}

// Main function to fetch the full ABI
export async function fetchFullAbi({ mainContractAddress, network, getterNames }: FetchFullAbiParams): Promise<void> {
  // Step 1: Fetch base contract ABI
  const baseAbi = await fetchContractAbi(mainContractAddress, network);
  await saveAbiToFile(baseAbi, './baseAbi.json');

  // Step 2: Instantiate base contract client
  const selectedChain = chainMap[network.toLowerCase()];
  if (!selectedChain) {
    throw new Error(`Unsupported chain: ${network}. Available chains: ${Object.keys(chainMap).join(', ')}`);
  }

  const publicClient = createPublicClient({
    chain: selectedChain,
    transport: http()
  });

  // Step 3: Ensure each getter exists in the base ABI
  const validGetters = getterNames.filter(getterName => {
    const exists = baseAbi.some(item => 
      item.type === 'function' && 
      item.name === getterName && 
      item.stateMutability === 'view' && 
      item.outputs && 
      item.outputs.length > 0
    );

    if (!exists) {
      console.warn(`Warning: Getter function '${getterName}' not found in the base contract ABI`);
    }

    return exists;
  });

  if (validGetters.length === 0) {
    throw new Error('No valid getter functions found');
  }

  // Step 4: Fetch submodule ABIs
  const allEvents: AbiItem[] = [];

  for (const getter of validGetters) {
    try {
      // Call the getter to get the submodule address
      const submoduleAddress = await publicClient.readContract({
        address: mainContractAddress as `0x${string}`,
        abi: baseAbi,
        functionName: getter
      }) as string;

      // Fetch the submodule ABI
      const submoduleAbi = await fetchContractAbi(submoduleAddress, network);
      await saveAbiToFile(submoduleAbi, `./${getter}.json`);

      // Step 5: Extract events from submodule ABI
      const events = extractEvents(submoduleAbi);
      allEvents.push(...events);

      console.log(`Processed submodule from getter: ${getter}`);
    } catch (error) {
      console.error(`Error processing getter ${getter}:`, error);
    }
  }

  // Step 6: Merge base ABI with extracted events
  // Filter out duplicate events based on name and inputs
  const uniqueEvents = allEvents.filter((event, index, self) => {
    return index === self.findIndex(e => 
      e.name === event.name && 
      JSON.stringify(e.inputs) === JSON.stringify(event.inputs)
    );
  });

  // Merge base ABI with unique events
  const fullAbi = [...baseAbi];

  // Add events that don't already exist in the base ABI
  for (const event of uniqueEvents) {
    const exists = baseAbi.some(item => 
      item.type === 'event' && 
      item.name === event.name && 
      JSON.stringify(item.inputs) === JSON.stringify(event.inputs)
    );

    if (!exists) {
      fullAbi.push(event);
    }
  }

  await saveAbiToFile(fullAbi, './fullAbi.json');
}
