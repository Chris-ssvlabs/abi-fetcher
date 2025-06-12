# ABI Fetcher

A TypeScript tool to fetch the full ABI of multimodule contracts, including events from all submodules. Supports EIP-1967 Transparent Proxy pattern.

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd abi-fetcher

# Install dependencies
pnpm install

# Build the project
pnpm build
```

## Configuration

Create a `.env` file in the root directory with your Etherscan API key:

```
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_API_KEY
```

You can copy the `.env.example` file as a starting point.

## Usage

```bash
pnpm start -- --address <proxy-contract-address> --network <network>
```

Or with shortened options:

```bash
pnpm start -- -a <proxy-contract-address> -n <network>
```

### Arguments

- `--address` or `-a`: Proxy contract address (following EIP-1967 Transparent Proxy pattern)
- `--network` or `-n`: Network where the contract is deployed (e.g., mainnet, sepolia, hoodi)

### Example

```bash
pnpm start -- --address 0x1234567890123456789012345678901234567890 --network mainnet
```

## How It Works

1. Gets the implementation contract address by calling `_implementation()` on the proxy contract
2. Fetches the implementation contract ABI
3. Calls the `getModuleAddress(uint256)` function on the proxy contract (using the implementation ABI)
4. Continues calling with consecutive integers starting from 0 until it receives an error or a zero address
5. Extracts events from all module ABIs and merges them with the implementation ABI

## Output

The script generates the following files:

- `baseAbi.json`: The ABI of the implementation contract
- `module_<index>.json`: The ABI of each submodule contract (index starts from 0)
- `fullAbi.json`: The merged ABI containing the implementation contract's ABI and all events from submodules

## Development

For development, you can use the `dev` script:

```bash
pnpm dev -- -a <proxy-contract-address> -n <network>
```
