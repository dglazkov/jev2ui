import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { choice } from "@typesafe-ai/sdk";
import { validateAnswers } from "../server/ia/decisions.js";
import { askJev } from "../server/models.js";
const id = process.argv.find((a) => a.startsWith("--suite="))?.slice(8);
if (!id || !/^[\w-]+$/.test(id)) throw new Error("Pass --suite=<id>");
const reportPath = resolve(".cache/ia-suites", id, "report.json"), suite = JSON.parse(await readFile(reportPath, "utf8"));
const variant = process.argv.find((a) => a.startsWith("--variant="))?.slice(10) ?? Object.keys(suite.variants).at(-1)!;
if (!suite.variants[variant]) throw new Error("Unknown variant");
const context = "Evaluate a prompt-only IA plan. No UI was rendered. Judge the actual proposed map against the user's original requested task and directly implied surrounding app. A graph being closed does not imply semantic correctness. A focused instrument can be small, but a product's settings or checkout screen is not the entire app. Optional features are not required. Do not assume generic role labels imply capabilities beyond the local actions and explicit paths shown. You are not told the implementation or its prior critique.";
const questions = {
  task: choice({ context, question: "Does this proposed first screen and its reachable continuation support the originally requested task?" }, { works: "The task's necessary interaction, selection or commitment and outcome are represented.", missing: "An interaction, necessary subject, step or completion is missing.", wrong: "The screen's responsibility or activity is wrong for this request.", unknown: "The description is insufficient to establish task support." }),
  surrounding: choice({ context, question: "Does the map represent a plausible surrounding app for this starting screen?" }, { works: "The relevant surrounding app is represented; a legitimately focused tool may stay small.", missing: "This is an app subpage but the primary surrounding work is absent.", unknown: "Insufficient evidence to establish the app boundary." }),
  domain: choice({ context, question: "Are the included responsibilities and actions appropriate to this domain?" }, { works: "They plausibly belong to this app and serve distinct scopes.", unrelated: "The plan imports unrelated product assumptions or task stages.", unknown: "Insufficient evidence to establish role appropriateness." }),
  identity: choice({ context, question: "Does the first-screen task keep one destination identity across entry paths?" }, { works: "No planned destination duplicates the first screen's task for the same subject and scope.", duplicate: "Another destination repeats that same task and scope.", unknown: "The roles or subjects are too vague to establish identity." }),
};
let cursor = 0, saving = Promise.resolve();
const save = () => { const json=JSON.stringify(suite,null,2); saving=saving.then(async()=>{await writeFile(`${reportPath}.tmp`,json);await rename(`${reportPath}.tmp`,reportPath)});return saving; };
await Promise.all(Array.from({ length: 3 }, async () => {
  while(cursor<suite.rows.length){const row=suite.rows[cursor++],record=row[variant];if(!record?.runId||record.status==='failed')continue;if(record.audit)continue;
    const file=resolve('.cache/journeys',`${record.runId}.json`),run=JSON.parse(await readFile(file,'utf8'));
    const state={prompt:row.prompt, first_screen_plan:record.seed.first, proposed_map:run.revisions.at(-1).map};
    const result=await askJev(state,questions,run.endpoint);
    validateAnswers(result.answers, questions);
    record.audit={rubric:'same-task-and-scope-v1',checks:Object.fromEntries(Object.entries(result.answers).map(([key,a])=>[key,{choice:a.choice,p:a.probabilities[a.choice],probabilities:a.probabilities}])),passed:Object.values(result.answers).every((a:any)=>a.choice==='works'),ms:result.ms,inputTokens:result.inputTokens};
    const now=new Date().toISOString();
    run.events.push({sequence:run.events.length+1,at:now,stage:'Independent suite audit · same rubric for every variant',kind:'request',data:{state,questions}},{sequence:run.events.length+2,at:now,stage:'Independent suite audit · same rubric for every variant',kind:'answer',data:result});run.audit=record.audit;run.updated=now;
    await writeFile(`${file}.tmp`,JSON.stringify(run,null,2));await rename(`${file}.tmp`,file);await save();
    console.log(`${variant} ${row.index+1}: ${Object.entries(record.audit.checks).map(([k,a]:any)=>`${k}=${a.choice}`).join(' ')}`);
  }
}));
suite.variants[variant].audit={rubric:'same-task-and-scope-v1',total:suite.rows.filter((r:any)=>r[variant]?.audit).length,passed:suite.rows.filter((r:any)=>r[variant]?.audit?.passed).length,checks:Object.fromEntries(Object.keys(questions).map(key=>[key,suite.rows.filter((r:any)=>r[variant]?.audit?.checks[key].choice==='works').length]))};
await save();console.log(JSON.stringify(suite.variants[variant].audit,null,2));
