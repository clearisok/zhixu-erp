import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join, basename } from 'node:path';
import assert from 'node:assert/strict';

/** Only synthetic fixtures in a new owned/Git-ignored directory. */
export function paymentPrivateFixture() {
  const root=resolve('outputs'),directory=join(root,'isolated-private-'+randomUUID());
  mkdirSync(root,{recursive:true});
  if(process.platform==='win32')execFileSync('pwsh',['-NoProfile','-NonInteractive','-File',resolve('scripts/isolated-private-directory.ps1'),
    '-Directory',directory,'-Create'],{stdio:'ignore',windowsHide:true,timeout:15000});
  else mkdirSync(directory,{recursive:false,mode:0o700});
  return {directory,write(name:string,text:string|Buffer){
    assert.equal(basename(name),name);const path=join(directory,name);writeFileSync(path,text,{mode:0o600,flag:'wx'});
    return {path,sha256:createHash('sha256').update(text).digest('hex')};
  },close(){
    assert.equal(dirname(directory),root);assert.match(basename(directory),/^isolated-private-[a-f0-9-]{36}$/u);
    rmSync(directory,{recursive:true,force:true});
  }};
}
