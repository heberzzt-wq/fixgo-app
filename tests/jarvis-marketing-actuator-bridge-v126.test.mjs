import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveMarketingMissionProductionScope } from "../gestia-core/jarvis/jarvis.multitool.pack.js";

test("production intent promotes a planned reel to reel.create",()=>{const r=resolveMarketingMissionProductionScope({productionRequested:true,productionArtifacts:[]},{requiredToolNames:["web.research","marketing.plan","reel.plan"]});assert.equal(r.productionRequested,true);assert.deepEqual(r.productionArtifacts.map(x=>x.toolName),["reel.create"]);});
test("planning-only remains planning-only",()=>{const r=resolveMarketingMissionProductionScope({productionRequested:false,productionArtifacts:[]},{requiredToolNames:["web.research","marketing.plan","reel.plan"]});assert.equal(r.productionRequested,false);assert.deepEqual(r.productionArtifacts,[]);});
