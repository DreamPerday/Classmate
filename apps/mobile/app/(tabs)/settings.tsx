import{useEffect,useState}from"react";
import{AppState,Pressable,ScrollView,StyleSheet,Text,TextInput,View}from"react-native";
import{useMutation,useQuery,useQueryClient}from"@tanstack/react-query";
import{Ionicons}from"@expo/vector-icons";
import{ActionButton}from"@/components/ui/action-button";
import{ErrorNotice,LoadingState}from"@/components/ui/states";
import{CourseTransferSection}from"@/components/course-transfer-section";
import{colors,spacing}from"@/constants/theme";
import{listEmbeddingModels,listModels,loadAiSettings,storeAiSettings,testEmbeddingModel,testSelectedModel}from"@/services/ai";
import{reindexEmbeddings}from"@/services/database";
import{ASR_LANGUAGES,deleteLocalAsrModel,downloadLocalAsrModel,getSystemCaptureStatus,onModelProgress,requestOverlayPermission,setAsrLanguage,type AsrLanguage,type ModelProgress}from"@/services/system-capture";
import type{AiProvider}from"@/types/domain";

export default function SettingsScreen(){
  const queryClient=useQueryClient();
  const settings=useQuery({queryKey:["mobile-ai-settings"],queryFn:loadAiSettings});
  const capture=useQuery({queryKey:["system-capture"],queryFn:getSystemCaptureStatus});
  const[baseUrl,setBaseUrl]=useState("https://ztoken.zlux.top/v1");
  const[chatModel,setChatModel]=useState("gpt-5.5");
  const[embeddingModel,setEmbeddingModel]=useState("local:BAAI/bge-small-zh-v1.5");
  const[provider,setProvider]=useState<AiProvider>("openai");
  const[apiKey,setApiKey]=useState("");
  const[models,setModels]=useState<string[]>([]);
  const[embeddingModels,setEmbeddingModels]=useState<string[]>([]);
  const[modelProgress,setModelProgress]=useState<ModelProgress>();

  useEffect(()=>{if(settings.data){setBaseUrl(settings.data.baseUrl);setChatModel(settings.data.chatModel);setEmbeddingModel(settings.data.embeddingModel);setProvider(settings.data.provider);}},[settings.data]);
  useEffect(()=>{
    const progress=onModelProgress(setModelProgress);
    const appState=AppState.addEventListener("change",state=>{if(state==="active")void capture.refetch();});
    return()=>{progress.remove();appState.remove();};
  },[capture]);

  const persist=async()=>{
    const value=await storeAiSettings({baseUrl,chatModel,embeddingModel,provider,apiKey});
    setApiKey("");
    queryClient.setQueryData(["mobile-ai-settings"],value);
    return value;
  };
  const save=useMutation({mutationFn:persist});
  const refresh=useMutation({mutationFn:async()=>{await persist();const values=await listModels();setModels(values);return values;}});
  const refreshEmbedding=useMutation({mutationFn:async()=>{await persist();const values=await listEmbeddingModels();setEmbeddingModels(values);return values;}});
  const reindex=useMutation({mutationFn:async()=>{await persist();return reindexEmbeddings();}});
  const test=useMutation({mutationFn:async()=>{await persist();const chatResult=await testSelectedModel();const embedResult=await testEmbeddingModel();return`${chatResult} · ${embedResult}`;}});
  const modelDownload=useMutation({mutationFn:downloadLocalAsrModel,onSuccess:value=>{setModelProgress(undefined);queryClient.setQueryData(["system-capture"],value);}});
  const modelDelete=useMutation({mutationFn:deleteLocalAsrModel,onSuccess:value=>queryClient.setQueryData(["system-capture"],value)});
  const overlay=useMutation({mutationFn:requestOverlayPermission});
  const changeLanguage=useMutation({mutationFn:(lang:string)=>setAsrLanguage(lang),onSuccess:()=>queryClient.invalidateQueries({queryKey:["system-capture"]})});

  if(settings.isLoading||capture.isLoading)return <LoadingState/>;
  const error=save.error||refresh.error||refreshEmbedding.error||test.error||reindex.error||modelDownload.error||modelDelete.error||overlay.error||changeLanguage.error;
  const local=capture.data!;
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.security}>
      <Ionicons name="shield-checkmark-outline" size={22} color={colors.success}/>
      <View style={styles.securityBody}><Text style={styles.securityTitle}>个人 BYOK 模式</Text><Text style={styles.securityText}>密钥只写入设备 SecureStore；中转仅接收字幕文本、问题和报告上下文，不接收音频。</Text></View>
    </View>
    <View style={styles.providerRow}><Pressable accessibilityRole="radio" accessibilityState={{checked:provider==="openai"}} onPress={()=>setProvider("openai")} style={[styles.providerBtn,provider==="openai"&&styles.providerBtnActive]}><Text style={[styles.providerText,provider==="openai"&&styles.providerTextActive]}>直接调用 API</Text></Pressable><Pressable accessibilityRole="radio" accessibilityState={{checked:provider==="mock"}} onPress={()=>setProvider("mock")} style={[styles.providerBtn,provider==="mock"&&styles.providerBtnActive]}><Text style={[styles.providerText,provider==="mock"&&styles.providerTextActive]}>离线模拟</Text></Pressable></View>
    {provider==="mock"?<View style={styles.mockHint}><Ionicons name="information-circle-outline" size={15} color={colors.accent}/><Text style={styles.mockText}>mock 模式下无需 API Key，使用本地模拟响应验证完整流程</Text></View>:null}
    <Field label="API Base URL" value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" keyboardType="url"/>
    <Field label="API Key" value={apiKey} onChangeText={setApiKey} secureTextEntry autoCapitalize="none" placeholder={settings.data?.hasKey?"已安全保存，留空表示不修改":"输入你的 API Key"}/>
    <View style={styles.status}><View style={[styles.dot,{backgroundColor:settings.data?.hasKey?colors.success:colors.danger}]}/><Text style={styles.statusText}>{settings.data?.hasKey?"设备中已有密钥":"尚未保存密钥"}</Text></View>
    <Field label="聊天与理解模型" value={chatModel} onChangeText={setChatModel} autoCapitalize="none"/>
    <View style={styles.modelActions}><ActionButton label="获取上游模型" icon="refresh" variant="secondary" busy={refresh.isPending} onPress={()=>refresh.mutate()} disabled={refresh.isPending}/></View>
    {models.length>0&&<View style={styles.models}>{models.map(model=><Pressable accessibilityRole="radio" accessibilityState={{checked:chatModel===model}} key={model} onPress={()=>setChatModel(model)} style={[styles.model,chatModel===model&&styles.modelSelected]}><Ionicons name={chatModel===model?"radio-button-on":"radio-button-off"} size={17} color={chatModel===model?colors.primary:colors.muted}/><Text style={[styles.modelText,chatModel===model&&styles.modelTextSelected]}>{model}</Text></Pressable>)}</View>}

    <Field label="向量模型" value={embeddingModel} onChangeText={setEmbeddingModel} autoCapitalize="none"/>
    <View style={styles.modelActions}><ActionButton label="获取向量模型" icon="refresh" variant="secondary" busy={refreshEmbedding.isPending} onPress={()=>refreshEmbedding.mutate()} disabled={refreshEmbedding.isPending}/><ActionButton label="重建检索索引" icon="sync-outline" variant="secondary" busy={reindex.isPending} onPress={()=>reindex.mutate()} disabled={reindex.isPending}/></View>
    {embeddingModels.length>0&&<View style={styles.models}>{embeddingModels.map(model=><Pressable accessibilityRole="radio" accessibilityState={{checked:embeddingModel===model}} key={model} onPress={()=>setEmbeddingModel(model)} style={[styles.model,embeddingModel===model&&styles.modelSelected]}><Ionicons name={embeddingModel===model?"radio-button-on":"radio-button-off"} size={17} color={embeddingModel===model?colors.primary:colors.muted}/><Text style={[styles.modelText,embeddingModel===model&&styles.modelTextSelected]}>{model}</Text></Pressable>)}</View>}
    {reindex.isSuccess?<View style={styles.success}><Ionicons name="checkmark-circle" size={18} color={colors.success}/><Text style={styles.successText}>检索索引已按当前向量模型重建</Text></View>:null}

    <View style={styles.localSection}>
      <View style={styles.localHeader}><Ionicons name="hardware-chip-outline" size={21} color={colors.primary}/><View style={styles.localBody}><Text style={styles.localTitle}>设备内语音识别</Text><Text style={styles.localText}>{!local.supported?"当前平台不支持其他 App 系统音频捕获":local.modelBundled?"Whisper tiny 多语言 · 已内置":local.modelReady?`${local.modelName} · 已安装`:modelProgress?progressText(modelProgress):"Whisper tiny 多语言 · 约 117 MB"}</Text></View></View>
      {local.supported&&local.modelReady?<View style={styles.langSection}><Text style={styles.langLabel}>识别语言</Text>{ASR_LANGUAGES.map(opt=><Pressable accessibilityRole="radio" accessibilityState={{checked:local.asrLanguage===opt.value}} key={opt.value} onPress={()=>changeLanguage.mutate(opt.value)} style={[styles.model,local.asrLanguage===opt.value&&styles.modelSelected]}><Ionicons name={local.asrLanguage===opt.value?"radio-button-on":"radio-button-off"} size={17} color={local.asrLanguage===opt.value?colors.primary:colors.muted}/><View style={styles.langText}><Text style={[styles.modelText,local.asrLanguage===opt.value&&styles.modelTextSelected]}>{opt.label}</Text><Text style={styles.langHint}>{opt.hint}</Text></View></Pressable>)}</View>:null}
      {local.supported?<View style={styles.localActions}>{local.modelBundled?null:local.modelReady?<ActionButton label="删除模型" icon="trash-outline" variant="secondary" busy={modelDelete.isPending} onPress={()=>modelDelete.mutate()} disabled={local.active||modelDelete.isPending}/>:<ActionButton label={modelDownload.isPending?"下载中":"下载本地模型"} icon="download-outline" variant="secondary" busy={modelDownload.isPending} onPress={()=>modelDownload.mutate()} disabled={modelDownload.isPending}/>}{!local.overlayGranted&&<ActionButton label="允许悬浮窗" icon="albums-outline" variant="secondary" busy={overlay.isPending} onPress={()=>overlay.mutate()} disabled={overlay.isPending}/>}</View>:null}
      {local.supported&&<View style={styles.boundary}><Ionicons name={local.overlayGranted?"checkmark-circle-outline":"notifications-outline"} size={16} color={local.overlayGranted?colors.success:colors.muted}/><Text style={styles.boundaryText}>{local.overlayGranted?"捕获时显示可拖动悬浮窗":"未授权悬浮窗时使用持续通知控制"}</Text></View>}
    </View>

    <CourseTransferSection/>

    {error?<ErrorNotice message={error.message}/>:null}
    {test.data?<View style={styles.success}><Ionicons name="checkmark-circle" size={18} color={colors.success}/><Text style={styles.successText}>所选模型已完成真实请求：{test.data.slice(0,40)}</Text></View>:null}
    <View style={styles.footer}><ActionButton label="保存设置" icon="save-outline" onPress={()=>save.mutate()} busy={save.isPending} disabled={!baseUrl.trim()||!chatModel.trim()}/><ActionButton label="保存并测试" icon="pulse-outline" variant="secondary" onPress={()=>test.mutate()} busy={test.isPending} disabled={!baseUrl.trim()||!chatModel.trim()}/></View>
    <Text style={styles.privacy}>Android 只捕获源 App 允许录制的播放音频；DRM 或受保护内容不会被绕过。</Text>
  </ScrollView>;
}

function Field(props:React.ComponentProps<typeof TextInput>&{label:string}){const{label,...input}=props;return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...input} placeholderTextColor="#939a94" style={styles.input}/></View>}
const progressText=(value:ModelProgress)=>value.phase==="downloading"?`下载 ${Math.min(100,Math.round(value.downloaded/value.total*100))}%`:value.phase==="verifying"?"正在校验完整性":value.phase==="unpacking"?"正在安装模型":"模型已就绪";
const styles=StyleSheet.create({page:{padding:spacing.md,paddingBottom:48},security:{flexDirection:"row",gap:11,borderTopWidth:1,borderBottomWidth:1,borderColor:colors.line,backgroundColor:colors.surface,padding:15,marginBottom:18},securityBody:{flex:1},securityTitle:{fontSize:14,fontWeight:"700",color:colors.ink},securityText:{marginTop:4,fontSize:11,lineHeight:18,color:colors.muted},field:{marginBottom:15},label:{marginBottom:7,fontSize:12,fontWeight:"700",color:colors.ink},input:{minHeight:48,borderWidth:1,borderColor:colors.line,borderRadius:7,backgroundColor:colors.surface,paddingHorizontal:13,fontSize:14,color:colors.ink},status:{marginTop:-7,marginBottom:15,flexDirection:"row",alignItems:"center",gap:6},dot:{width:8,height:8,borderRadius:4},statusText:{fontSize:10,color:colors.muted},modelActions:{marginTop:-7,marginBottom:10},models:{borderTopWidth:1,borderBottomWidth:1,borderColor:colors.line,backgroundColor:colors.surface,marginBottom:18},model:{minHeight:48,flexDirection:"row",alignItems:"center",gap:9,paddingHorizontal:12,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.line},modelSelected:{backgroundColor:colors.primarySoft},modelText:{fontSize:12,color:colors.ink},modelTextSelected:{fontWeight:"700",color:colors.primary},localSection:{borderTopWidth:1,borderBottomWidth:1,borderColor:colors.line,backgroundColor:colors.surface,padding:14,marginBottom:16},localHeader:{flexDirection:"row",gap:10,alignItems:"center"},localBody:{flex:1},localTitle:{fontSize:14,fontWeight:"700",color:colors.ink},localText:{marginTop:3,fontSize:10,color:colors.muted},localActions:{marginTop:12,flexDirection:"row",flexWrap:"wrap",gap:8},langSection:{marginTop:12,borderTopWidth:1,borderColor:colors.line,paddingTop:10},langLabel:{fontSize:12,fontWeight:"700",color:colors.ink,marginBottom:6},langText:{flex:1},langHint:{fontSize:10,color:colors.muted,marginTop:2},boundary:{marginTop:12,flexDirection:"row",alignItems:"center",gap:6},boundaryText:{flex:1,fontSize:10,lineHeight:16,color:colors.muted},success:{marginVertical:12,backgroundColor:"#eaf4ee",borderLeftWidth:2,borderLeftColor:colors.success,padding:12,flexDirection:"row",gap:8},successText:{flex:1,fontSize:11,lineHeight:17,color:colors.success},footer:{gap:8,marginTop:5},privacy:{marginTop:18,fontSize:10,lineHeight:17,color:colors.muted,textAlign:"center"},providerRow:{flexDirection:"row",gap:0,marginBottom:12,borderWidth:1,borderColor:colors.line,borderRadius:7,overflow:"hidden"},providerBtn:{flex:1,minHeight:44,alignItems:"center",justifyContent:"center",backgroundColor:colors.surface},providerBtnActive:{backgroundColor:colors.primary},providerText:{fontSize:12,fontWeight:"600",color:colors.muted},providerTextActive:{color:"#fff"},mockHint:{flexDirection:"row",alignItems:"center",gap:6,marginBottom:12},mockText:{flex:1,fontSize:10,lineHeight:16,color:colors.accent}});
