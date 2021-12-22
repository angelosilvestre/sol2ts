import path from 'path';
import { Command } from 'commander';
import { generate } from '../generator';
import fs from 'fs/promises';

export const generateCommand = new Command()
  .name('generate')
  .description('Generate typescript classes')
  .argument('<filename>', 'contract file')
  .option(
    '-o, --output-dir <directory>',
    'directory to output generated files',
    ''
  )
  .action(async (filename: string, options: { outputDir: string }) => {
    const contractPath = path.join(process.cwd(), filename);
    const dir = options.outputDir || path.dirname(contractPath);
    const contracts = generate(contractPath);
    for (const contract of contracts) {
      const destPath = path.join(dir, `${contract.name}.ts`);
      const abiDestPath = path.join(dir, `${contract.name}Abi.ts`);
      const bytecodePath = path.join(dir, `${contract.name}ByteCode.ts`);
      await fs.writeFile(destPath, contract.tsSource, 'utf8');
      console.log(`generated ${destPath}`);
      await fs.writeFile(bytecodePath, contract.bytecode, 'utf8');
      console.log(`generated ${bytecodePath}`);
    }
  });
