import assert from 'node:assert/strict';
import test from 'node:test';
import {materialReadFeedback,materialReadTime} from '../features/ainuoke-material-progress/material-read-feedback.ts';
test('material read errors distinguish access, network and unavailable service without guessing source readiness',()=>{
 const http=n=>new Error(`物料来源未接通或没有权限（HTTP ${n}）`);
 assert.match(materialReadFeedback(http(401)),/登录已过期/u);assert.match(materialReadFeedback(http(403)),/没有物料查看权限/u);
 assert.match(materialReadFeedback(http(503)),/来源是否就绪尚未核实/u);assert.match(materialReadFeedback(new TypeError('private endpoint token')),/网络连接失败/u);
 assert.match(materialReadFeedback(http(404)),/HTTP 404/u);assert.match(materialReadFeedback(new Error('物料响应关联无效')),/当前订单不符/u);
 assert.match(materialReadFeedback(new Error('invalid_order_uuid')),/订单标识无效/u);
 for(const error of [new Error('private server trace'),null,{},new SyntaxError('private payload')]){const message=materialReadFeedback(error);assert.match(message,/原因尚未核实/u);assert.doesNotMatch(message,/private|token|trace|payload|Browser/u);}
});
test('material source time uses Shanghai across UTC date boundary and never replaces missing or invalid facts',()=>{
 const value='2026-11-22T20:05:06.000Z';assert.match(materialReadTime(value),/2026\/11\/23 04:05:06/u);assert.equal(value,'2026-11-22T20:05:06.000Z');assert.equal(materialReadTime(null),'—');assert.equal(materialReadTime(undefined),'—');assert.equal(materialReadTime('not-a-date'),'来源时间无效，待核实');
});
