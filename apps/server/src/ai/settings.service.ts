import { config } from "../shared/config.js";
import { DependencyError } from "../shared/errors.js";
import { fingerprint } from "../shared/ids.js";
import { JobRepository } from "../jobs/job.repository.js";
import { getAiProvider } from "./provider.js";
import { AiSettingsRepository, modelKind, normalizeOpenAiBaseUrl, type AiRuntimeSettings, type AiSettingsInput, type UpstreamModel } from "./settings.repository.js";

export class AiSettingsService {
  private cache:{key:string;at:number;models:UpstreamModel[]}|null=null;
  constructor(private readonly repository:AiSettingsRepository,private readonly jobs:JobRepository){}
  get():AiRuntimeSettings{return this.repository.get();}
  save(input:AiSettingsInput):AiRuntimeSettings{const previous=this.repository.get();this.cache=null;const saved=this.repository.save(input);if(previous.embeddingModel!==saved.embeddingModel)this.reindex();return saved;}
  reindex():{queued:boolean;model:string}{const model=this.repository.get().embeddingModel;this.jobs.enqueue("reindex_all",{model},fingerprint("reindex",model,new Date().toISOString()));return{queued:true,model};}
  async listModels(provider?:AiSettingsInput["provider"]):Promise<UpstreamModel[]>{
    const settings=this.repository.get(),selected=provider??settings.provider,baseUrl=selected==="openai"?normalizeOpenAiBaseUrl(settings.baseUrl):selected==="ollama"?config.ai.ollamaBaseUrl:"local",key=`${selected}:${baseUrl}:${settings.apiFormat??"openai-chat"}`;
    if(this.cache?.key===key&&Date.now()-this.cache.at<60_000)return this.cache.models;
    let models:UpstreamModel[];
    if(selected==="openai"){
      if(!config.ai.openaiApiKey)throw new DependencyError("OPENAI_API_KEY 未配置");
      const isClaude=settings.apiFormat==="claude";
      const headers:Record<string,string>=isClaude?{"x-api-key":config.ai.openaiApiKey,"anthropic-version":"2023-06-01"}:{authorization:`Bearer ${config.ai.openaiApiKey}`};
      const response=await fetch(`${baseUrl}/models`,{headers,signal:AbortSignal.timeout(20_000)}).catch(error=>{throw new DependencyError(`无法连接上游模型接口: ${error instanceof Error?error.message:String(error)}`);});
      if(!response.ok)throw new DependencyError(`上游模型接口返回 HTTP ${response.status}`);
      const body=await response.json() as {data?:Array<{id?:string;owned_by?:string;created?:number}>};
      models=(body.data??[]).filter(item=>typeof item.id==="string").map(item=>({id:item.id!,ownedBy:item.owned_by??null,created:item.created??null,kind:modelKind(item.id!)}));models.push({id:"local:BAAI/bge-small-zh-v1.5",ownedBy:"local",created:null,kind:"embedding"});models.sort((a,b)=>a.id.localeCompare(b.id));
    }else if(selected==="ollama"){
      const response=await fetch(`${config.ai.ollamaBaseUrl}/api/tags`,{signal:AbortSignal.timeout(5000)}).catch(error=>{throw new DependencyError(`无法连接 Ollama: ${error instanceof Error?error.message:String(error)}`);});
      if(!response.ok)throw new DependencyError(`Ollama 返回 HTTP ${response.status}`);const body=await response.json() as {models?:Array<{name:string}>};models=(body.models??[]).map(item=>({id:item.name,ownedBy:"local",created:null,kind:modelKind(item.name)}));
    }else models=[{id:"mock:deterministic",ownedBy:"local",created:null,kind:"chat"},{id:"mock:hash-64",ownedBy:"local",created:null,kind:"embedding"}];
    this.cache={key,at:Date.now(),models};return models;
  }
  async test():Promise<{ok:boolean;detail:string}>{
    const provider=getAiProvider(),health=await provider.health();
    if(!health.ok)return health;
    try{const answer=await provider.answer("你是连接测试助手。","只回复 OK");return{ok:Boolean(answer.trim()),detail:`${provider.name} 已完成真实对话测试`};}
    catch(error){return{ok:false,detail:error instanceof Error?error.message:"所选模型调用失败"};}
  }
}
