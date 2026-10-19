import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import type {CollectorConfig} from '../ainuoke-source/collector.js';

export const selectedConfig:CollectorConfig={sourceKey:'synthetic-selected-once',baseUrl:'https://example.invalid',
  username:'synthetic',password:'synthetic-secret-value',operatorUsername:'synthetic.selected-once'};
export const selectedContracts=['SYN-SALES-1','SYN-SALES-2'];

/** Exercises the real SDK, common collector and worker stdout with a synthetic
 * in-memory HTTP transport. No host connections, credential files or DB access.
 */
export function selectedWorkerFixture(mode:'selected-bindings'|'selected-materials',mutation='') : unknown {
  const script=`
import sys
from unittest.mock import patch
sys.path.insert(0, 'tests')
from selected_source_fixture import FakeSelectedTransport, mutate_rows
from ainuoke_bridge.server_source import main
def change(report, page, payload):
    ${mutation||'pass'}
with patch('ainuoke_bridge.selected_source_once.ProtectedTransport', return_value=FakeSelectedTransport(change)):
    sys.exit(main())
`;
  const {sourceKey:ignoredSource,operatorUsername:ignoredActor,...input}=selectedConfig;
  void ignoredSource;void ignoredActor;
  const child=spawnSync(process.platform==='win32'?'python':'python3',['-c',script],{
    cwd:resolve('tools/ainuoke-bridge'),windowsHide:true,encoding:'utf8',timeout:10000,maxBuffer:32*1024*1024,
    input:JSON.stringify({...input,mode,contracts:selectedContracts}),
    env:{...process.env,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'}});
  assert.ok(child.status===0||child.status===1,child.error?.message??child.stderr);
  return JSON.parse(child.stdout);
}
