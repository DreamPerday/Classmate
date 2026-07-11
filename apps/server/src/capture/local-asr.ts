import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resolve } from "node:path";
import { config } from "../shared/config.js";
import { DependencyError } from "../shared/errors.js";

export type AsrResult={language:string;languageProbability?:number;segments:Array<{start:number;end:number;text:string;confidence?:number}>};
type Pending={resolve:(result:AsrResult)=>void;reject:(error:Error)=>void;timer:NodeJS.Timeout};

class LocalAsrClient{
  private child:ChildProcessWithoutNullStreams|null=null;private buffer="";private stderr="";private sequence=0;private readonly pending=new Map<number,Pending>();
  transcribe(audioPath:string):Promise<AsrResult>{this.ensureStarted();const id=++this.sequence;return new Promise((resolvePromise,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new DependencyError(`本地 ASR 超时: ${config.asr.model}`));},600_000);this.pending.set(id,{resolve:resolvePromise,reject,timer});this.child!.stdin.write(`${JSON.stringify({id,input:audioPath})}\n`);});}
  close():void{this.child?.kill();this.child=null;this.failAll(new DependencyError("本地 ASR 进程已关闭"));}
  private ensureStarted():void{if(this.child)return;const script=resolve(config.root,"services/ai-worker/main.py");const modelCache=resolve(config.dataDir,"models");this.child=spawn(config.executables.python,[script,"transcribe-server","--model",config.asr.model,"--device",config.asr.device,"--compute-type",config.asr.computeType],{windowsHide:true,env:{...process.env,HF_ENDPOINT:process.env.HF_ENDPOINT??"https://hf-mirror.com",HF_HUB_DISABLE_SYMLINKS_WARNING:"1",HF_HUB_OFFLINE:"0",SENTENCE_TRANSFORMERS_HOME:modelCache,TRANSFORMERS_CACHE:modelCache,HF_HOME:modelCache,PYTHONUTF8:"1",PYTHONIOENCODING:"utf-8"}});this.child.stdout.setEncoding("utf8");this.child.stderr.setEncoding("utf8");this.child.stdout.on("data",chunk=>this.onData(chunk));this.child.stderr.on("data",chunk=>{this.stderr=(this.stderr+chunk).slice(-8000);});this.child.on("error",error=>this.failAll(new DependencyError(`无法启动本地 ASR: ${error.message}`)));this.child.on("close",code=>{this.child=null;if(code!==0)this.failAll(new DependencyError(`本地 ASR 进程退出: ${code}${this.stderr.trim()?`: ${this.stderr.trim()}`:""}`));this.stderr="";});}
  private onData(chunk:string):void{this.buffer+=chunk;for(;;){const index=this.buffer.indexOf("\n");if(index<0)return;const line=this.buffer.slice(0,index).trim();this.buffer=this.buffer.slice(index+1);if(!line)continue;let response:{id?:number;result?:AsrResult;error?:string};try{response=JSON.parse(line);}catch{continue;}if(response.id===undefined)continue;const pending=this.pending.get(response.id);if(!pending)continue;this.pending.delete(response.id);clearTimeout(pending.timer);if(response.error)pending.reject(new DependencyError(response.error));else if(response.result)pending.resolve(response.result);else pending.reject(new DependencyError("本地 ASR 返回了无效结果"));}}
  private failAll(error:Error):void{for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(error);}this.pending.clear();}
}

const client=new LocalAsrClient();
export function localTranscribe(audioPath:string):Promise<AsrResult>{return client.transcribe(audioPath);}
export function closeLocalAsrClient():void{client.close();}
