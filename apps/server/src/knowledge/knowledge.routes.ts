import type{FastifyInstance}from"fastify";import{AskRequestSchema}from"@classmate/shared";import{SemanticRepository}from"./semantic.repository.js";import{RetrievalService}from"./retrieval.service.js";
export async function knowledgeRoutes(app:FastifyInstance,repository:SemanticRepository,retrieval:RetrievalService):Promise<void>{
app.get("/api/courses/:id/graph",async request=>({data:repository.graph((request.params as{id:string}).id),requestId:request.id}));
app.get("/api/courses/:id/tasks",async request=>({data:repository.tasks((request.params as{id:string}).id),requestId:request.id}));
app.get("/api/sessions/:id/tasks",async request=>({data:repository.sessionTasks((request.params as{id:string}).id),requestId:request.id}));
app.get("/api/sessions/:id/events",async request=>({data:repository.recentEvents((request.params as{id:string}).id),requestId:request.id}));
app.patch("/api/tasks/:id",async request=>{const body=request.body as{status?:"open"|"done"|"dismissed";title?:string;detail?:string;deadlineRaw?:string|null;deadlineResolved?:string|null;importance?:number};const id=(request.params as{id:string}).id;if(body.status!==undefined&&body.title===undefined&&body.detail===undefined&&body.deadlineRaw===undefined&&body.deadlineResolved===undefined&&body.importance===undefined){return{data:repository.updateTask(id,body.status),requestId:request.id};}return{data:repository.updateTaskFull(id,body),requestId:request.id};});
app.delete("/api/tasks/:id",async request=>({data:{deleted:repository.deleteTask((request.params as{id:string}).id)},requestId:request.id}));
app.get("/api/tasks/:id/evidence",async request=>({data:repository.taskEvidence((request.params as{id:string}).id),requestId:request.id}));
app.get("/api/nodes/:id/evidence",async request=>({data:repository.nodeEvidence((request.params as{id:string}).id),requestId:request.id}));
app.get("/api/nodes/:id/tasks",async request=>({data:repository.nodeTasks((request.params as{id:string}).id),requestId:request.id}));
app.patch("/api/nodes/:id",async request=>({data:repository.updateNode((request.params as{id:string}).id,request.body as{definition?:string;importance?:number}),requestId:request.id}));
app.delete("/api/nodes/:id",async request=>({data:{deleted:repository.deleteNode((request.params as{id:string}).id)},requestId:request.id}));
app.post("/api/ask",async request=>{const parsed=AskRequestSchema.parse(request.body);return{data:await retrieval.answer(parsed.courseId,parsed.question),requestId:request.id};});}
