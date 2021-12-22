export interface InterfaceMember {
  name: string;
  type: string;
}

export interface InterfaceDef {
  name: string;
  exported: boolean;
  members: InterfaceMember[];
}

export interface Import {
  import: string;
  from: string;
}

export class SourceGenerator {
  headers: string[];
  imports: Import[];
  interfaces: InterfaceDef[];
  consts: string[];
  classes: string[];

  constructor() {
    this.headers = [];
    this.interfaces = [];
    this.classes = [];
    this.imports = [];
    this.consts = [];
  }

  addImport = (importDef: Import) => {
    this.imports.push(importDef);
  };

  addHeader = (line: string) => {
    this.headers.push(line);
  };

  addInterface = (intf: InterfaceDef) => {
    this.interfaces.push(intf);
  };

  addClass = (decl: string) => {
    this.classes.push(decl);
  };

  addConst = (decl: string) => {
    this.consts.push(decl);
  };

  private genInterfaceDecl = (intf: InterfaceDef) => {
    return `${intf.exported ? 'export ' : ''}interface ${intf.name} {
${intf.members
  .map((m) => {
    return `  ${m.name}: ${m.type};`;
  })
  .join('\n')}         
};`;
  };

  private genImport = (importDef: Import): string => {
    return `import ${importDef.import} from '${importDef.from}';`;
  };

  export = (): string => {
    let result = this.headers.join('\n');
    result += '\n' + this.imports.map(this.genImport).join('\n');
    result += '\n\n' + this.interfaces.map(this.genInterfaceDecl).join('\n\n');
    result += '\n\n' + this.consts.join('\n');
    result += '\n\n' + this.classes.join('\n');
    return result.trim();
  };
}
