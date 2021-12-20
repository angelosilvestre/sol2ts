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
  abi: Abi;
  evm: Evm;
}
export const compile = (filePath: string): CompiledContract => {  
  const source = fs.readFileSync(filePath, 'utf8');
  const input = {
    language: 'Solidity',
    sources: {
      firstContract: {
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
  if(!compiled.contracts){
    throw new Error(compiled.errors);
  }  
  let contract = Object.values(compiled.contracts.firstContract)[0] as any;
  return {
    abi: contract.abi,
    evm: contract.evm,
  };
};
