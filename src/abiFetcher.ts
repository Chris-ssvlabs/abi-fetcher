import * as fs from "fs/promises";
import axios from "axios";
import { createPublicClient, http, ContractFunctionExecutionError } from "viem";
import { type Chain, mainnet, sepolia, hoodi } from "viem/chains";

interface FetchFullAbiParams {
  mainContractAddress: string;
  network: string;
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
  hoodi,
};

type SupportedNetwork = keyof typeof chainMap;

// Get Etherscan API URL based on network
function getEtherscanApiUrl(network: SupportedNetwork): string {
  switch (network.toLowerCase()) {
    case "mainnet":
      return "https://api.etherscan.io/api";
    case "sepolia":
      return "https://api-sepolia.etherscan.io/api";
    case "hoodi":
      return "https://api-hoodi.etherscan.io/api";
    default:
      throw new Error(`Unsupported network: ${network}`);
  }
}

// Fetch contract ABI from Etherscan
async function fetchContractAbi(
  contractAddress: string,
  network: SupportedNetwork,
): Promise<AbiItem[]> {
  const apiUrl = getEtherscanApiUrl(network);
  const apiKey = process.env.ETHERSCAN_API_KEY;

  console.log(`Fetching ABI for contract: ${contractAddress} on ${network}`);

  try {
    const response = await axios.get<EtherscanResponse>(apiUrl, {
      params: {
        module: "contract",
        action: "getabi",
        address: contractAddress,
        apikey: apiKey,
      },
    });

    if (response.data.status !== "1") {
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
  return abi.filter((item) => item.type === "event");
}

// Save ABI to a JSON file
async function saveAbiToFile(abi: AbiItem[], filePath: string): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(abi, null, 2), "utf8");
  console.log(`ABI saved to ${filePath}`);
}

// Main function to fetch the full ABI
export async function fetchFullAbi({
  mainContractAddress,
  network,
}: FetchFullAbiParams): Promise<void> {
  // Step 1: Fetch base contract ABI
  const baseAbi = await fetchContractAbi(mainContractAddress, network);
  await saveAbiToFile(baseAbi, "./baseAbi.json");

  // Step 2: Instantiate base contract client
  const selectedChain = chainMap[network.toLowerCase()];
  if (!selectedChain) {
    throw new Error(
      `Unsupported chain: ${network}. Available chains: ${Object.keys(chainMap).join(", ")}`,
    );
  }

  const publicClient = createPublicClient({
    chain: selectedChain,
    transport: http(),
  });

  // Step 3: Check if getModuleAddress function exists in the base ABI
  const getModuleAddressFnExists = baseAbi.some(
    (item) =>
      item.type === "function" &&
      item.name === "getModuleAddress" &&
      item.stateMutability === "view" &&
      item.inputs?.length === 1,
  );

  if (!getModuleAddressFnExists) {
    throw new Error(
      "getModuleAddress function not found in the base contract ABI",
    );
  }

  // Step 4: Fetch submodule ABIs by calling getModuleAddress with consecutive integers
  const allEvents: AbiItem[] = [];
  let moduleIndex = 0;
  let continueLoop = true;

  console.log("Starting to fetch module addresses using getModuleAddress...");

  while (continueLoop) {
    try {
      // Call getModuleAddress with the current index
      const submoduleAddress = (await publicClient.readContract({
        address: mainContractAddress as `0x${string}`,
        abi: baseAbi,
        functionName: "getModuleAddress",
        args: [BigInt(moduleIndex)],
      })) as `0x${string}`;

      console.log(`Found module at index ${moduleIndex}: ${submoduleAddress}`);

      if (submoduleAddress !== "0x0000000000000000000000000000000000000000") {
        // Fetch the submodule ABI
        const submoduleAbi = await fetchContractAbi(submoduleAddress, network);
        await saveAbiToFile(submoduleAbi, `./module_${moduleIndex}.json`);

        // Step 5: Extract events from submodule ABI
        const events = extractEvents(submoduleAbi);
        allEvents.push(...events);
      } else {
        console.log(
          `Found submodule address is 0x0000...0000, skipping. { moduleIndex: ${moduleIndex}}`,
        );
      }

      console.log(`Processed submodule at index: ${moduleIndex}`);
      moduleIndex++;
    } catch (error) {
      if (error instanceof ContractFunctionExecutionError) {
        console.log(
          `No more modules found after index ${moduleIndex - 1}, stopping.`,
        );
        continueLoop = false;
      } else {
        console.error(
          `Error processing module at index ${moduleIndex}:`,
          error,
        );
        continueLoop = false;
      }
    }
  }

  if (moduleIndex === 0) {
    console.warn("No modules were found using getModuleAddress");
  } else {
    console.log(`Successfully processed ${moduleIndex} modules.`);
  }

  // Step 6: Merge base ABI with extracted events
  // Filter out duplicate events based on name and inputs
  const uniqueEvents = allEvents.filter((event, index, self) => {
    return (
      index ===
      self.findIndex(
        (e) =>
          e.name === event.name &&
          JSON.stringify(e.inputs) === JSON.stringify(event.inputs),
      )
    );
  });

  // Merge base ABI with unique events
  const fullAbi = [...baseAbi];

  // Add events that don't already exist in the base ABI
  for (const event of uniqueEvents) {
    const exists = baseAbi.some(
      (item) =>
        item.type === "event" &&
        item.name === event.name &&
        JSON.stringify(item.inputs) === JSON.stringify(event.inputs),
    );

    if (!exists) {
      fullAbi.push(event);
    }
  }

  await saveAbiToFile(fullAbi, "./fullAbi.json");
}
