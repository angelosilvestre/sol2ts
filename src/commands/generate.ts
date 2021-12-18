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
    const contractName = path.parse(contractPath).name;
    const dir = options.outputDir || path.dirname(contractPath);
    const contract = generate(contractName, contractPath);
    const destPath = path.join(dir, `${contractName}.ts`);
    const abiDestPath = path.join(dir, `${contractName}Abi.ts`);
    await fs.writeFile(destPath, contract.tsSource);
    console.log(`generated ${destPath}`);
    await fs.writeFile(abiDestPath, contract.abi);
    console.log(`generated ${abiDestPath}`);
  });
