import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOrderCommandMode,orderCommandControlError} from '../sales-orders/command-control.js';
import {loadServerConfig} from '../config.js';
import {HttpError} from '../http/errors.js';

test('order command process policy is explicit, strict and cannot hide invalid configuration',()=>{
 const environment:NodeJS.ProcessEnv={NODE_ENV:'test',DATABASE_URL:'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic'};
 assert.equal(parseOrderCommandMode(undefined),'enabled');assert.equal(parseOrderCommandMode('frozen'),'frozen');
 assert.equal(loadServerConfig(environment).orderCommandMode,'enabled');
 assert.equal(loadServerConfig({...environment,ZHIXU_ORDER_COMMAND_MODE:'frozen'}).orderCommandMode,'frozen');
 for(const value of ['', 'true', 'false', 'FROZEN', ' enabled', 'synthetic-secret-value']){
  assert.throws(()=>loadServerConfig({...environment,ZHIXU_ORDER_COMMAND_MODE:value}),error=>error instanceof Error&&!error.message.includes('synthetic-secret-value'));
 }
});
test('only exact SQL control errors map to a sanitized service pause response',()=>{
 for(const message of ['order_commands_frozen','order_command_control_unavailable']){
  const result=orderCommandControlError({code:'55000',message});assert.ok(result instanceof HttpError);assert.equal(result.status,503);assert.equal(result.code,message);
 }
 for(const error of [new Error('unrelated'),{code:'23514',message:'order_commands_frozen'},{code:'55000',message:'unrelated'},null])assert.equal(orderCommandControlError(error),error);
});
