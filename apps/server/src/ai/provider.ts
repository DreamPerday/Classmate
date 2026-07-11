import OpenAI from "openai";
import { config } from "../shared/config.js";
import { DependencyError, ValidationError } from "../shared/errors.js";
import { SemanticBatchSchema, type SemanticBatch } from "./schemas.js";
import { AiSettingsRepository, normalizeOpenAiBaseUrl, type AiRuntimeSettings } from "./settings.repository.js";
import { localEmbed } from "./local-embedding.js";
import { zodToJsonSchema } from "zod-to-json-schema";

export interface AiProvider {
  readonly name: string;
  readonly embeddingName: string;
  extract(input: string): Promise<SemanticBatch>;
  embed(texts: string[]): Promise<number[][]>;
  answer(system: string, prompt: string): Promise<string>;
  health(): Promise<{ ok: boolean; detail: string }>;
}

const extractionJsonSchema=JSON.stringify(zodToJsonSchema(SemanticBatchSchema,"SemanticBatch"));
const extractionSystem = `你是课堂事实抽取器。只根据提供的带ID字幕提取，不使用外部知识。每个事件和概念必须引用真实segmentId与原文短句。合并重复表达；不确定内容降低confidence。老师纠正前文时输出CORRECTION。截止日期仅保留原话，不自行编造绝对日期。
只输出一个JSON对象，不得输出Markdown或解释。必须严格匹配下面的JSON Schema，不得改字段名、改变字段类型或创造枚举值。没有内容时使用空数组；topic只能是字符串或null。事件type只能是KEYPOINT、DEFINITION、EXAMPLE、EMPHASIS、TASK、HOMEWORK、EXAM、DEADLINE、TOPIC_CHANGE、QUESTION、CORRECTION之一。
JSON Schema:${extractionJsonSchema}`;

function parseBatch(raw: string): SemanticBatch {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return SemanticBatchSchema.parse(JSON.parse(cleaned)); }
  catch (error) { throw new ValidationError(`模型返回的语义批次无效: ${error instanceof Error ? error.message : String(error)}`); }
}

class OllamaProvider implements AiProvider {
  readonly name:string;
  readonly embeddingName:string;
  constructor(private readonly settings:AiRuntimeSettings){this.name=`ollama:${settings.chatModel}`;this.embeddingName=`ollama:${settings.embeddingModel}`;}
  private async call(path: string, body: unknown): Promise<any> {
    let response: Response;
    try { response = await fetch(`${this.settings.baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) }); }
    catch (error) { throw new DependencyError(`无法连接 Ollama: ${error instanceof Error ? error.message : String(error)}`); }
    if (!response.ok) throw new DependencyError(`Ollama 返回 ${response.status}: ${await response.text()}`);
    return response.json();
  }
  async extract(input: string): Promise<SemanticBatch> {
    const json = await this.call("/api/chat", { model: this.settings.chatModel, stream: false, format: "json", messages: [{ role: "system", content: extractionSystem }, { role: "user", content: input }], options: { temperature: 0.1 } });
    return parseBatch(json.message?.content ?? "");
  }
  async embed(texts: string[]): Promise<number[][]> {
    const json = await this.call("/api/embed", { model: this.settings.embeddingModel, input: texts });
    if (!Array.isArray(json.embeddings)) throw new ValidationError("Ollama embedding 响应缺少 embeddings");
    return json.embeddings;
  }
  async answer(system: string, prompt: string): Promise<string> {
    const json = await this.call("/api/chat", { model: this.settings.chatModel, stream: false, messages: [{ role: "system", content: system }, { role: "user", content: prompt }], options: { temperature: 0.2 } });
    return String(json.message?.content ?? "");
  }
  async health(): Promise<{ ok: boolean; detail: string }> {
    try { const response = await fetch(`${this.settings.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) }); return { ok: response.ok, detail: response.ok ? this.name : `HTTP ${response.status}` }; }
    catch { return { ok: false, detail: "Ollama 未运行" }; }
  }
}

class OpenAiProvider implements AiProvider {
  readonly name:string;
  readonly embeddingName:string;
  private readonly client: OpenAI;
  constructor(private readonly settings:AiRuntimeSettings) {
    if (!config.ai.openaiApiKey || !settings.chatModel) throw new DependencyError("OPENAI_API_KEY 和聊天模型必须同时配置");
    this.name=`openai:${settings.chatModel}`;
    this.embeddingName=settings.embeddingModel.startsWith("local:")?settings.embeddingModel:`openai:${settings.embeddingModel}`;
    this.client = new OpenAI({ apiKey: config.ai.openaiApiKey, baseURL: settings.baseUrl });
  }
  async extract(input: string): Promise<SemanticBatch> {
    const raw=await this.chat(extractionSystem,input,.1,true);try{return parseBatch(raw);}catch(error){const repaired=await this.chat(extractionSystem,`原始带ID字幕：\n${input}\n\n上一次输出未通过校验：\n${raw}\n\n校验错误：\n${error instanceof Error?error.message:String(error)}\n\n请重新输出完整且严格符合Schema的JSON对象。`,0,true);return parseBatch(repaired);}
  }
  async embed(texts: string[]): Promise<number[][]> { if(this.settings.embeddingModel.startsWith("local:"))return localEmbed(this.settings.embeddingModel.slice(6),texts);const response = await this.client.embeddings.create({ model: this.settings.embeddingModel, input: texts }); return response.data.map((item) => item.embedding); }
  async answer(system: string, prompt: string): Promise<string> { return this.chat(system,prompt,.2); }
  async health(): Promise<{ ok: boolean; detail: string }> {
    try { await this.client.models.list(); return { ok: true, detail: this.name }; }
    catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 401) return { ok: false, detail: "API 密钥无效或已过期" };
      if (status === 404) return { ok: false, detail: `上游 ${this.settings.baseUrl} 不支持 /models 或端点不存在` };
      if (status === 429) return { ok: false, detail: "上游限流，稍后重试" };
      if (status && status >= 500) return { ok: false, detail: `上游服务异常 HTTP ${status}` };
      const message = error instanceof Error ? error.message : String(error);
      if (/connect|timeout|ECONN|ENOTFOUND|fetch failed/i.test(message)) return { ok: false, detail: `无法连接上游：${message}` };
      return { ok: false, detail: message };
    }
  }
  private async chat(system:string,prompt:string,temperature:number,json=false):Promise<string>{
    if(this.settings.apiFormat==="openai-responses")return this.chatViaResponses(system,prompt,temperature,json);
    const request={model:this.settings.chatModel,messages:[{role:"system" as const,content:system},{role:"user" as const,content:prompt}],temperature};
    let response;try{response=await this.client.chat.completions.create(json?{...request,response_format:{type:"json_object" as const}}:request);}catch(error){if(!json)throw error;response=await this.client.chat.completions.create(request);}
    const content=response.choices[0]?.message.content;if(!content)throw new DependencyError("上游模型返回了空内容");return content;
  }
  private async chatViaResponses(system:string,prompt:string,temperature:number,json:boolean):Promise<string>{
    const baseUrl=normalizeOpenAiBaseUrl(this.settings.baseUrl);
    const body:Record<string,unknown>={model:this.settings.chatModel,instructions:system,input:prompt,temperature};
    if(json)body.text={format:{type:"json_object"}};
    let response:Response;try{response=await fetch(`${baseUrl}/responses`,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${config.ai.openaiApiKey}`},body:JSON.stringify(body),signal:AbortSignal.timeout(120_000)});}
    catch(error){throw new DependencyError(`上游 Responses API 请求失败: ${error instanceof Error?error.message:String(error)}`);}
    if(!response.ok){const text=await response.text().catch(()=>"");throw new DependencyError(`Responses API 返回 ${response.status}: ${text.slice(0,200)}`);}
    const data=await response.json() as any;
    if(typeof data.output_text==="string"&&data.output_text)return data.output_text;
    const blocks=Array.isArray(data.output)?data.output:[];
    for(const block of blocks){if(block?.type==="message"&&Array.isArray(block.content)){for(const part of block.content){if(part?.type==="output_text"&&typeof part.text==="string")return part.text;}}if(typeof block?.text==="string")return block.text;}
    throw new DependencyError("Responses API 未返回可解析的文本内容");
  }
}

class ClaudeProvider implements AiProvider {
  readonly name:string;
  readonly embeddingName:string;
  constructor(private readonly settings:AiRuntimeSettings) {
    if (!config.ai.openaiApiKey || !settings.chatModel) throw new DependencyError("API Key 和聊天模型必须同时配置");
    this.name=`claude:${settings.chatModel}`;
    this.embeddingName=settings.embeddingModel.startsWith("local:")?settings.embeddingModel:`openai:${settings.embeddingModel}`;
  }
  private get baseUrl():string{return normalizeOpenAiBaseUrl(this.settings.baseUrl);}
  private get headers():Record<string,string>{return{"content-type":"application/json","x-api-key":config.ai.openaiApiKey??"","anthropic-version":"2023-06-01"};}
  private async callMessages(system:string,prompt:string,temperature:number,maxTokens=4096):Promise<string>{
    const body={model:this.settings.chatModel,max_tokens:maxTokens,system,messages:[{role:"user"as const,content:prompt}],temperature};
    let response:Response;try{response=await fetch(`${this.baseUrl}/messages`,{method:"POST",headers:this.headers,body:JSON.stringify(body),signal:AbortSignal.timeout(120_000)});}
    catch(error){throw new DependencyError(`Claude API 请求失败: ${error instanceof Error?error.message:String(error)}`);}
    if(!response.ok){const text=await response.text().catch(()=>"");throw new DependencyError(`Claude API 返回 ${response.status}: ${text.slice(0,200)}`);}
    const data=await response.json() as any;
    const blocks=Array.isArray(data.content)?data.content:[];
    for(const block of blocks){if(block?.type==="text"&&typeof block.text==="string")return block.text;}
    throw new DependencyError("Claude API 未返回文本内容");
  }
  async extract(input: string): Promise<SemanticBatch> {
    const raw=await this.callMessages(extractionSystem,input,.1);try{return parseBatch(raw);}catch(error){const repaired=await this.callMessages(extractionSystem,`原始带ID字幕：\n${input}\n\n上一次输出未通过校验：\n${raw}\n\n校验错误：\n${error instanceof Error?error.message:String(error)}\n\n请重新输出完整且严格符合Schema的JSON对象。`,0);return parseBatch(repaired);}
  }
  async embed(texts: string[]): Promise<number[][]> {
    if(this.settings.embeddingModel.startsWith("local:"))return localEmbed(this.settings.embeddingModel.slice(6),texts);
    const response=await fetch(`${this.baseUrl}/embeddings`,{method:"POST",headers:{...this.headers,"x-api-key":config.ai.openaiApiKey??""},body:JSON.stringify({model:this.settings.embeddingModel,input:texts}),signal:AbortSignal.timeout(60_000)}).catch(error=>{throw new DependencyError(`Claude/中转 Embedding 请求失败: ${error instanceof Error?error.message:String(error)}`);});
    if(!response.ok){const errorText=await response.text().catch(()=>"");throw new DependencyError(`Embedding 接口返回 ${response.status}: ${errorText.slice(0,200)}`);}
    const data=await response.json() as any;return(data.data??[]).map((item:{embedding?:number[]})=>item.embedding??[]);
  }
  async answer(system: string, prompt: string): Promise<string> { return this.callMessages(system,prompt,.2); }
  async health(): Promise<{ ok: boolean; detail: string }> {
    try{const response=await fetch(`${this.baseUrl}/models`,{headers:this.headers,signal:AbortSignal.timeout(10_000)});
      if(!response.ok)return{ok:false,detail:`Claude API /models 返回 ${response.status}`};
      return{ok:true,detail:this.name};
    }catch(error){const message=error instanceof Error?error.message:String(error);
      if(/connect|timeout|ECONN|ENOTFOUND|fetch failed/i.test(message))return{ok:false,detail:`无法连接上游：${message}`};
      return{ok:false,detail:message};
    }
  }
}

class MockProvider implements AiProvider {
  readonly name = "mock:deterministic";
  readonly embeddingName = "mock:hash-64";
  async extract(input: string): Promise<SemanticBatch> {
    const matches = [...input.matchAll(/^\[([^\]]+)\]\s+\d{2}:\d{2}-\d{2}:\d{2}:\s*(.+)$/gm)];
    const first = matches[0]; if (!first) return { topic: null, events: [], concepts: [], relations: [] };
    const values=matches.map(match=>{const text=match[2]??"课堂内容",name=text.match(/(?:重点|学习|介绍|掌握)([^，。]{2,20})/)?.[1]??text.slice(0,16),task=/(?:作业|提交|截止|需要.*完成|完成.*练习|报告需要)/.test(text);return{text,name,task,segmentId:match[1]!};});
    return { topic: values[0]!.name, events: values.map(value=>({ type: value.task ? "HOMEWORK" : "KEYPOINT", title: value.name, content: value.text, importance: 8, confidence: 0.9, deadlineRaw: value.task && value.text.includes("周五") ? "周五" : null, evidence: [{ segmentId: value.segmentId, quote: value.text }] })), concepts: values.map(value=>({ name:value.name, kind:value.task?"task":"concept", definition:value.text, importance:8, confidence:.9, evidenceSegmentIds:[value.segmentId] })), relations: values.slice(1).map(value=>({source:value.name,target:values[0]!.name,relation:value.task?"ASSIGNED_IN":"RELATED_TO",weight:.8,evidenceSegmentId:value.segmentId})) };
  }
  async embed(texts: string[]): Promise<number[][]> { return texts.map((text) => Array.from({ length: 64 }, (_, i) => [...text].reduce((sum, char, j) => sum + (j % 64 === i ? char.codePointAt(0)! / 65535 : 0), 0))); }
  async answer(system: string, prompt: string): Promise<string> {
    if(system.includes("学习报告编辑"))return mockComprehensiveReport(prompt);
    if(system.includes("课堂日报维护器"))return mockDailySummary(prompt);
    return `根据课堂记录：${prompt.slice(0, 800)}`;
  }
  async health(): Promise<{ ok: boolean; detail: string }> { return { ok: true, detail: this.name }; }
}

function mockDailySummary(prompt:string):string{
  const additions=prompt.split("新增有证据事件：")[1]?.trim()??"暂无新增事件";
  return `## 今日主题\n${prompt.match(/课堂：([^\n]+)/)?.[1]??"课堂学习"}\n\n## 核心知识\n${additions}\n\n## 老师强调\n以重要度较高且有字幕引用的事件为准。\n\n## 任务与截止日期\n保留老师原话；未解析日期的任务需要人工确认。\n\n## 待确认项\n识别置信度较低或缺少明确时间的信息需回听原始音频。`;
}

function mockComprehensiveReport(prompt:string):string{
  const sessions=[...prompt.matchAll(/^## 第(\d+)课次\s+([^\n]+)([\s\S]*?)(?=^## 第\d+课次|^## 任务证据|$)/gm)].map(match=>({index:Number(match[1]),title:match[2]!.trim(),body:match[3]!.trim()}));
  const course=prompt.match(/课程：([^\n]+)/)?.[1]??"课程实训";
  const sessionText=sessions.map(({index,title,body})=>{const facts=body.split("\n").filter(line=>line.startsWith("- [")).slice(0,3).map(line=>line.replace(/^- \[[^\]]+\]\s*/,"")).join("；")||"本次课堂事件尚未形成稳定摘要。";return `### 第 ${index} 课次：${title}\n本次课堂围绕“${title}”展开。根据课堂事件记录，主要内容包括：${facts}这些内容构成了知识理解和实践安排的直接依据。学习过程中，我先从老师给出的概念或示例中辨认核心对象，再结合上下文梳理它与前序知识的联系，最后把需要完成的练习单独登记，避免把知识说明与任务要求混在一起。\n\n从个人理解来看，“${title}”需要放回整个${course}的知识体系中分析。本次记录帮助我形成“概念定义、适用场景、实践要求、证据位置”四个维度的笔记结构。对于尚未在字幕中给出明确结论的部分，我没有自行补写，而是保留为后续回听和查证事项。`}).join("\n\n");
  const scope=prompt.match(/报告范围：([^\n]+)/)?.[1]??"全部已记录课堂";
  return `# ${course}综合学习报告\n\n## 一、学习目标\n本报告依据${scope}的课堂学习与实践记录，建立对${course}核心知识的系统理解。学习不只关注结论记忆，还强调从课堂原话中识别定义、重点、示例、纠正和任务，并将这些内容整理为能够回溯到时间戳的材料。报告中的课程事实均来自字幕、课堂事件或增量摘要；个人体会则作为学习者反思单独表述。\n\n## 二、学习环境与方法\n学习资料由 Windows 系统音频采集、语音识别、课堂事件抽取、本地数据库、检索和知识图谱共同形成。原始字幕保持不可变，摘要和图谱属于可重新生成的派生层。整理流程采用“实时记录、课次归纳、跨次关联、最终复核”，不要求课程具有固定天数，也不为不存在的课次补写内容。\n\n## 三、逐次学习内容\n${sessionText}\n\n## 四、核心知识体系\n已记录课堂呈现出由基础概念、结构原理、操作方法和综合实践组成的知识路径。知识图谱用于归并同义概念并表达相关、从属、前置和任务归属关系；词法与向量检索共同定位术语、老师原话和语义相近内容，所有结论仍需回到字幕时间戳复核。\n\n## 五、任务与实践\n课堂任务独立保存老师原话、重要度、置信度、解析日期和证据事件。相对日期保留原始表述，不确定结果标记为需要确认。报告不会根据老师布置任务推断学生已经完成，只描述课堂提出的实践安排和用户明确确认的状态。\n\n## 六、学习反思\n课堂学习的难点往往不在信息数量，而在信息之间缺少稳定联系。通过知识节点、关系和证据引用，可以从某一重点回到老师原话，再查看它与其他主题的关联。自动识别不能替代个人审核，专业术语、相对日期和示例边界都需要结合音频复核。\n\n## 七、总结\n本次报告形成了从音频、字幕、课堂事件、知识图谱、增量摘要到综合报告的完整资料链。它保留可回溯的原始证据，也提供面向复习和写作的结构化结果。后续应继续回听低置信度片段、修订专业术语、补充个人实践结果，并在确认事实后形成最终提交版本。`;
}

let provider: AiProvider | undefined;let providerKey="";
export function getAiProvider(): AiProvider {
  const settings=new AiSettingsRepository().get(),key=JSON.stringify([settings.provider,settings.baseUrl,settings.chatModel,settings.embeddingModel,settings.apiFormat]);
  if (provider&&providerKey===key) return provider;
  providerKey=key;
  if(settings.provider==="ollama")provider=new OllamaProvider(settings);
  else if(settings.provider==="openai"){
    if(settings.apiFormat==="claude")provider=new ClaudeProvider(settings);
    else provider=new OpenAiProvider(settings);
  }else provider=new MockProvider();
  return provider;
}
