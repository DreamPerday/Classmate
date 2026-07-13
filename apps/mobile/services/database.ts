import*as SQLite from"expo-sqlite";import type{Analysis,ClassroomEvent,ClassroomTask,KnowledgeNode,LearningReport,MobileDashboard,MobileSettings,ReportScope,Transcript}from"@/types/domain";
let database:Promise<SQLite.SQLiteDatabase>|null=null;const uid=(prefix:string)=>`${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
export async function getDb(){if(!database)database=SQLite.openDatabaseAsync("classmate-mobile.db");return database;}
export async function initializeDatabase(){const db=await getDb();await db.execAsync(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS courses(id TEXT PRIMARY KEY,name TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,course_id TEXT NOT NULL,title TEXT NOT NULL,day_index INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS transcripts(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,text TEXT NOT NULL,start_ms INTEGER NOT NULL,end_ms INTEGER NOT NULL,vector_json TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,transcript_id TEXT NOT NULL,type TEXT NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,importance INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS knowledge_nodes(id TEXT PRIMARY KEY,course_id TEXT NOT NULL,name TEXT NOT NULL,normalized_name TEXT NOT NULL,definition TEXT,importance INTEGER NOT NULL,UNIQUE(course_id,normalized_name));
CREATE TABLE IF NOT EXISTS knowledge_edges(id TEXT PRIMARY KEY,course_id TEXT NOT NULL,source_id TEXT NOT NULL,target_id TEXT NOT NULL,relation TEXT NOT NULL,transcript_id TEXT NOT NULL,UNIQUE(course_id,source_id,target_id,relation));
CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,transcript_id TEXT NOT NULL,title TEXT NOT NULL,detail TEXT NOT NULL,deadline_raw TEXT,deadline_resolved TEXT,status TEXT NOT NULL DEFAULT 'open',importance INTEGER NOT NULL DEFAULT 5,confidence REAL NOT NULL DEFAULT 0.7,needs_review INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,course_id TEXT NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,template TEXT NOT NULL DEFAULT 'practicum',start_date TEXT,end_date TEXT,evidence_count INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS session_summaries(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,content_md TEXT NOT NULL,evidence_ids TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);`);await ensureColumn(db,"reports","template","TEXT NOT NULL DEFAULT 'practicum'");await ensureColumn(db,"reports","start_date","TEXT");await ensureColumn(db,"reports","end_date","TEXT");await ensureColumn(db,"reports","evidence_count","INTEGER NOT NULL DEFAULT 0");await ensureColumn(db,"tasks","deadline_resolved","TEXT");await ensureColumn(db,"tasks","importance","INTEGER NOT NULL DEFAULT 5");await ensureColumn(db,"tasks","confidence","REAL NOT NULL DEFAULT 0.7");await ensureColumn(db,"tasks","needs_review","INTEGER NOT NULL DEFAULT 0");const existing=await db.getFirstAsync<{id:string}>("SELECT id FROM courses LIMIT 1");if(!existing){const now=new Date().toISOString(),courseId=uid("course"),sessionId=uid("session");await db.runAsync("INSERT INTO courses VALUES(?,?,?)",courseId,"我的课堂",now);await db.runAsync("INSERT INTO sessions VALUES(?,?,?,?,?)",sessionId,courseId,"第 1 天课堂",1,now);await db.runAsync("INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value","active_session_id",sessionId);}}
export async function getSettings():Promise<Omit<MobileSettings,"hasKey">>{const db=await getDb(),rows=await db.getAllAsync<{key:string;value:string}>("SELECT key,value FROM app_settings"),values=Object.fromEntries(rows.map(row=>[row.key,row.value]));return{baseUrl:values.baseUrl??"https://ztoken.zlux.top/v1",chatModel:values.chatModel??"gpt-5.5",embeddingModel:values.embeddingModel??"local:BAAI/bge-small-zh-v1.5",provider:(values.provider as"openai"|"mock")??"openai",apiFormat:(values.apiFormat as"openai-chat"|"claude")??"openai-chat"};}
export async function saveSettings(input:Omit<MobileSettings,"hasKey">){const db=await getDb();for(const[key,value]of Object.entries(input))await db.runAsync("INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",key,String(value));}
async function getActiveSession(db:SQLite.SQLiteDatabase){const active=await db.getFirstAsync<{value:string}>("SELECT value FROM app_settings WHERE key='active_session_id'");if(active){const session=await db.getFirstAsync<{id:string}>("SELECT id FROM sessions WHERE id=?",active.value);if(session)return session;}const course=await db.getFirstAsync<{id:string}>("SELECT id FROM courses ORDER BY created_at LIMIT 1");if(!course)throw new Error("没有课堂");const fallback=await db.getFirstAsync<{id:string}>("SELECT id FROM sessions WHERE course_id=? ORDER BY day_index DESC LIMIT 1",course.id);if(!fallback)throw new Error("没有课堂");return fallback;}
export async function getDashboard():Promise<MobileDashboard>{const db=await getDb();let course:any,session:any;const active=await db.getFirstAsync<{value:string}>("SELECT value FROM app_settings WHERE key='active_session_id'");if(active){session=await db.getFirstAsync<any>("SELECT s.id,s.title,s.day_index dayIndex,s.course_id courseId FROM sessions s WHERE s.id=?",active.value);if(session)course=await db.getFirstAsync<any>("SELECT id,name FROM courses WHERE id=?",session.courseId);}if(!course||!session){course=(await db.getFirstAsync<any>("SELECT id,name FROM courses ORDER BY created_at LIMIT 1"))!;session=(await db.getFirstAsync<any>("SELECT id,title,day_index dayIndex FROM sessions WHERE course_id=? ORDER BY day_index DESC LIMIT 1",course.id))!;}const courses=await db.getAllAsync<{id:string;name:string}>("SELECT id,name FROM courses ORDER BY created_at"),sessions=await db.getAllAsync<{id:string;title:string;dayIndex:number}>("SELECT id,title,day_index dayIndex FROM sessions WHERE course_id=? ORDER BY day_index",course.id),transcripts=await db.getAllAsync<any>("SELECT id,text,start_ms startMs,end_ms endMs,created_at createdAt FROM transcripts WHERE session_id=? ORDER BY created_at DESC LIMIT 30",session.id),events=await db.getAllAsync<any>("SELECT id,type,title,content,importance,transcript_id transcriptId,created_at createdAt FROM events WHERE session_id=? ORDER BY created_at DESC LIMIT 20",session.id),concepts=await db.getFirstAsync<{count:number}>("SELECT count(1) count FROM knowledge_nodes WHERE course_id=?",course.id),openTasks=await db.getFirstAsync<{count:number}>("SELECT count(1) count FROM tasks WHERE session_id=? AND status='open'",session.id),days=await db.getFirstAsync<{count:number}>("SELECT count(DISTINCT day_index) count FROM sessions WHERE course_id=?",course.id),duration=await db.getFirstAsync<{duration:number|null}>("SELECT sum(end_ms-start_ms) duration FROM transcripts WHERE session_id=?",session.id);return{course,session:{id:session.id,title:session.title,dayIndex:session.dayIndex},courses,sessions,transcripts,events,stats:{minutes:(duration?.duration??0)/60000,concepts:concepts?.count??0,openTasks:openTasks?.count??0,days:days?.count??1}};}
export async function listCourses(){const db=await getDb();return db.getAllAsync<{id:string;name:string}>("SELECT id,name FROM courses ORDER BY created_at");}
export async function listSessions(courseId:string){const db=await getDb();return db.getAllAsync<{id:string;title:string;dayIndex:number}>("SELECT id,title,day_index dayIndex FROM sessions WHERE course_id=? ORDER BY day_index",courseId);}
export async function createCourse(name:string){const db=await getDb();const courseId=uid("course"),sessionId=uid("session"),now=new Date().toISOString();await db.runAsync("INSERT INTO courses VALUES(?,?,?)",courseId,name.trim(),now);await db.runAsync("INSERT INTO sessions VALUES(?,?,?,?,?)",sessionId,courseId,"第 1 天课堂",1,now);await db.runAsync("INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value","active_session_id",sessionId);return{courseId,sessionId};}
export async function createSession(courseId:string,title?:string){const db=await getDb();const max=await db.getFirstAsync<{maxIndex:number}>("SELECT max(day_index) maxIndex FROM sessions WHERE course_id=?",courseId);const dayIndex=(max?.maxIndex??0)+1,sessionId=uid("session"),now=new Date().toISOString(),sessionTitle=title?.trim()||`第 ${dayIndex} 天课堂`;await db.runAsync("INSERT INTO sessions VALUES(?,?,?,?,?)",sessionId,courseId,sessionTitle,dayIndex,now);await db.runAsync("INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value","active_session_id",sessionId);return sessionId;}
export async function setActiveSession(sessionId:string){const db=await getDb();await db.runAsync("INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value","active_session_id",sessionId);}
export async function setActiveCourse(courseId:string){const db=await getDb();const session=await db.getFirstAsync<{id:string}>("SELECT id FROM sessions WHERE course_id=? ORDER BY day_index DESC LIMIT 1",courseId);if(session)await setActiveSession(session.id);}
export async function insertTranscript(text:string,startMs=0,endMs=5000):Promise<Transcript>{const db=await getDb(),session=await getActiveSession(db);const clean=text.trim();if(!clean)throw new Error("请输入有效课堂内容");const value={id:uid("seg"),text:clean,startMs,endMs,createdAt:new Date().toISOString()};await db.runAsync("INSERT INTO transcripts(id,session_id,text,start_ms,end_ms,vector_json,created_at) VALUES(?,?,?,?,?,?,?)",value.id,session.id,value.text,startMs,endMs,JSON.stringify({model:"hash",vector:hashVector(value.text)}),value.createdAt);return value;}
export async function insertCapturedTranscript(input:{id:string;text:string;startMs:number;endMs:number;createdAt:string}):Promise<Transcript>{const db=await getDb(),existing=await db.getFirstAsync<any>("SELECT id,text,start_ms startMs,end_ms endMs,created_at createdAt FROM transcripts WHERE id=?",input.id);if(existing)return existing;const session=await getActiveSession(db);const text=input.text.trim();if(!text)throw new Error("本地识别没有返回有效字幕");const value={id:input.id,text,startMs:Math.max(0,input.startMs),endMs:Math.max(input.startMs+1,input.endMs),createdAt:input.createdAt||new Date().toISOString()};await db.runAsync("INSERT OR IGNORE INTO transcripts(id,session_id,text,start_ms,end_ms,vector_json,created_at) VALUES(?,?,?,?,?,?,?)",value.id,session.id,value.text,value.startMs,value.endMs,JSON.stringify({model:"hash",vector:hashVector(value.text)}),value.createdAt);return value;}
export async function applyAnalysis(transcript:Transcript,analysis:Analysis){const db=await getDb(),row=await db.getFirstAsync<{sessionId:string;courseId:string}>("SELECT s.id sessionId,s.course_id courseId FROM sessions s JOIN transcripts t ON t.session_id=s.id WHERE t.id=?",transcript.id);if(!row)return;await db.withTransactionAsync(async()=>{await db.runAsync("DELETE FROM knowledge_edges WHERE transcript_id=?",transcript.id);await db.runAsync("DELETE FROM events WHERE transcript_id=?",transcript.id);await db.runAsync("DELETE FROM tasks WHERE transcript_id=?",transcript.id);for(const event of analysis.events)await db.runAsync("INSERT INTO events VALUES(?,?,?,?,?,?,?,?)",uid("event"),row.sessionId,transcript.id,event.type,event.title,event.content,Math.max(1,Math.min(10,event.importance)),new Date().toISOString());const nodeIds:string[]=[];for(const concept of analysis.concepts){const normalized=concept.name.normalize("NFKC").toLocaleLowerCase(),nodeId=uid("node");await db.runAsync("INSERT INTO knowledge_nodes VALUES(?,?,?,?,?,?) ON CONFLICT(course_id,normalized_name) DO UPDATE SET definition=coalesce(excluded.definition,definition),importance=max(importance,excluded.importance)",nodeId,row.courseId,concept.name,normalized,concept.definition,concept.importance);const saved=await db.getFirstAsync<{id:string}>("SELECT id FROM knowledge_nodes WHERE course_id=? AND normalized_name=?",row.courseId,normalized);if(saved)nodeIds.push(saved.id);}for(let index=1;index<nodeIds.length;index++)await db.runAsync("INSERT OR IGNORE INTO knowledge_edges VALUES(?,?,?,?,?,?)",uid("edge"),row.courseId,nodeIds[0]!,nodeIds[index]!,"RELATED_TO",transcript.id);for(const task of analysis.tasks){const confidence=clamp(task.confidence??0.7,0,1);const needsReview=Boolean(task.needsReview)||(!task.deadlineResolved&&Boolean(task.deadlineRaw));await db.runAsync("INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?)",uid("task"),row.sessionId,transcript.id,task.title,task.detail,task.deadlineRaw??null,task.deadlineResolved??null,"open",clamp(task.importance??5,1,10),confidence,needsReview?1:0);}});}
function clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,value));}
export async function getKnowledge(){const db=await getDb();return{nodes:await db.getAllAsync<KnowledgeNode>("SELECT id,name,definition,importance FROM knowledge_nodes ORDER BY importance DESC,name"),edges:await db.getAllAsync<{source:string;target:string;relation:string}>("SELECT a.name source,b.name target,e.relation FROM knowledge_edges e JOIN knowledge_nodes a ON a.id=e.source_id JOIN knowledge_nodes b ON b.id=e.target_id")};}
export async function getTasks():Promise<ClassroomTask[]>{const db=await getDb();return db.getAllAsync<any>("SELECT id,title,detail,deadline_raw deadlineRaw,deadline_resolved deadlineResolved,status,importance,confidence,needs_review needsReview,transcript_id transcriptId FROM tasks ORDER BY status,deadline_raw,title");}
export async function toggleTask(id:string,status:"open"|"done"|"dismissed"){const db=await getDb();await db.runAsync("UPDATE tasks SET status=? WHERE id=?",status,id);}
export async function searchEvidence(question:string,limit=8){const db=await getDb(),rows=await db.getAllAsync<any>("SELECT id,text,start_ms startMs,vector_json vectorJson FROM transcripts ORDER BY created_at DESC LIMIT 500");let queryVector:number[];try{const{embed}=await import("@/services/ai"),vectors=await embed([question]);queryVector=vectors[0]??hashVector(question);}catch{queryVector=hashVector(question);}return rows.map(row=>({id:row.id,text:row.text,startMs:row.startMs,score:.55*lexical(question,row.text)+.45*cosine(queryVector,parseVector(row.vectorJson))})).filter(row=>row.score>0).sort((a,b)=>b.score-a.score).slice(0,limit);}
function parseVector(json:string):number[]{const parsed=JSON.parse(json);return Array.isArray(parsed)?parsed:parsed.vector??[];}
export async function reindexEmbeddings(){const{embed}=await import("@/services/ai"),settings=await getSettings(),db=await getDb(),rows=await db.getAllAsync<{id:string;text:string}>("SELECT id,text FROM transcripts");for(let i=0;i<rows.length;i+=16){const batch=rows.slice(i,i+16);let vectors:number[][];try{vectors=await embed(batch.map(r=>r.text));}catch{vectors=batch.map(r=>hashVector(r.text));}for(let j=0;j<batch.length;j++)await db.runAsync("UPDATE transcripts SET vector_json=? WHERE id=?",JSON.stringify({model:settings.embeddingModel,vector:vectors[j]??hashVector(batch[j]!.text)}),batch[j]!.id);}}
export async function getReports():Promise<LearningReport[]>{const db=await getDb();return db.getAllAsync<any>("SELECT id,title,content,template,coalesce(start_date,substr(created_at,1,10)) startDate,coalesce(end_date,substr(created_at,1,10)) endDate,evidence_count evidenceCount,created_at createdAt FROM reports ORDER BY created_at DESC");}
export async function getReportBounds(){const db=await getDb(),today=new Date().toISOString().slice(0,10),row=await db.getFirstAsync<{startDate:string|null;endDate:string|null}>("SELECT min(substr(created_at,1,10)) startDate,max(substr(created_at,1,10)) endDate FROM transcripts");return{startDate:row?.startDate??today,endDate:row?.endDate??today};}
export async function saveReport(scope:ReportScope,content:string,evidenceCount:number){const db=await getDb(),course=await db.getFirstAsync<{id:string}>("SELECT id FROM courses LIMIT 1"),id=uid("report"),createdAt=new Date().toISOString();await db.runAsync("INSERT INTO reports(id,course_id,title,content,template,start_date,end_date,evidence_count,created_at) VALUES(?,?,?,?,?,?,?,?,?)",id,course!.id,scope.title.trim(),content,scope.template,scope.startDate,scope.endDate,evidenceCount,createdAt);return{id,title:scope.title.trim(),content,template:scope.template,startDate:scope.startDate,endDate:scope.endDate,evidenceCount,createdAt}as LearningReport;}
export async function reportContext(scope:ReportScope){if(!/^\d{4}-\d{2}-\d{2}$/.test(scope.startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(scope.endDate)||scope.startDate>scope.endDate)throw new Error("报告日期范围无效");const db=await getDb();return db.getAllAsync<any>("SELECT t.id transcriptId,s.day_index dayIndex,s.title,t.text,t.start_ms startMs,t.created_at createdAt FROM sessions s JOIN transcripts t ON t.session_id=s.id WHERE substr(t.created_at,1,10) BETWEEN ? AND ? ORDER BY t.created_at,t.start_ms",scope.startDate,scope.endDate);}
export async function reportSummaryContext(scope:ReportScope){if(!/^\d{4}-\d{2}-\d{2}$/.test(scope.startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(scope.endDate)||scope.startDate>scope.endDate)throw new Error("报告日期范围无效");const db=await getDb();return db.getAllAsync<{sessionId:string;dayIndex:number;title:string;contentMd:string|null;createdAt:string}>("SELECT s.id sessionId,s.day_index dayIndex,s.title,ss.content_md contentMd,COALESCE(ss.created_at,s.created_at) createdAt FROM sessions s LEFT JOIN session_summaries ss ON ss.session_id=s.id WHERE substr(s.created_at,1,10) BETWEEN ? AND ? ORDER BY s.day_index",scope.startDate,scope.endDate);}
export async function checkReportReadiness(scope:ReportScope){if(!/^\d{4}-\d{2}-\d{2}$/.test(scope.startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(scope.endDate)||scope.startDate>scope.endDate)throw new Error("报告日期范围无效");const db=await getDb();const missing=await db.getAllAsync<{id:string;title:string;dayIndex:number}>("SELECT s.id,s.title,s.day_index dayIndex FROM sessions s LEFT JOIN session_summaries ss ON ss.session_id=s.id WHERE substr(s.created_at,1,10) BETWEEN ? AND ? AND ss.id IS NULL ORDER BY s.day_index",scope.startDate,scope.endDate);return{ready:missing.length===0,missing};}
export async function deleteTask(id:string){const db=await getDb();await db.runAsync("DELETE FROM tasks WHERE id=?",id);}
export async function deleteReport(id:string){const db=await getDb();await db.runAsync("DELETE FROM reports WHERE id=?",id);}
export async function deleteSession(sessionId:string){const db=await getDb();await db.withTransactionAsync(async()=>{const transcripts=await db.getAllAsync<{id:string}>("SELECT id FROM transcripts WHERE session_id=?",sessionId);for(const t of transcripts){await db.runAsync("DELETE FROM knowledge_edges WHERE transcript_id=?",t.id);await db.runAsync("DELETE FROM events WHERE transcript_id=?",t.id);}await db.runAsync("DELETE FROM tasks WHERE session_id=?",sessionId);await db.runAsync("DELETE FROM transcripts WHERE session_id=?",sessionId);await db.runAsync("DELETE FROM session_summaries WHERE session_id=?",sessionId);await db.runAsync("DELETE FROM events WHERE session_id=?",sessionId);const active=await db.getFirstAsync<{value:string}>("SELECT value FROM app_settings WHERE key='active_session_id'");await db.runAsync("DELETE FROM sessions WHERE id=?",sessionId);if(active?.value===sessionId){const course=await db.getFirstAsync<{course_id:string}>("SELECT course_id FROM sessions ORDER BY created_at DESC LIMIT 1");if(course){const fallback=await db.getFirstAsync<{id:string}>("SELECT id FROM sessions WHERE course_id=? ORDER BY day_index DESC LIMIT 1",course.course_id);if(fallback)await db.runAsync("INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value","active_session_id",fallback.id);}}});}
export async function deleteCourse(courseId:string){const db=await getDb();await db.withTransactionAsync(async()=>{const sessions=await db.getAllAsync<{id:string}>("SELECT id FROM sessions WHERE course_id=?",courseId);for(const s of sessions){const transcripts=await db.getAllAsync<{id:string}>("SELECT id FROM transcripts WHERE session_id=?",s.id);for(const t of transcripts){await db.runAsync("DELETE FROM knowledge_edges WHERE transcript_id=?",t.id);await db.runAsync("DELETE FROM events WHERE transcript_id=?",t.id);}await db.runAsync("DELETE FROM tasks WHERE session_id=?",s.id);await db.runAsync("DELETE FROM transcripts WHERE session_id=?",s.id);await db.runAsync("DELETE FROM session_summaries WHERE session_id=?",s.id);await db.runAsync("DELETE FROM events WHERE session_id=?",s.id);}await db.runAsync("DELETE FROM knowledge_edges WHERE course_id=?",courseId);await db.runAsync("DELETE FROM knowledge_nodes WHERE course_id=?",courseId);await db.runAsync("DELETE FROM reports WHERE course_id=?",courseId);await db.runAsync("DELETE FROM sessions WHERE course_id=?",courseId);const active=await db.getFirstAsync<{value:string}>("SELECT value FROM app_settings WHERE key='active_session_id'");await db.runAsync("DELETE FROM courses WHERE id=?",courseId);if(active){const remaining=await db.getFirstAsync<{id:string}>("SELECT id FROM sessions ORDER BY created_at DESC LIMIT 1");if(remaining)await db.runAsync("INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value","active_session_id",remaining.id);}});}
export type CourseExportPayload={
  format:"classmate-course";
  version:1;
  exportedAt:string;
  course:{name:string;createdAt:string};
  sessions:Array<{
    title:string;
    dayIndex:number;
    createdAt:string;
    transcripts:Array<{text:string;startMs:number;endMs:number;createdAt:string}>;
    events:Array<{type:string;title:string;content:string;importance:number;transcriptIndex:number;createdAt:string}>;
    tasks:Array<{title:string;detail:string;deadlineRaw:string|null;deadlineResolved:string|null;status:"open"|"done"|"dismissed";importance:number;confidence:number;needsReview:boolean;transcriptIndex:number}>;
    summary:{contentMd:string;evidenceIds:string[];createdAt:string}|null;
  }>;
  knowledgeNodes:Array<{name:string;definition:string|null;importance:number}>;
  knowledgeEdges:Array<{sourceName:string;targetName:string;relation:string}>;
};

export async function exportCourse(courseId:string):Promise<CourseExportPayload>{
  const db=await getDb();
  const course=await db.getFirstAsync<{id:string;name:string;created_at:string}>("SELECT id,name,created_at FROM courses WHERE id=?",courseId);
  if(!course)throw new Error("课程不存在");
  const sessions=await db.getAllAsync<{id:string;title:string;day_index:number;created_at:string}>("SELECT id,title,day_index,created_at FROM sessions WHERE course_id=? ORDER BY day_index",courseId);
  const sessionBlocks=await Promise.all(sessions.map(async session=>{
    const transcripts=await db.getAllAsync<{id:string;text:string;start_ms:number;end_ms:number;created_at:string}>("SELECT id,text,start_ms,end_ms,created_at FROM transcripts WHERE session_id=? ORDER BY start_ms",session.id);
    const transcriptIndex=new Map<string,number>();
    transcripts.forEach((t,i)=>transcriptIndex.set(t.id,i));
    const events=await db.getAllAsync<{type:string;title:string;content:string;importance:number;transcript_id:string;created_at:string}>("SELECT type,title,content,importance,transcript_id,created_at FROM events WHERE session_id=? ORDER BY created_at",session.id);
    const tasks=await db.getAllAsync<{title:string;detail:string;deadline_raw:string|null;deadline_resolved:string|null;status:string;importance:number;confidence:number;needs_review:number;transcript_id:string}>("SELECT title,detail,deadline_raw,deadline_resolved,status,importance,confidence,needs_review,transcript_id FROM tasks WHERE session_id=? ORDER BY status,title",session.id);
    const summary=await db.getFirstAsync<{content_md:string;evidence_ids:string;created_at:string}>("SELECT content_md,evidence_ids,created_at FROM session_summaries WHERE session_id=? ORDER BY revision DESC LIMIT 1",session.id);
    return{
      title:session.title,
      dayIndex:session.day_index,
      createdAt:session.created_at,
      transcripts:transcripts.map(t=>({text:t.text,startMs:t.start_ms,endMs:t.end_ms,createdAt:t.created_at})),
      events:events.map(e=>({type:e.type,title:e.title,content:e.content,importance:e.importance,transcriptIndex:transcriptIndex.get(e.transcript_id)??0,createdAt:e.created_at})),
      tasks:tasks.map(t=>({title:t.title,detail:t.detail,deadlineRaw:t.deadline_raw,deadlineResolved:t.deadline_resolved,status:t.status as"open"|"done"|"dismissed",importance:t.importance,confidence:t.confidence,needsReview:Boolean(t.needs_review),transcriptIndex:transcriptIndex.get(t.transcript_id)??0})),
      summary:summary?{contentMd:summary.content_md,evidenceIds:JSON.parse(summary.evidence_ids),createdAt:summary.created_at}:null,
    };
  }));
  const nodes=await db.getAllAsync<{name:string;definition:string|null;importance:number}>("SELECT name,definition,importance FROM knowledge_nodes WHERE course_id=? ORDER BY importance DESC,name",courseId);
  const edges=await db.getAllAsync<{sourceName:string;targetName:string;relation:string}>("SELECT a.name sourceName,b.name targetName,e.relation FROM knowledge_edges e JOIN knowledge_nodes a ON a.id=e.source_id JOIN knowledge_nodes b ON b.id=e.target_id WHERE e.course_id=?",courseId);
  return{format:"classmate-course",version:1,exportedAt:new Date().toISOString(),course:{name:course.name,createdAt:course.created_at},sessions:sessionBlocks,knowledgeNodes:nodes,knowledgeEdges:edges};
}

export type ImportOptions={
  mode:"new"|"merge";
  targetCourseId?:string;
  newCourseName?:string;
  sessionOrder?:number[];
  startDayIndex?:number;
};

export async function importCourse(payload:CourseExportPayload,options:ImportOptions):Promise<{courseId:string;sessionCount:number}>{
  if(!payload||payload.format!=="classmate-course")throw new Error("无效的课程文件");
  const db=await getDb();
  const now=new Date().toISOString();
  const order=options.sessionOrder&&options.sessionOrder.length?options.sessionOrder:payload.sessions.map((_,i)=>i);
  if(order.length!==payload.sessions.length)throw new Error("课次排序与导入课次数不匹配");
  for(const idx of order){if(idx<0||idx>=payload.sessions.length)throw new Error("课次排序包含无效索引");}
  let courseId:string;
  let dayIndexOffset=0;
  let knowledgeNodeIds=new Map<string,string>();
  await db.withTransactionAsync(async()=>{
    if(options.mode==="merge"){
      if(!options.targetCourseId)throw new Error("合并导入需要指定目标课程");
      const target=await db.getFirstAsync<{id:string}>("SELECT id FROM courses WHERE id=?",options.targetCourseId);
      if(!target)throw new Error("目标课程不存在");
      courseId=target.id;
      const existing=await db.getAllAsync<{id:string;normalized_name:string}>("SELECT id,normalized_name FROM knowledge_nodes WHERE course_id=?",courseId);
      for(const node of existing)knowledgeNodeIds.set(node.normalized_name,node.id);
      const maxDay=await db.getFirstAsync<{maxDay:number|null}>("SELECT MAX(day_index) maxDay FROM sessions WHERE course_id=?",courseId);
      dayIndexOffset=maxDay?.maxDay??0;
    }else{
      courseId=uid("course");
      const name=(options.newCourseName||payload.course.name).trim()||"导入课程";
      await db.runAsync("INSERT INTO courses VALUES(?,?,?)",courseId,name,now);
      if(options.startDayIndex&&options.startDayIndex>1)dayIndexOffset=options.startDayIndex-1;
    }
    for(let position=0;position<order.length;position++){
      const originalIdx=order[position]!;
      const session=payload.sessions[originalIdx]!;
      const sessionId=uid("session");
      const dayIndex=dayIndexOffset+position+1;
      const title=session.title||`第 ${dayIndex} 天课堂`;
      await db.runAsync("INSERT INTO sessions VALUES(?,?,?,?,?)",sessionId,courseId!,title,dayIndex,session.createdAt||now);
      const transcriptIdMap=new Map<number,string>();
      for(let i=0;i<session.transcripts.length;i++){
        const t=session.transcripts[i]!;
        const tid=uid("seg");
        transcriptIdMap.set(i,tid);
        await db.runAsync("INSERT INTO transcripts(id,session_id,text,start_ms,end_ms,vector_json,created_at) VALUES(?,?,?,?,?,?,?)",tid,sessionId,t.text,t.startMs,t.endMs,JSON.stringify({model:"hash",vector:hashVector(t.text)}),t.createdAt||now);
      }
      for(const event of session.events){
        const transcriptId=transcriptIdMap.get(event.transcriptIndex)??transcriptIdMap.get(0);
        if(!transcriptId)continue;
        await db.runAsync("INSERT INTO events VALUES(?,?,?,?,?,?,?,?)",uid("event"),sessionId,transcriptId,event.type,event.title,event.content,Math.max(1,Math.min(10,event.importance)),event.createdAt||now);
      }
      for(const task of session.tasks){
        const transcriptId=transcriptIdMap.get(task.transcriptIndex)??transcriptIdMap.get(0);
        if(!transcriptId)continue;
        const confidence=clamp(task.confidence??0.7,0,1);
        await db.runAsync("INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?)",uid("task"),sessionId,transcriptId,task.title,task.detail,task.deadlineRaw??null,task.deadlineResolved??null,task.status,clamp(task.importance??5,1,10),confidence,task.needsReview?1:0);
      }
      if(session.summary){
        await db.runAsync("INSERT INTO session_summaries VALUES(?,?,?,?,?,?)",uid("summary"),sessionId,session.summary.contentMd,JSON.stringify(session.summary.evidenceIds),1,session.summary.createdAt||now);
      }
    }
    if(payload.knowledgeNodes){
      for(const node of payload.knowledgeNodes){
        const normalized=node.name.normalize("NFKC").toLocaleLowerCase();
        if(!knowledgeNodeIds.has(normalized)){
          const nodeId=uid("node");
          await db.runAsync("INSERT INTO knowledge_nodes VALUES(?,?,?,?,?,?) ON CONFLICT(course_id,normalized_name) DO UPDATE SET definition=coalesce(excluded.definition,definition),importance=max(importance,excluded.importance)",nodeId,courseId!,node.name,normalized,node.definition,node.importance);
          const saved=await db.getFirstAsync<{id:string}>("SELECT id FROM knowledge_nodes WHERE course_id=? AND normalized_name=?",courseId!,normalized);
          if(saved)knowledgeNodeIds.set(normalized,saved.id);
        }else{
          const existingId=knowledgeNodeIds.get(normalized);
          if(existingId)await db.runAsync("UPDATE knowledge_nodes SET definition=coalesce(definition,?),importance=max(importance,?) WHERE id=?",node.definition,node.importance,existingId);
        }
      }
    }
    if(payload.knowledgeEdges){
      for(const edge of payload.knowledgeEdges){
        const sourceId=knowledgeNodeIds.get(edge.sourceName.normalize("NFKC").toLocaleLowerCase());
        const targetId=knowledgeNodeIds.get(edge.targetName.normalize("NFKC").toLocaleLowerCase());
        if(!sourceId||!targetId)continue;
        await db.runAsync("INSERT OR IGNORE INTO knowledge_edges VALUES(?,?,?,?,?,?)",uid("edge"),courseId!,sourceId,targetId,edge.relation,uid("seg"));
      }
    }
  });
  return{courseId:courseId!,sessionCount:order.length};
}

export async function getSessionTranscripts(sessionId:string){const db=await getDb();return db.getAllAsync<{id:string;text:string;startMs:number}>("SELECT id,text,start_ms startMs FROM transcripts WHERE session_id=? ORDER BY start_ms",sessionId);}
export async function getSessionSummary(sessionId:string){const db=await getDb();return db.getFirstAsync<{id:string;contentMd:string;createdAt:string}>("SELECT id,content_md contentMd,created_at createdAt FROM session_summaries WHERE session_id=? ORDER BY revision DESC LIMIT 1",sessionId);}
export async function saveSessionSummary(sessionId:string,contentMd:string,evidenceIds:string[]){const db=await getDb();const existing=await db.getFirstAsync<{id:string;revision:number}>("SELECT id,revision FROM session_summaries WHERE session_id=? ORDER BY revision DESC LIMIT 1",sessionId);if(existing){await db.runAsync("UPDATE session_summaries SET content_md=?,evidence_ids=?,revision=?,created_at=? WHERE id=?",contentMd,JSON.stringify(evidenceIds),existing.revision+1,new Date().toISOString(),existing.id);}else{await db.runAsync("INSERT INTO session_summaries VALUES(?,?,?,?,?,?)",uid("summary"),sessionId,contentMd,JSON.stringify(evidenceIds),1,new Date().toISOString());}}
function grams(value:string){const clean=value.normalize("NFKC").toLocaleLowerCase().replace(/\s|[，。；：、,.!?！？()（）]/g,"");const result=new Set<string>();for(let i=0;i<clean.length-1;i++)result.add(clean.slice(i,i+2));return result;}
function lexical(a:string,b:string){const x=grams(a),y=grams(b);let overlap=0;for(const item of x)if(y.has(item))overlap++;return x.size&&y.size?overlap/Math.sqrt(x.size*y.size):0;}
export function hashVector(text:string,dims=128){const vector=Array.from({length:dims},()=>0);for(const gram of grams(text)){let hash=2166136261;for(const char of gram)hash=Math.imul(hash^char.codePointAt(0)!,16777619);vector[Math.abs(hash)%dims]!+=hash%2?1:-1;}const norm=Math.sqrt(vector.reduce((sum,value)=>sum+value*value,0))||1;return vector.map(value=>value/norm);}
function cosine(a:number[],b:number[]){let dot=0,aa=0,bb=0;for(let i=0;i<Math.min(a.length,b.length);i++){dot+=a[i]!*b[i]!;aa+=a[i]!*a[i]!;bb+=b[i]!*b[i]!;}return aa&&bb?dot/Math.sqrt(aa*bb):0;}
async function ensureColumn(db:SQLite.SQLiteDatabase,table:string,column:string,definition:string){if(!/^\w+$/.test(table)||!/^\w+$/.test(column))throw new Error("数据库列名无效");const columns=await db.getAllAsync<{name:string}>(`PRAGMA table_info(${table})`);if(!columns.some(value=>value.name===column))await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);}
