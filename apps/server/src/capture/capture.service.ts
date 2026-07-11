import { spawn,type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import chokidar,{type FSWatcher}from"chokidar";
import { config } from "../shared/config.js";
import { DependencyError,ValidationError } from "../shared/errors.js";
import { fingerprint } from "../shared/ids.js";
import { JobRepository } from "../jobs/job.repository.js";
import { CourseService } from "../courses/course.service.js";

export class CaptureService{
  private process:ChildProcessWithoutNullStreams|null=null;private watcher:FSWatcher|null=null;
  constructor(private readonly jobs:JobRepository,private readonly courses:CourseService){}
  async initialize():Promise<void>{const inbox=resolve(config.dataDir,"inbox");mkdirSync(inbox,{recursive:true});this.watcher=chokidar.watch(inbox,{ignoreInitial:false,awaitWriteFinish:{stabilityThreshold:150,pollInterval:50}});this.watcher.on("add",path=>{if(path.toLowerCase().endsWith(".wav"))this.onChunk(path);});}
  start(sessionId:string):{pid:number|null}{if(this.process)throw new ValidationError("已有录音会话正在运行");if(!existsSync(config.executables.audioCapture))throw new DependencyError("WASAPI 采集程序尚未构建，请先运行 dotnet build tools/audio-capture -c Release");this.courses.setStatus(sessionId,"recording");const child=spawn(config.executables.audioCapture,["--session",sessionId,"--output",resolve(config.dataDir,"inbox")],{windowsHide:true});this.process=child;child.on("error",()=>{if(this.process===child){this.process=null;this.courses.setStatus(sessionId,"failed");}});child.on("close",code=>{if(this.process===child){this.process=null;if(code!==0)this.courses.setStatus(sessionId,"failed");}});return{pid:child.pid??null};}
  stop(sessionId:string):void{if(this.process){this.process.kill();this.process=null;}this.courses.setStatus(sessionId,"processing");this.jobs.enqueue("summarize_session",{sessionId,force:true},fingerprint("summary-final",sessionId));}
  async close():Promise<void>{if(this.process)this.process.kill();await this.watcher?.close();}
  private onChunk(path:string):void{const name=path.split(/[\\/]/).pop()??"";const match=name.match(/^(session_[A-Za-z0-9_-]+)__(\d+)__(\d+)\.wav$/);if(!match)return;this.jobs.enqueue("transcribe_audio",{sessionId:match[1]!,audioPath:path,offsetMs:Number(match[2]),queuedAt:Date.now()},fingerprint("asr",path,String(match[3])));}
}
