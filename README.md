# ABI Fetcher

A TypeScript tool to fetch the full ABI of multimodule contracts, including events from all submodules.

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
pnpm start -- --address <contract-address> --network <network>
```

Or with shortened options:

```bash
pnpm start -- -a <contract-address> -n <network>
```

### Arguments

- `--address` or `-a`: Main contract address
- `--network` or `-n`: Network where the contract is deployed (e.g., mainnet, sepolia, hoodi)

### Example

```bash
pnpm start -- --address 0x1234567890123456789012345678901234567890 --network mainnet
```

## How It Works

The script fetches module addresses by calling the `getModuleAddress(uint256)` function on the main contract with consecutive integers starting from 0 until it receives an error or a zero address.

## Output

The script generates the following files:

- `baseAbi.json`: The ABI of the main contract
- `module_<index>.json`: The ABI of each submodule contract (index starts from 0)
- `fullAbi.json`: The merged ABI containing the main contract's ABI and all events from submodules

## Development

For development, you can use the `dev` script:

```bash
pnpm dev -- -a <contract-address> -n <network>
```
