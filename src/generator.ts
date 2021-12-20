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
  name: string;
  tsSource: string;
  abi: string;
  bytecode: string;
}

interface Argument {
  name: string;
  type: string;
}

const indentation = '  ';

const indent = (level: number): string => {
  return indentation.repeat(level);
};

const generateAbi = (abi: Abi): string => {
  return `export default ${JSON.stringify(abi)};`;
};

const generateByteCode = (bytecode: string): string => {
  return `export default '${bytecode}';`;
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
  private hasDeployMethod = false;
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

  generateDefaultDeploy = () => {
    return `${indent(
      1
    )}deploy = async (options: SendOptions): Promise<Contract> => {
${indent(2)}this.contract = await new this.web3.eth.Contract(this.abi)
${indent(3)}.deploy({ data: this.bytecode })
${indent(3)}.send(options);
${indent(2)}return this.contract;
${indent(1)}};`;
  };

  private generateDefaultInterfaces = () => {
    this.sourceGenerator.addInterface({
      name: 'ContractInfo',
      members: [
        {
          name: 'abi',
          type: 'any',
        },
        {
          name: 'bytecode?',
          type: 'any',
        },
        {
          name: 'address?',
          type: 'string',
        },
      ],
    });
  };

  generateDeploy = (member: AbiItem): string => {
    let args = member.inputs.map(this.generateFunctionArg);
    let argsStr = this.generateArgsStr(args);
    return `deploy = async (${argsStr}options: SendOptions): Promise<Contract> => {
${indent(2)}this.contract = await new this.web3.eth.Contract(this.abi)
${indent(3)}.deploy({ data: this.bytecode })
${indent(3)}.send(options);
${indent(2)}return this.contract;
${indent(1)}};`;
  };

  generateFunctionArg = (arg: FunctionParameter): Argument => {
    let name = arg.name;
    if (name[0] == '_') {
      name = name.slice(1);
    }
    const type = this.mapType(arg.type);

    if (name.length === 0) {
      name = this.genArgName();
    }
    return { name, type };
  };

  mapType = (origin: string, param?: FunctionParameter): string => {
    switch (origin) {
      case 'bool':
        return 'boolean';
      case 'bytes':
        return 'string';
      case 'uint8':
      case 'uint64':
      case 'uint256':
        return 'BigInt';
      case 'uint256[]':
        return `BigInt[]`;
      case 'string':
        return 'string';
      case 'address':
        return 'string';
      case 'address[]':
        return 'string[]';
      case 'tuple':
        if (!param) {
          throw new Error('Tuple info not found');
        }
        if (!param.components) {
          throw new Error('Tuple without components definition');
        }
        return this.findOrGenerateFunctionReturnInterface(
          param.internalType,
          param.components
        );
      default:
        throw `type ${origin} unkown`;
    }
  };

  mapOutput = (output: FunctionParameter): string => {
    return this.mapType(output.type, output);
  };

  generateSingleValueViewFunctionCall = (
    member: AbiItem,
    returnType: string,
    args: Argument[]
  ): string => {
    let result = `const result = await this.contract?.methods.${
      member.name
    }(${args.map((e) => e.name).join(', ')}).call(options);`;
    if (returnType === 'BigInt') {
      result += `\n${indent(2)}return BigInt(result);`;
    } else {
      result += `\n${indent(2)}return result;`;
    }
    return result;
  };

  generateMultiValueViewFunctionCall = (
    member: AbiItem,
    returnType: string,
    args: Argument[]
  ): string => {
    let intf = this.returnInterfaces.find((e) => e.name === returnType)!;
    let arrIndex = 0;
    return `const resultArr : any[] = await this.contract?.methods.${
      member.name
    }(${args.map((e) => e.name).join(', ')}).call(options);
${indent(2)}let result = {
${intf.members
  .map((e) => `${indent(3)}${e.name} : resultArr[${arrIndex++}],`)
  .join('\n')}
${indent(2)}}       
${indent(2)}return result;`;
  };

  generateViewFunctionCall = (
    member: AbiItem,
    returnType: string,
    args: Argument[]
  ): string => {
    if (member.outputs.length <= 1) {
      return this.generateSingleValueViewFunctionCall(member, returnType, args);
    } else {
      return this.generateMultiValueViewFunctionCall(member, returnType, args);
    }
  };

  generateSendFunctionCall = (
    member: AbiItem,
    returnType: string,
    args: Argument[]
  ): string => {
    return `return this.contract?.methods.${member.name}(${args
      .map((e) => e.name)
      .join(', ')}).send(options);`;
  };

  generateContractFunctionCall = (
    member: AbiItem,
    returnType: string,
    args: Argument[]
  ): string => {
    if (member.stateMutability === 'view') {
      return this.generateViewFunctionCall(member, returnType, args);
    } else {
      return this.generateSendFunctionCall(member, returnType, args);
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
        this.hasDeployMethod = true;
        break;
    }
    return `${indentation}${memberDecl}`;
  };

  generateArgsStr = (args: Argument[]): string => {
    let argsStr = args
      .map((e) => {
        return `${e.name}: ${e.type}`;
      })
      .join(', ');
    if (args.length > 0) {
      argsStr += ', ';
    }
    return argsStr;
  };

  generateFunction = (member: AbiItem): string => {
    this.argCount = 0;
    let args = member.inputs.map(this.generateFunctionArg);
    let returnType = this.generateFunctionReturnType(
      member.name,
      member.outputs
    );
    let contractCall = this.generateContractFunctionCall(
      member,
      returnType,
      args
    );
    let argsStr = this.generateArgsStr(args);
    return `${member.name} = async (${argsStr}options?: ${
      member.stateMutability === 'view' ? 'CallOptions' : 'TransactionConfig'
    }): Promise<${returnType}> => {
${indent(2)}this.checkInitialized();
${indent(2)}${contractCall}
${indent(1)}};`;
  };

  findOrGenerateFunctionReturnInterface = (
    typeName: string,
    components: FunctionParameter[]
  ): string => {
    // removes 'struct' keyword
    let declaredName = typeName.substring(7).replace('.', '_');
    let intf: InterfaceDef | undefined = this.returnInterfaces.find(
      (e) => e.name === declaredName
    );
    if (intf) {
      return intf.name;
    }
    intf = {
      name: declaredName,
      members: components.map((e) => {
        return {
          name: e.name,
          type: this.mapOutput(e),
        };
      }),
    };
    this.returnInterfaces.push(intf);
    this.sourceGenerator.addInterface(intf);
    return intf.name;
  };

  findOrDeclareInterface = (
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
          type: this.mapOutput(e),
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
      valueType = this.mapOutput(outputs[0]);
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
${indent(1)}private bytecode: any | undefined;

${indent(1)}constructor(web3: Web3, contractInfo: ContractInfo) {
${indent(2)}this.web3 = web3;
${indent(2)}this.abi = contractInfo.abi;
${indent(2)}this.address = contractInfo.address;
${indent(2)}this.bytecode = contractInfo.bytecode;
${indent(1)}}

${indent(1)}private checkInitialized = () => {
${indent(2)}if (!this.contract) {
${indent(3)}if (!this.abi || !this.address) {
${indent(4)}throw new Error('Abi and Address are required');
${indent(3)}}  
${indent(3)}this.contract = new this.web3.eth.Contract(this.abi, this.address);
${indent(2)}}
${indent(1)}};

${indent(1)}balance = async (): Promise<BigInt> => {
${indent(2)}this.checkInitialized();
${indent(
  2
)}let result = await this.web3.eth.getBalance(this.contract?.options.address!);
${indent(2)}return BigInt(result);
${indent(1)}};

${abi.map(this.generateMember).join('\n\n')}
`;
    return result;
  };

  private generateMainClass = (name: string, abi: Abi) => {
    this.sourceGenerator.addClass(`export default class ${name}Contract {
${this.generateMembers(abi)}
${!this.hasDeployMethod ? this.generateDefaultDeploy() : ''}
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

  generate = (sourceFile: string) => {
    const contracts = compile(sourceFile);
    let result: GenerationResult[] = [];
    for (const contract of contracts) {
      this.sourceGenerator = new SourceGenerator();
      this.returnInterfaces = [];
      this.hasDeployMethod = false;
      const source = this.generateSource(contract.name, contract.abi);
      const abi = generateAbi(contract.abi);
      const bytecode = generateByteCode(contract.evm.bytecode.object);
      result.push({
        name: contract.name,
        bytecode: bytecode,
        abi: abi,
        tsSource: source,
      });
    }
    return result;
  };
}

export const generate = (sourceFile: string): GenerationResult[] => {
  const contractGenerator = new ContractGenerator();
  return contractGenerator.generate(sourceFile);
};
