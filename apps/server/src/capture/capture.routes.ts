import type{FastifyInstance}from"fastify";import{CaptureService}from"./capture.service.js";
export async function captureRoutes(app:FastifyInstance,service:CaptureService):Promise<void>{app.post("/api/sessions/:id/capture/start",async request=>({data:service.start((request.params as{id:string}).id),requestId:request.id}));app.post("/api/sessions/:id/capture/stop",async request=>{service.stop((request.params as{id:string}).id);return{data:{stopped:true},requestId:request.id};});}

