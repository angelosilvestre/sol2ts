import path from 'path';
import fs from 'fs';
import solc from 'solc';

export interface Bytecode {
  object: string;
}

export interface Evm {
  bytecode: Bytecode;
}

export interface FunctionParameter {
  internalType: string;
  name: string;
  type: string;
  components?: FunctionParameter[];
}

export type StateMutability = 'view' | 'nonpayable' | 'payable';

export type AbiItemType = 'function' | 'constructor';

export interface AbiItem {
  name: string;
  inputs: FunctionParameter[];
  outputs: FunctionParameter[];
  stateMutability: StateMutability;
  type: AbiItemType;
}

export type Abi = AbiItem[];

export interface CompiledContract {
  name: string;
  abi: Abi;
  evm: Evm;
}
export const compile = (filePath: string): CompiledContract[] => {
  const source = fs.readFileSync(filePath, 'utf8');
  const input = {
    language: 'Solidity',
    sources: {
      main: {
        content: source,
      },
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['*'],
        },
      },
    },
  };
  const compiled = JSON.parse(solc.compile(JSON.stringify(input)));
  if (!compiled.contracts) {
    throw new Error(compiled.errors);
  }
  let result: CompiledContract[] = [];
  let compiledContracts = compiled.contracts.main;
  for (let key in compiledContracts) {
    let contract = compiledContracts[key];
    result.push({
      abi: contract.abi,
      evm: contract.evm,
      name: key,
    });
  }
  return result;
};
