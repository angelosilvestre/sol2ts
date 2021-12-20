import path from 'path';
import {
  InterfaceDef,
  InterfaceMember,
  SourceGenerator,
} from './sourceGenerator';
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

const indent = (level: number): string => {
  return indentation.repeat(level);
};

const generateAbi = (abi: Abi): string => {
  return `export default ${JSON.stringify(abi)};`;
};

const equalMembers = (A: InterfaceMember[], B: InterfaceMember[]): boolean => {
  for (let member of A) {
    let otherMember = B.find((e) => e.name === member.name);
    if (!otherMember) {
      return false;
    }
    if (otherMember.type !== member.type) {
      return false;
    }
  }
  return true;
};

class ContractGenerator {
  private sourceGenerator: SourceGenerator;
  private argCount: number = 0;
  private returnInterfaces: InterfaceDef[] = [];
  constructor() {
    this.sourceGenerator = new SourceGenerator();
  }

  genArgName = () => {
    return `arg${this.argCount++}`;
  };

  private generateImports = () => {
    this.sourceGenerator.addImport({ import: 'Web3', from: 'web3' });
    this.sourceGenerator.addImport({
      import: '{ Contract, SendOptions, CallOptions }',
      from: 'web3-eth-contract',
    });
    this.sourceGenerator.addImport({
      import: '{ TransactionConfig }',
      from: 'web3-core',
    });
  };

  private generateDefaultInterfaces = () => {
    this.sourceGenerator.addInterface({
      name: 'RemoteContract',
      members: [
        {
          name: 'address',
          type: 'string',
        },
        {
          name: 'abi',
          type: 'any',
        },
      ],
    });
  };

  generateDeploy = (member: AbiItem): string => {
    let args = member.inputs.map(this.generateFunctionArg).join(', ');
    if (args.length > 0) {
      args += ', ';
    }
    args = `abi: any, bytecode: any, ${args}`;
    return `deploy = async (${args}options: SendOptions): Promise<Contract> => {
${indent(2)}this.contract = await new this.web3.eth.Contract(abi)
${indent(3)}.deploy({ data: bytecode })
${indent(3)}.send(options);
${indent(2)}return this.contract;
${indent(1)}};`;
  };

  generateFunctionArg = (arg: FunctionParameter): string => {
    let name = arg.name;
    if (name[0] == '_') {
      name = name.slice(1);
    }
    const type = mapType(arg.type);

    if (name.length === 0) {
      name = this.genArgName();
    }
    return `${name}: ${type}`;
  };

  generateContractFunctionCall = (
    member: AbiItem,
    returnType: string
  ): string => {
    if (member.stateMutability === 'view') {
      if (member.outputs.length <= 1) {
        return `return this.contract?.methods.${member.name}().call(options);`;
      } else {
        let intf = this.returnInterfaces.find((e) => e.name === returnType)!;
        let arrIndex = 0;
        const result = `const resultArr : any[] = await this.contract?.methods.${
          member.name
        }().call(options);
${indent(2)}let result = {
${intf.members
  .map((e) => `${indent(3)}${e.name} : resultArr[${arrIndex++}],`)
  .join('\n')}
${indent(2)}}       
${indent(2)}return result;`;
        return result;
      }
    } else {
      return `return this.contract?.methods.${member.name}().send(options);`;
    }
  };

  generateMember = (member: AbiItem): string => {
    let memberDecl = '';
    switch (member.type) {
      case 'function':
        memberDecl = this.generateFunction(member);
        break;
      case 'constructor':
        memberDecl = this.generateDeploy(member);
        break;
    }
    return `${indentation}${memberDecl}`;
  };

  generateFunction = (member: AbiItem): string => {
    this.argCount = 0;
    let args = member.inputs.map(this.generateFunctionArg).join(', ');
    if (args.length > 0) {
      args += ', ';
    }
    let returnType = this.generateFunctionReturnType(
      member.name,
      member.outputs
    );
    let asyncModifier = member.outputs.length > 1 ? 'async ' : '';
    return `${member.name} = ${asyncModifier}(${args}options?: ${
      member.stateMutability === 'view' ? 'CallOptions' : 'TransactionConfig'
    }): Promise<${returnType}> => {
${indent(2)}this.checkInitialized();
${indent(2)}${this.generateContractFunctionCall(member, returnType)}
${indent(1)}};`;
  };

  findOrGenerateFunctionReturnInterface = (
    functionName: string,
    outputs: FunctionParameter[]
  ): string => {
    let intf: InterfaceDef | undefined = this.returnInterfaces.find((e) => {
      e.members.length === outputs.length && equalMembers(e.members, outputs);
    });
    if (intf) {
      return intf.name;
    }
    intf = {
      name:
        functionName[0].toUpperCase() + functionName.substring(1) + 'Result',
      members: outputs.map((e) => {
        return {
          name: e.name,
          type: mapOutput(e),
        };
      }),
    };
    this.returnInterfaces.push(intf);
    this.sourceGenerator.addInterface(intf);
    return intf.name;
  };

  generateFunctionReturnType = (
    functionName: string,
    outputs: FunctionParameter[]
  ): string => {
    if (!outputs) {
      return 'void';
    }
    let valueType = '';
    if (outputs.length === 1) {
      valueType = mapOutput(outputs[0]);
    } else if (outputs.length === 0) {
      valueType = 'void';
    } else {
      valueType = this.findOrGenerateFunctionReturnInterface(
        functionName,
        outputs
      );
    }
    return valueType;
  };

  generateMembers = (abi: Abi): string => {
    const result = `${indent(1)}private web3: Web3;
${indent(1)}private contract: Contract | undefined;
${indent(1)}private abi: any | undefined;
${indent(1)}private address: string | undefined;

${indent(1)}constructor(web3: Web3, contractInfo?: RemoteContract) {
${indent(2)}this.web3 = web3;
${indent(2)}if (contractInfo) {
${indent(3)}this.abi = contractInfo.abi;
${indent(3)}this.address = contractInfo.address;
${indent(2)}}
${indent(1)}}

${indent(1)}private checkInitialized = () => {
${indent(2)}if (!this.contract) {
${indent(3)}if (!this.abi || !this.address) {
${indent(4)}throw new Error('Abi and Address are required');
${indent(3)}}  
${indent(3)}this.contract = new this.web3.eth.Contract(this.abi, this.address);
${indent(2)}}
${indent(1)}};

${indent(1)}balance = (): Promise<string> => {
${indent(2)}this.checkInitialized();
${indent(2)}return this.web3.eth.getBalance(this.contract?.options.address!);
${indent(1)}};

${abi.map(this.generateMember).join('\n\n')}
`;
    return result;
  };

  private generateMainClass = (name: string, abi: Abi) => {
    this.sourceGenerator.addClass(`export default class ${name}Contract {
${this.generateMembers(abi)}
}
`);
  };

  private generateHeader = () => {
    this.sourceGenerator.addHeader('// generated with sol2ts');
  };

  private generateSource = (name: string, abi: Abi): string => {
    this.generateHeader();
    this.generateImports();
    this.generateDefaultInterfaces();
    this.generateMainClass(name, abi);
    return this.sourceGenerator.export();
  };

  generate = (contractName: string, sourceFile: string) => {
    this.argCount = 0;
    this.returnInterfaces = [];
    const contract = compile(sourceFile);
    const source = this.generateSource(contractName, contract.abi);
    const abi = generateAbi(contract.abi);
    return {
      abi: abi,
      tsSource: source,
    };
  };
}

export const generate = (
  contractName: string,
  sourceFile: string
): GenerationResult => {
  const contractGenerator = new ContractGenerator();
  return contractGenerator.generate(contractName, sourceFile);
};
