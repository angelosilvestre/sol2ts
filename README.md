# Sol2ts

## This is a work in progress!!

Sol2ts is a cli to generate a typescript wrapper for interacting with solidity smart contracts

## Usage

```bash
npm install -g ts-node
ts-node src/index <contract>
```

## Options

| option           | description              | type   | default                         |
| ---------------- | ------------------------ | ------ | ------------------------------- |
| --output-dir, -o | Destination for ts files | string | same directory of the .sol file |

## Example

### Contract source

```solidity
// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.10;

contract Inbox{
    string public message;

    constructor (string memory initialMessage){
        message = initialMessage;
    }

    function setMessage(string memory newMessage) public {
        message = newMessage;
    }
}
```

### Deploying the contract

```typescript
import Inbox from './contracts/Inbox';
import bytecode from './contracts/InboxByteCode';
import Web3 from 'web3';
const web3 = new Web3(<provider>);

const deploy = async () => {
  const accounts = await web3.eth.getAccounts();
  const deploymentAccount = accounts[0];
  console.log(`Attempting to deploy using account ${deploymentAccount}`);
  const inbox = new Inbox(web3, { bytecode });
  const contract = await inbox.deploy({
    from: deploymentAccount,
    gas: 1_000_000,
  });
  const address = contract.options.address;
  console.log(`Contract deployed to ${address}`);
  provider.engine.stop();
};
deploy();
```

### Interacting with the contract

```typescript
import Inbox from './contracts/Inbox';
import Web3 from 'web3';
const web3 = new Web3(<provider>);

const changeMessage = async () => {
  const accounts = await web3.eth.getAccounts();
  const address = ''; // contract address
  const inbox = new Inbox(web3, { address });
  await inbox.setMessage('My new Message', {
    from: accounts[0],
    gas: 1_000_000,
  });
  provider.engine.stop();
};
changeMessage();
```
