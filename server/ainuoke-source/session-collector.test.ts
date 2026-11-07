import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {selectedConfig} from '../integration/selected-source-fixture.js';
import {validateCatalogDiagnostic} from './sync-diagnostics.js';

test('persistent Python protocol validates two order captures with one real SDK login',async()=>{
 const script=`
import sys
from unittest.mock import patch
sys.path.insert(0,'tests')
from selected_source_fixture import FakeSelectedTransport
from ainuoke_bridge.session_worker import main
with patch('ainuoke_bridge.selected_source_once.ProtectedTransport',return_value=FakeSelectedTransport()):
    sys.exit(main())
`;
 const inputs=['SYN-SALES-1','SYN-SALES-2'].map(c=>JSON.stringify({baseUrl:selectedConfig.baseUrl,username:selectedConfig.username,password:selectedConfig.password,mode:'catalog-contracts',contracts:[c]}));
 const child=spawnSync(process.platform==='win32'?'python':'python3',['-c',script],{cwd:resolve('tools/ainuoke-bridge'),input:inputs.join('\n')+'\n',encoding:'utf8',timeout:10000,windowsHide:true,env:{...process.env,PYTHONUTF8:'1'}});
 assert.equal(child.status,0,child.stderr);
 const values=child.stdout.trim().split('\n').map(v=>JSON.parse(v));assert.equal(values.length,2);
 const results=[];
 for(let i=0;i<values.length;i++)results.push(await validateCatalogDiagnostic(values[i],selectedConfig,{mode:'catalog-contracts',contracts:[`SYN-SALES-${i+1}`]},Date.now()));
 assert.deepEqual(results.map(v=>v.capture.metrics.logins),[1,0]);
 assert.deepEqual(results.map(v=>v.capture.result),['complete','complete']);
 assert.equal(child.stdout.includes(selectedConfig.password),false);
 assert.equal(child.stdout.includes('synthetic-token-value'),false);
});
