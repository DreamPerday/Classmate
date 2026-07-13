import{NativeEventEmitter,NativeModules}from"react-native";

export type AsrLanguage="zh"|"en"|"auto";
export const ASR_LANGUAGES:{value:AsrLanguage;label:string;hint:string}[]=[
{value:"zh",label:"中文优先",hint:"适合中文课堂，识别更快更准"},
{value:"en",label:"英语优先",hint:"适合英语课堂或纯英文内容"},
{value:"auto",label:"自动检测",hint:"自动判断语言，适合中英混合但稍慢"},
];
export type SystemCaptureStatus={supported:boolean;apiLevel:number;modelReady:boolean;modelBundled:boolean;modelDownloading:boolean;modelName:string;modelSize:number;asrLanguage:string;overlayGranted:boolean;overlayVisible:boolean;active:boolean;phase:"idle"|"requesting"|"capturing"|"silent"|"error";startedAt:number;elapsedMs:number;partialText:string;error:string;capturedBytes:number;pendingSegments:number};
export type SystemCaptureSegment={id:string;text:string;startMs:number;endMs:number;createdAt:string};
export type ModelProgress={phase:"downloading"|"verifying"|"unpacking"|"ready";downloaded:number;total:number};

type NativeCapture={getStatus():Promise<SystemCaptureStatus>;requestCapture(showOverlay:boolean):Promise<SystemCaptureStatus>;stopCapture():Promise<boolean>;requestOverlayPermission():Promise<boolean>;downloadModel():Promise<SystemCaptureStatus>;deleteModel():Promise<SystemCaptureStatus>;listPendingSegments():Promise<SystemCaptureSegment[]>;acknowledgeSegment(id:string):Promise<boolean>;setAsrLanguage(language:string):Promise<boolean>;getAsrLanguage():Promise<string>;addListener(eventName:string):void;removeListeners(count:number):void};

const nativeCapture=(process.env.EXPO_OS==="android"?NativeModules.SystemCapture:null)as NativeCapture|null;
const emitter=nativeCapture?new NativeEventEmitter(nativeCapture as never):null;
const unsupported:SystemCaptureStatus={supported:false,apiLevel:0,modelReady:false,modelBundled:false,modelDownloading:false,modelName:"sherpa-onnx-whisper-tiny",modelSize:102000000,asrLanguage:"zh",overlayGranted:false,overlayVisible:false,active:false,phase:"idle",startedAt:0,elapsedMs:0,partialText:"",error:"",capturedBytes:0,pendingSegments:0};

export async function getSystemCaptureStatus(){return nativeCapture?nativeCapture.getStatus():unsupported;}
export async function requestSystemCapture(showOverlay:boolean){if(!nativeCapture)throw new Error("当前平台不支持其他 App 的系统音频捕获");return nativeCapture.requestCapture(showOverlay);}
export async function stopSystemCapture(){if(!nativeCapture)return false;return nativeCapture.stopCapture();}
export async function requestOverlayPermission(){if(!nativeCapture)return false;return nativeCapture.requestOverlayPermission();}
export async function downloadLocalAsrModel(){if(!nativeCapture)throw new Error("当前平台不支持本地系统音频识别");return nativeCapture.downloadModel();}
export async function deleteLocalAsrModel(){if(!nativeCapture)return unsupported;return nativeCapture.deleteModel();}
export async function listPendingCaptureSegments(){return nativeCapture?nativeCapture.listPendingSegments():[];}
export async function acknowledgeCaptureSegment(id:string){if(nativeCapture)await nativeCapture.acknowledgeSegment(id);}
export async function setAsrLanguage(language:string){if(!nativeCapture)return false;return nativeCapture.setAsrLanguage(language);}
export async function getAsrLanguage(){return nativeCapture?nativeCapture.getAsrLanguage():"zh";}
export function onSystemCaptureStatus(listener:(status:SystemCaptureStatus)=>void){return emitter?.addListener("systemCaptureStatus",listener)??{remove(){}};}
export function onSystemCaptureSegment(listener:(segment:SystemCaptureSegment)=>void){return emitter?.addListener("systemCaptureSegment",listener)??{remove(){}};}
export function onModelProgress(listener:(progress:ModelProgress)=>void){return emitter?.addListener("systemCaptureModelProgress",listener)??{remove(){}};}
