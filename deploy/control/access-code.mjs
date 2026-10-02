import fs from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
if(process.argv.includes('--reset')) {
  await fs.writeFile('/control/operator-code',randomBytes(32).toString('hex'),{mode:0o600});
  await fs.rm('/control/operator-session-hash',{force:true});
  process.stdout.write('Access reset. Restart the installer to activate the new one-use code.\n');
} else {
  const code=(await fs.readFile('/control/operator-code','utf8')).trim();
  if(!code)process.stdout.write('This code has already been used. Your paired browser keeps access. For a new browser, reset local operator access and restart the installer.\n');
  else process.stdout.write(code+'\n');
}
