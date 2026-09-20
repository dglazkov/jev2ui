import { test } from "node:test";
import assert from "node:assert/strict";
import { constructNeutral, neutralJourneys, neutralQuestions, reviewNeutral, neutralCritiqueQuestions, ACTIVITIES } from "./neutral.js";
import { WHOLE_CANDIDATES } from "./roles.js";
import { validateMap, resolveAction, type AppMap, type Seed } from "./graph.js";
import type { Answers } from "./decisions.js";
import { PROMPTS } from "../../probe/custom.js";
const a=(choice:string)=>({choice,probabilities:{[choice]:.51,unknown:.49}});
function input(brief:string){
 const seed:Seed={brief,first:{title:brief,archetype:"planned",sections:[]},links:[{id:"primary",label:"Interact",kind:"in_place"},{id:"back",label:"Back",kind:"back"}]};
 const base:AppMap={home:"home",boundary:"Test",nodes:[{id:"first",label:brief,purpose:brief,actions:[{id:"primary",label:"Interact",kind:"in_place",target:null,sourceLink:"primary"},{id:"back",label:"Back",kind:"back",target:"home",sourceLink:"back"}]},{id:"home",label:"Home",purpose:"Entry",actions:[{id:"open_first",label:brief,kind:"navigate",target:"first",sourceLink:null}]}]};return{seed,base};
}
function design(anchor:string,activity:string,pattern:string):Answers{return{anchor:a(anchor),activity:a(activity),pattern:a(pattern),...Object.fromEntries(WHOLE_CANDIDATES.map(c=>[`use_${c.id}`,a(c.id===anchor?"first":"omit")])),...Object.fromEntries(Object.keys(ACTIVITIES).map(k=>[`first_activity_${k}`,a("omit")]))};}
test("corpus import is side-effect free and all 30 source prompts are available to the sweep",()=>{assert.equal(PROMPTS.length,30);assert.equal(new Set(PROMPTS.map(p=>p[0])).size,30);assert.ok(Object.keys(neutralQuestions()).includes('first_activity_commit'));});
test("a focused instrument can observe and operate on the same first screen without fake transactions",()=>{
 const {seed,base}=input("A practice timer"),answers=design('w_monitor','monitor','focused');answers.use_w_operate=a('first');answers.use_w_review=a('separate');answers.use_w_outcome=a('separate');answers.first_activity_run=a('include');
 const plan=constructNeutral(base,seed,answers,true);
 assert.equal(plan.aliases.w_operate,'first');assert.equal(plan.aliases.w_monitor,'first');assert.equal(plan.map.nodes.length,2);
 assert.ok(plan.map.nodes[0].actions.some(a=>a.label==='Start, pause or reset'));assert.deepEqual(validateMap(plan.map,seed),[]);
 assert.ok(!plan.map.nodes.some(n=>n.id==='w_review'||n.id==='w_outcome'));assert.equal(base.nodes[0].actions.length,2);
});
test("a draft task has entry, actual editing, review, commit and result, without duplicate first screens",()=>{
 const {seed,base}=input("Submit a registration"),answers=design('w_edit','commit','transact');
 const plan=constructNeutral(base,seed,answers,true);
 assert.deepEqual(validateMap(plan.map,seed),[]);assert.ok(!plan.map.nodes.some(n=>n.id==='w_edit'));
 assert.ok(plan.map.nodes[0].actions.some(a=>a.label==='Edit draft'));
 assert.deepEqual(neutralJourneys(plan)[0].path,['home','first','w_review','w_outcome']);
 const review=plan.map.nodes.find(n=>n.id==='w_review')!;
 assert.ok(review.actions.some(a=>a.target==='w_outcome'&&a.label==='Confirm and view result'));
 assert.ok(!review.actions.some(a=>a.kind==='complete'&&a.label==='Confirm and submit'));
});
test("an inbox opens a conversation; a historical record opens details, not playback",()=>{
 for(const [anchor,pattern,next] of [['w_collection','communicate','w_conversation'],['w_history','inspect','w_detail']]){
  const {seed,base}=input('Inspect records'),answers=design(anchor,'read',pattern);answers[`use_${next}`]=a('separate');
  const plan=constructNeutral(base,seed,answers,true);assert.deepEqual(validateMap(plan.map,seed),[]);
  assert.ok(plan.map.nodes[0].actions.some(a=>a.target===next));assert.ok(!plan.map.nodes.some(n=>['w_library','w_active'].includes(n.id)));
 }
});
test("unsupported role aliases do not invent extra screens and saved first mocks remain immutable",()=>{
 const {seed,base}=input('App preferences'),answers=design('w_preferences','configure','configure');answers.use_w_outcome=a('first');answers.use_w_detail=a('first');answers.use_w_collection=a('separate');answers.use_w_operate=a('separate');
 const plan=constructNeutral(base,seed,answers,false);
 assert.deepEqual(plan.map.nodes.find(n=>n.id==='first'),base.nodes[0]);assert.ok(!plan.map.nodes.some(n=>n.id==='w_detail'||n.id==='w_outcome'));assert.ok(plan.map.nodes.some(n=>n.id==='w_operate'));
 const home=plan.map.nodes.find(n=>n.id==='home')!;assert.equal(resolveAction(plan.map,'home',home.actions.find(a=>a.target==='first')!,{first:'original'}).mockId,'original');
});
test("the requested task cannot be silently pruned from critique even for a minimal map",()=>{
 const {seed,base}=input('A compass'),plan=constructNeutral(base,seed,design('w_monitor','monitor','focused'),true);
 const qs=neutralCritiqueQuestions(neutralJourneys(plan));assert.ok(qs.journey_requested);
 const answers=Object.fromEntries(Object.keys(qs).map(k=>[k,a('works')]));answers.journey_requested=a('unnecessary');
 const review=reviewNeutral(plan,answers,seed);assert.equal(review.prune.length,0);assert.ok(review.findings.some(f=>f.id==='journey:requested'));
});
