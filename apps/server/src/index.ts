import{createApp}from"./app.js";import{config}from"./shared/config.js";import{closeDatabase}from"./shared/database.js";
import{closeLocalEmbeddingClients}from"./ai/local-embedding.js";
import{closeLocalAsrClient}from"./capture/local-asr.js";
async function main():Promise<void>{const runtime=await createApp();await runtime.app.listen({host:config.host,port:config.port});const shutdown=async()=>{runtime.runner.stop();await runtime.capture.close();closeLocalAsrClient();closeLocalEmbeddingClients();await runtime.app.close();closeDatabase();};process.on("SIGINT",()=>void shutdown());process.on("SIGTERM",()=>void shutdown());}
void main().catch(error=>{process.stderr.write(`${error instanceof Error?error.stack:String(error)}\n`);process.exitCode=1;});
