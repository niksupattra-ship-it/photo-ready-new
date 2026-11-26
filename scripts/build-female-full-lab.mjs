import {writeFile} from 'node:fs/promises';
import {femaleFullLabPrompt} from '../female-full-lab-prompt.js';
await writeFile(new URL('../public/female-full-lab-prompt.txt',import.meta.url),femaleFullLabPrompt());
