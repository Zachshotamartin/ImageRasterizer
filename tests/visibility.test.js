import test from 'node:test';
import assert from 'node:assert/strict';
import { isWithinRenderMargin } from '../src/visibility.js';

const rect=(left,top,width=200,height=100)=>({left,top,width,height,right:left+width,bottom:top+height});
test('initial visibility matches the viewport and its 80px render margin',()=>{
  assert.equal(isWithinRenderMargin(rect(20,20),1000,700),true);
  assert.equal(isWithinRenderMargin(rect(20,779),1000,700),true);
  assert.equal(isWithinRenderMargin(rect(20,781),1000,700),false);
  assert.equal(isWithinRenderMargin(rect(1081,20),1000,700),false);
  assert.equal(isWithinRenderMargin(rect(-281,20),1000,700),false);
  assert.equal(isWithinRenderMargin(rect(20,-181),1000,700),false);
});
test('initially hidden or collapsed surfaces do not start rendering',()=>{
  assert.equal(isWithinRenderMargin(rect(0,0,0,0),1000,700),false);
  assert.equal(isWithinRenderMargin(rect(0,0,200,0),1000,700),false);
  assert.equal(isWithinRenderMargin(rect(0,0,0,100),1000,700),false);
  assert.equal(isWithinRenderMargin(rect(20,5000),1000,700),false);
});
