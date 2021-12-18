import path from 'path';
import {
  compile,
  Abi,
  AbiItem,
  AbiItemType,
  FunctionParameter,
} from './compiler';

export interface GeneratorOptions {
  sourceFile: string;
}

export interface GenerationResult {
  tsSource: string;
  abi: string;
}

const indentation = '  ';

const mapType = (origin: string): string => {
  switch (origin) {
    case 'bool':
      return 'boolean';
    case 'bytes':
      return 'string';
    case 'uint8':
    case 'uint64':
    case 'uint256':
      return 'string';
    case 'uint256[]':
      return `string[]`;
    case 'string':
      return 'string';
    case 'address':
      return 'string';
    case 'address[]':
      return 'string[]';
    default:
      throw `type ${origin} unkown`;
  }
};

const mapOutput = (output: FunctionParameter): string => {
  return mapType(output.type);
};

const generateFunctionOutput = (outputs: FunctionParameter[]): string => {
  if (!outputs) {
    return `Promise<void>`;
  }
  let valueType = '';
  if (outputs.length === 1) {
    valueType = mapOutput(outputs[0]);
  } else if (outputs.length === 0) {
    valueType = 'void';
  } else {
    valueType = `[${outputs.map(mapOutput).join(', ')}]`;
  }
  return `Promise<${valueType}>`;
};

let argCount = 0;

const indent = (level: number): string => {
  return indentation.repeat(level);
};

const genArgName = () => {
  return `arg${argCount++}`;
};

const generateFunctionArg = (arg: FunctionParameter): string => {
  let name = arg.name;
  if (name[0] == '_') {
    name = name.slice(1);
  }
  const type = mapType(arg.type);

  if (name.length === 0) {
    name = genArgName();
  }
  return `${name}: ${type}`;
};

const generateContractFunctionCall = (member: AbiItem): string => {
  if (member.stateMutability === 'view') {
    return `return this.contract?.methods.${member.name}().call(options);`;
  } else {
    return `return this.contract?.methods.${member.name}().send(options);`;
  }
};

const generateFunction = (member: AbiItem): string => {
  let args = member.inputs.map(generateFunctionArg).join(', ');
  if (args.length > 0) {
    args += ', ';
  }
  return `${member.name} = (${args}options?: ${
    member.stateMutability === 'view' ? 'CallOptions' : 'TransactionConfig'
  }): ${generateFunctionOutput(member.outputs)} => {
${indent(2)}this.checkInitialized();
${indent(2)}${generateContractFunctionCall(member)}    
${indent(1)}};`;
};

const generateDeploy = (member: AbiItem): string => {
  let args = member.inputs.map(generateFunctionArg).join(', ');
  if (args.length > 0) {
    args += ', ';
  }
  args = `abi: any, bytecode: any, ${args}`;
  return `deploy = async (${args}options: SendOptions): Promise<Contract> => {
${indent(2)}this.contract = await new this.web3.eth.Contract(abi)
${indent(4)}.deploy({ data: bytecode })
${indent(4)}.send(options);
${indent(2)}return this.contract;
${indent(1)}};`;
};

const generateMember = (member: AbiItem): string => {
  let memberDecl = '';
  switch (member.type) {
    case 'function':
      memberDecl = generateFunction(member);
      break;
    //case "event":
    //  return buildEventMember(member);
    case 'constructor':
      memberDecl = generateDeploy(member);
      break;
    //case "fallback":
    //  return buildFallbackMember(member);
  }
  return `${indentation}${memberDecl}`;
};

const generateMembers = (abi: Abi): string => {
  const result = `${indent(1)}private web3: Web3;
${indent(1)}private contract: Contract | null = null;
${indent(1)}private abi: any | null = null;
${indent(1)}private address: string | undefined;

${indent(1)}constructor(web3: Web3, contractInfo?: RemoteContract) {
${indent(2)}this.web3 = web3;
${indent(2)}if(contractInfo) {
${indent(3)}  this.abi = contractInfo.abi;
${indent(3)}  this.address = contractInfo.address;
${indent(2)}}
${indent(1)}}

${indent(1)}private checkInitialized = () => {
${indent(2)}if (!this.contract) {
${indent(3)}this.contract = new this.web3.eth.Contract(this.abi, this.address);
${indent(2)}}
${indent(1)}};
${abi.map(generateMember).join('\n')}
`;
  return result;
};

const generateSource = (name: string, abi: Abi): string => {
  return `import Web3 from 'web3';
import { Contract, SendOptions, CallOptions } from 'web3-eth-contract';
import { TransactionConfig } from 'web3-core';

interface RemoteContract {
  address: string;
  abi: any;  
}

export default class ${name}Contract {
${generateMembers(abi)}
}
`;
};

const generateAbi = (abi: Abi): string => {
  return `export default ${JSON.stringify(abi)};`;
};

export const generate = (
  contractName: string,
  sourceFile: string
): GenerationResult => {
  argCount = 0;
  const contract = compile(sourceFile);
  const source = generateSource(contractName, contract.abi);
  const abi = generateAbi(contract.abi);
  return {
    abi: abi,
    tsSource: source,
  };
};
