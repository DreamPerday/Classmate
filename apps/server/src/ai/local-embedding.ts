import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resolve } from "node:path";
import { config } from "../shared/config.js";
import { DependencyError } from "../shared/errors.js";

type Pending={resolve:(vectors:number[][])=>void;reject:(error:Error)=>void;timer:NodeJS.Timeout};
class LocalEmbeddingClient{
  private child:ChildProcessWithoutNullStreams|null=null;private buffer="";private sequence=0;private readonly pending=new Map<number,Pending>();
  constructor(private readonly model:string){}
  embed(texts:string[]):Promise<number[][]>{this.ensureStarted();const id=++this.sequence;return new Promise((resolvePromise,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new DependencyError(`本地 embedding 超时: ${this.model}`));},600_000);this.pending.set(id,{resolve:resolvePromise,reject,timer});this.child!.stdin.write(`${JSON.stringify({id,texts})}\n`);});}
  close():void{this.child?.kill();this.child=null;for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(new DependencyError("本地 embedding 进程已关闭"));}this.pending.clear();}
  private ensureStarted():void{if(this.child)return;const script=resolve(config.root,"services/ai-worker/main.py");const modelCache=resolve(config.dataDir,"models");this.child=spawn(config.executables.python,[script,"embed-server","--model",this.model,"--device",config.ai.localEmbedDevice],{windowsHide:true,env:{...process.env,HF_ENDPOINT:process.env.HF_ENDPOINT??"https://hf-mirror.com",HF_HUB_DISABLE_SYMLINKS_WARNING:"1",HF_HUB_OFFLINE:"0",SENTENCE_TRANSFORMERS_HOME:modelCache,TRANSFORMERS_CACHE:modelCache,HF_HOME:modelCache,PYTHONUTF8:"1",PYTHONIOENCODING:"utf-8"}});this.child.stdout.on("data",chunk=>this.onData(String(chunk)));this.child.stderr.on("data",chunk=>{const message=String(chunk);if(/traceback|error/i.test(message))process.stderr.write(message);});this.child.on("error",error=>this.failAll(new DependencyError(`无法启动本地 embedding: ${error.message}`)));this.child.on("close",code=>{this.child=null;if(code!==0)this.failAll(new DependencyError(`本地 embedding 进程退出: ${code}`));});}
  private onData(chunk:string):void{this.buffer+=chunk;for(;;){const index=this.buffer.indexOf("\n");if(index<0)return;const line=this.buffer.slice(0,index).trim();this.buffer=this.buffer.slice(index+1);if(!line)continue;let response:{id?:number;vectors?:number[][];error?:string};try{response=JSON.parse(line);}catch{continue;}if(response.id===undefined)continue;const pending=this.pending.get(response.id);if(!pending)continue;this.pending.delete(response.id);clearTimeout(pending.timer);if(response.error)pending.reject(new DependencyError(response.error));else pending.resolve(response.vectors??[]);}}
  private failAll(error:Error):void{for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(error);}this.pending.clear();}
}
const clients=new Map<string,LocalEmbeddingClient>();
export function localEmbed(model:string,texts:string[]):Promise<number[][]>{let client=clients.get(model);if(!client){client=new LocalEmbeddingClient(model);clients.set(model,client);}return client.embed(texts);}
export function closeLocalEmbeddingClients():void{for(const client of clients.values())client.close();clients.clear();}
