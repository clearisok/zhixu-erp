import { constants, openSync, closeSync, lstatSync, fstatSync, readSync, realpathSync, type Stats } from 'node:fs';
import { isAbsolute, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { SourceError } from './contract.js';
import { assertPrivateOutput } from './live-preflight.js';

const fail = (): never => { throw new SourceError('payment_operator_private_file_invalid'); };
const normalized = (path: string) => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
/** Validates the opened file, size, ownership/ACL and path identity on both sides
 * of the bounded read. Existing credentials are never chmod'ed or rewritten. */
export function readPaymentPrivateFile(path: string, limit: number, options: { expectedSha256?: string; ignoredReport?: boolean } = {}) {
  let fd: number | undefined;
  try {
    if (!isAbsolute(path) || !Number.isSafeInteger(limit) || limit < 1 || limit > 128*1024*1024
      || options.expectedSha256 !== undefined && !/^[a-f0-9]{64}$/u.test(options.expectedSha256)) fail();
    if (options.ignoredReport) assertPrivateOutput(dirname(path));
    const windowsAcl = () => {
      if (process.platform === 'win32') execFileSync('pwsh', ['-NoProfile','-NonInteractive','-File',
        resolve('scripts/payment-private-file-check.ps1'),'-Path',path], {windowsHide:true,stdio:'ignore',timeout:15000});
    };
    windowsAcl();
    const before = lstatSync(path);
    const safe = (stat: Stats) => stat.isFile() && stat.nlink === 1 && stat.size <= limit
      && (process.platform === 'win32' || stat.uid === process.getuid?.() && (stat.mode & 0o077) === 0);
    if (!safe(before) || before.isSymbolicLink() || normalized(realpathSync.native(path)) !== normalized(path)) fail();
    fd = openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const opened = fstatSync(fd);
    if (!safe(opened) || opened.ino!==before.ino || opened.dev!==before.dev || opened.size!==before.size) fail();
    const bytes=Buffer.alloc(opened.size+1);let length=0;
    while(length<bytes.length){const read=readSync(fd,bytes,length,bytes.length-length,null);if(!read)break;length+=read;}
    const after=fstatSync(fd), current=lstatSync(path);windowsAcl();
    if(length!==opened.size || !safe(after) || !safe(current) || current.isSymbolicLink()
      || [after,current].some(s=>s.ino!==opened.ino||s.dev!==opened.dev||s.size!==opened.size||s.mtimeMs!==opened.mtimeMs)
      || normalized(realpathSync.native(path))!==normalized(path)) fail();
    const content=bytes.subarray(0,length);
    if(options.expectedSha256!==undefined && createHash('sha256').update(content).digest('hex')!==options.expectedSha256)fail();
    return new TextDecoder('utf8',{fatal:true}).decode(content);
  } catch { return fail(); } finally { if(fd!==undefined)closeSync(fd); }
}
export function readPaymentPrivateJson(path: string, expectedSha256: string, limit: number) {
  try { return JSON.parse(readPaymentPrivateFile(path,limit,{expectedSha256,ignoredReport:true})) as unknown; }
  catch { return fail(); }
}
export function readPaymentCredential(path: string, expectedUsername: string) {
  const text=readPaymentPrivateFile(path,8192).replace(/^\uFEFF/u,'');
  const match=/^账号[:：]([^\r\n]+)\r?\n密码[:：]([^\r\n]+)(?:\r?\n)?$/u.exec(text);
  if(!match || match[0]!==text || match[1].trim()!==expectedUsername || !match[2] || /[\u0000-\u001f\u007f]/u.test(match[2]))return fail();
  return match[2];
}
