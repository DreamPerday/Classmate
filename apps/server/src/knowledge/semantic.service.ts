import type { ClassroomTask, KnowledgeEdge, KnowledgeNode, SemanticEvent, TranscriptSegment } from "@classmate/shared";
import { transaction } from "../shared/database.js";
import { eventBus } from "../shared/event-bus.js";
import { fingerprint, id, normalizeTerm } from "../shared/ids.js";
import { CourseRepository } from "../courses/course.repository.js";
import { TranscriptRepository } from "../classroom/transcript.repository.js";
import { getAiProvider } from "../ai/provider.js";
import { SemanticRepository } from "./semantic.repository.js";
import { resolveDeadline } from "./deadline.js";
import { JobRepository } from "../jobs/job.repository.js";

const comparable=(value:string)=>value.normalize("NFKC").replace(/\s+/g,"").replace(/[，。；：、,.!?！？]/g,"");
export class SemanticService {
  constructor(private readonly transcripts:TranscriptRepository,private readonly courses:CourseRepository,private readonly repository:SemanticRepository,private readonly jobs:JobRepository){}
  async processSession(sessionId:string):Promise<void>{
    const session=this.courses.findSession(sessionId);if(!session)return;const course=this.courses.find(session.courseId);if(!course)return;
    const segments=this.transcripts.unprocessedWindow(sessionId,12);if(!segments.length)return;
    const input=[`课程:${course.name}`,`日期:${session.startedAt??session.createdAt}`,...segments.map(s=>`[${s.id}] ${formatMs(s.startMs)}-${formatMs(s.endMs)}: ${s.text}`)].join("\n");
    const batch=await getAiProvider().extract(input);const byId=new Map(segments.map(s=>[s.id,s]));const conceptMap=new Map<string,KnowledgeNode>();
    transaction(()=>{
      if(batch.topic)this.repository.updateTopic(sessionId,batch.topic);
      for(const concept of batch.concepts){if(!concept.evidenceSegmentIds.some(x=>byId.has(x)))continue;const normalized=normalizeTerm(concept.name);if(!normalized)continue;const node=this.repository.upsertNode({id:id("node"),courseId:course.id,canonicalName:concept.name,kind:concept.kind,definition:concept.definition,importance:concept.importance,confidence:concept.confidence,evidenceCount:1},normalized);conceptMap.set(normalized,node);}
      const insertedEvents=new Map<string,SemanticEvent>();
      for(const item of batch.events){
        const evidence=item.evidence.flatMap(e=>{const seg=byId.get(e.segmentId);if(!seg||!quoteMatches(seg,e.quote))return[];return[{transcriptId:seg.id,startMs:seg.startMs,endMs:seg.endMs,quote:e.quote}]});if(!evidence.length)continue;
        const deadline=resolveDeadline(item.deadlineRaw,new Date(session.startedAt??session.createdAt));const event:SemanticEvent={id:id("evt"),sessionId,type:item.type,title:item.title,content:item.content,importance:item.importance,confidence:item.confidence,deadlineRaw:item.deadlineRaw,deadlineResolved:deadline.resolved,needsReview:deadline.needsReview||item.confidence<0.7,evidence,createdAt:new Date().toISOString()};
        if(!this.repository.insertEvent(event,fingerprint(item.type,normalizeTerm(item.title),evidence.map(e=>e.transcriptId).sort().join(","))))continue;insertedEvents.set(normalizeTerm(item.title),event);eventBus.publish({type:"semantic",payload:event});
        if(["TASK","HOMEWORK","EXAM","DEADLINE"].includes(event.type)){const task:ClassroomTask={id:id("task"),courseId:course.id,sessionId,title:event.title,detail:event.content,deadlineRaw:event.deadlineRaw,deadlineResolved:event.deadlineResolved,status:"open",importance:event.importance,confidence:event.confidence,needsReview:event.needsReview,evidenceEventId:event.id};this.repository.insertTask(task);eventBus.publish({type:"task",payload:task});}
      }
      for(const rel of batch.relations){const source=conceptMap.get(normalizeTerm(rel.source));const target=conceptMap.get(normalizeTerm(rel.target));if(!source||!target||source.id===target.id||!byId.has(rel.evidenceSegmentId))continue;const relatedEvent=[...insertedEvents.values()].find(e=>e.evidence.some(v=>v.transcriptId===rel.evidenceSegmentId));const edge:KnowledgeEdge={id:id("edge"),courseId:course.id,sourceId:source.id,targetId:target.id,relation:rel.relation,weight:rel.weight,evidenceEventId:relatedEvent?.id??null};this.repository.insertEdge(edge);}
    });
    this.jobs.enqueue("summarize_session",{sessionId},fingerprint("summary",sessionId,segments.map(s=>s.id).join(",")));
  }
}
function quoteMatches(segment:TranscriptSegment,quote:string):boolean{const source=comparable(segment.text),target=comparable(quote);return target.length>=2&&(source.includes(target)||target.includes(source));}
function formatMs(ms:number):string{const total=Math.floor(ms/1000);return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;}
