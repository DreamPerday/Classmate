import { readFile } from "node:fs/promises";
import OpenAI from "openai";
import { config } from "../shared/config.js";
import { DependencyError } from "../shared/errors.js";
import { TranscriptService } from "../classroom/transcript.service.js";
import { localTranscribe, type AsrResult } from "./local-asr.js";

export class AsrService{
  constructor(private readonly transcripts:TranscriptService){}
  async transcribe(payload:Record<string,unknown>):Promise<void>{const sessionId=String(payload.sessionId),audioPath=String(payload.audioPath),offsetMs=Number(payload.offsetMs??0),queuedAt=Number(payload.queuedAt);const result=config.asr.provider==="faster-whisper"?await this.local(audioPath):config.asr.provider==="openai"?await this.openai(audioPath):{language:"zh",segments:[{start:0,end:5,text:"本地语音识别测试片段",confidence:1}]};const latencyMs=Number.isFinite(queuedAt)?Math.max(0,Date.now()-queuedAt):undefined;for(const segment of result.segments){if(!segment.text.trim())continue;const input={sessionId,startMs:offsetMs+Math.round(segment.start*1000),endMs:offsetMs+Math.round(segment.end*1000),text:segment.text.trim(),audioPath,...(latencyMs===undefined?{}:{latencyMs}),...(segment.confidence===undefined?{}:{confidence:segment.confidence})};this.transcripts.ingest(input);}}
  private local(audioPath:string):Promise<AsrResult>{return localTranscribe(audioPath);}
  private async openai(audioPath:string):Promise<AsrResult>{if(!config.ai.openaiApiKey)throw new DependencyError("使用 OpenAI ASR 需要 OPENAI_API_KEY");const client=new OpenAI({apiKey:config.ai.openaiApiKey,baseURL:config.ai.openaiBaseUrl});const bytes=await readFile(audioPath);const file=new File([bytes],audioPath.split(/[\\/]/).pop()??"audio.wav",{type:"audio/wav"});const response:any=await client.audio.transcriptions.create({file,model:"whisper-1",response_format:"verbose_json",timestamp_granularities:["segment"]});return{language:response.language??"zh",segments:(response.segments??[{start:0,end:0,text:response.text}]).map((s:any)=>({start:s.start,end:s.end,text:s.text,confidence:s.avg_logprob===undefined?undefined:Math.max(0,Math.min(1,Math.exp(s.avg_logprob))) }))};}
}
