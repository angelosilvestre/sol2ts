#!/usr/bin/env node

import { generateCommand } from './commands/generate';

const program = generateCommand;

program.parse(process.argv);
