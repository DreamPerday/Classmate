import{useCallback,useEffect,useRef,useState}from"react";
import{Alert,AppState,PermissionsAndroid,Pressable,ScrollView,StyleSheet,Text,TextInput,View}from"react-native";
import{useMutation,useQuery,useQueryClient}from"@tanstack/react-query";
import{Ionicons}from"@expo/vector-icons";
import*as Clipboard from"expo-clipboard";
import{ActionButton}from"@/components/ui/action-button";
import{EmptyState,ErrorNotice,LoadingState}from"@/components/ui/states";
import{MarkdownText}from"@/components/ui/markdown";
import{colors,spacing}from"@/constants/theme";
import{applyAnalysis,createCourse,createSession,deleteCourse,deleteSession,getDashboard,getSessionSummary,getSessionTranscripts,insertCapturedTranscript,insertTranscript,saveSessionSummary,setActiveCourse,setActiveSession}from"@/services/database";
import{analyzeTranscript,generateSessionSummary}from"@/services/ai";
import{exportSummaryMarkdown}from"@/services/report-export";
import{acknowledgeCaptureSegment,downloadLocalAsrModel,getSystemCaptureStatus,listPendingCaptureSegments,onModelProgress,onSystemCaptureSegment,onSystemCaptureStatus,requestOverlayPermission,requestSystemCapture,stopSystemCapture,type ModelProgress,type SystemCaptureSegment}from"@/services/system-capture";

export default function ClassroomScreen(){
  const queryClient=useQueryClient();
  const dashboard=useQuery({queryKey:["mobile-dashboard"],queryFn:getDashboard});
  const capture=useQuery({queryKey:["system-capture"],queryFn:getSystemCaptureStatus,refetchInterval:query=>query.state.data?.active?1000:false});
  const[manual,setManual]=useState("");
  const[modelProgress,setModelProgress]=useState<ModelProgress>();
  const[captureError,setCaptureError]=useState("");
  const[courseInput,setCourseInput]=useState(false);
  const[courseName,setCourseName]=useState("");
  const attempted=useRef(new Set<string>());
  const[expandedSummary,setExpandedSummary]=useState(true);
  const[expandedTranscripts,setExpandedTranscripts]=useState(true);
  const[expandedEvents,setExpandedEvents]=useState(true);
  const[exportingSummary,setExportingSummary]=useState(false);

  const analyzeSegment=useCallback(async(segment:SystemCaptureSegment)=>{
    if(attempted.current.has(segment.id))return;
    attempted.current.add(segment.id);
    const transcript=await insertCapturedTranscript(segment);
    try{
      const analysis=await analyzeTranscript(transcript.text);
      await applyAnalysis(transcript,analysis);
      await acknowledgeCaptureSegment(segment.id);
      attempted.current.delete(segment.id);
      setCaptureError("");
      await queryClient.invalidateQueries({queryKey:["mobile-dashboard"]});
    }catch(error){
      setCaptureError(`字幕已保存在设备，AI 整理待重试：${message(error)}`);
      throw error;
    }
  },[queryClient]);

  const drainPending=useCallback(async()=>{
    const segments=await listPendingCaptureSegments();
    for(const segment of segments){
      if(attempted.current.has(segment.id))continue;
      try{await analyzeSegment(segment);}catch{break;}
    }
    await queryClient.invalidateQueries({queryKey:["system-capture"]});
  },[analyzeSegment,queryClient]);

  useEffect(()=>{
    const status=onSystemCaptureStatus(value=>queryClient.setQueryData(["system-capture"],value));
    const segment=onSystemCaptureSegment(value=>void analyzeSegment(value));
    const progress=onModelProgress(setModelProgress);
    const appState=AppState.addEventListener("change",state=>{if(state==="active"){void capture.refetch();void drainPending();}});
    void drainPending();
    return()=>{status.remove();segment.remove();progress.remove();appState.remove();};
  },[analyzeSegment,capture,drainPending,queryClient]);

  const manualProcess=useMutation({
    mutationFn:async(text:string)=>{
      const clean=text.trim();
      if(!clean)throw new Error("请输入有效课堂内容");
      const transcript=await insertTranscript(clean,0,Math.max(5000,clean.length*260));
      const analysis=await analyzeTranscript(clean);
      await applyAnalysis(transcript,analysis);
      return transcript;
    },
    onSuccess:async()=>{setManual("");await queryClient.invalidateQueries({queryKey:["mobile-dashboard"]});},
    onError:error=>Alert.alert("处理失败",message(error)),
  });
  const modelDownload=useMutation({
    mutationFn:downloadLocalAsrModel,
    onSuccess:value=>{setModelProgress(undefined);queryClient.setQueryData(["system-capture"],value);},
  });
  const switchCourse=useMutation({mutationFn:(id:string)=>setActiveCourse(id),onSuccess:()=>queryClient.invalidateQueries({queryKey:["mobile-dashboard"]})});
  const switchSession=useMutation({mutationFn:(id:string)=>setActiveSession(id),onSuccess:()=>queryClient.invalidateQueries({queryKey:["mobile-dashboard"]})});
  const newCourse=useMutation({mutationFn:(name:string)=>createCourse(name),onSuccess:()=>queryClient.invalidateQueries({queryKey:["mobile-dashboard"]})});
  const newSession=useMutation({mutationFn:(courseId:string)=>createSession(courseId),onSuccess:()=>queryClient.invalidateQueries({queryKey:["mobile-dashboard"]})});
  const summary=useQuery({queryKey:["session-summary",dashboard.data?.session.id],queryFn:()=>getSessionSummary(dashboard.data!.session.id),enabled:!!dashboard.data});
  const generateSummary=useMutation({
    mutationFn:async(sessionId:string)=>{
      const transcripts=await getSessionTranscripts(sessionId);
      const content=await generateSessionSummary(transcripts);
      await saveSessionSummary(sessionId,content,transcripts.map(t=>t.id));
      return content;
    },
    onSuccess:async()=>{await queryClient.invalidateQueries({queryKey:["session-summary"]});},
    onError:error=>Alert.alert("生成失败",message(error)),
  });
  const removeCourse=useMutation({mutationFn:(id:string)=>deleteCourse(id),onSuccess:()=>queryClient.invalidateQueries({queryKey:["mobile-dashboard"]})});
  const removeSession=useMutation({mutationFn:(id:string)=>deleteSession(id),onSuccess:()=>queryClient.invalidateQueries({queryKey:["mobile-dashboard"]})});

  function confirmDeleteCourse(id:string,name:string){
    Alert.alert("删除课程",`确定删除「${name}」及其所有课次、字幕、事件、知识和任务？此操作不可撤销。`,[{text:"取消",style:"cancel"},{text:"删除",style:"destructive",onPress:()=>removeCourse.mutate(id)}]);
  }
  function confirmDeleteSession(id:string,title:string){
    Alert.alert("删除课次",`确定删除「${title}」及其字幕、事件和任务？此操作不可撤销。`,[{text:"取消",style:"cancel"},{text:"删除",style:"destructive",onPress:()=>removeSession.mutate(id)}]);
  }
  async function copySummary(){
    if(!summary.data)return;
    await Clipboard.setStringAsync(summary.data.contentMd);
    Alert.alert("已复制","摘要内容已复制到剪贴板");
  }
  async function exportSummary(){
    if(!summary.data||!dashboard.data)return;
    setExportingSummary(true);
    try{await exportSummaryMarkdown(dashboard.data.session.title,summary.data.contentMd);}catch(error){Alert.alert("导出失败",message(error));}finally{setExportingSummary(false);}
  }

  async function toggleCapture(){
    try{
      const status=capture.data;
      if(status?.active){await stopSystemCapture();return;}
      if(!status?.supported)throw new Error("当前平台不支持其他 App 的系统音频捕获");
      if(!status.modelReady)throw new Error("本地语音识别模型未就绪，请在设置中检查");
      const audio=await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,{title:"允许本地识别系统音频",message:"Android 要求授予录音权限，Classmate 只读取允许捕获的播放音频，音频不会上传。",buttonPositive:"继续",buttonNegative:"取消"});
      if(audio!==PermissionsAndroid.RESULTS.GRANTED)throw new Error("未授予系统音频捕获权限");
      if(status.apiLevel>=33)await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      await requestSystemCapture(status.overlayGranted);
    }catch(error){setCaptureError(message(error));}
  }

  async function enableOverlay(){
    try{await requestOverlayPermission();}catch(error){setCaptureError(message(error));}
  }

  if(dashboard.isLoading||capture.isLoading)return <LoadingState/>;
  if(dashboard.error)return <View style={styles.page}><ErrorNotice message={message(dashboard.error)}/></View>;
  const data=dashboard.data!,status=capture.data!;
  const busy=manualProcess.isPending||modelDownload.isPending;

  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={[styles.statusDot,{backgroundColor:status.active?colors.danger:status.phase==="error"?colors.accent:colors.success}]}/>
        <View style={styles.heroText}>
          <Text style={styles.title}>{data.session.title}</Text>
          <Text style={styles.subtitle}>{captureLabel(status)}</Text>
        </View>
      </View>
      {status.supported?<View style={styles.actions}>
        <ActionButton label={status.active?"停止系统捕获":"开始系统捕获"} icon={status.active?"stop":"radio-outline"} variant={status.active?"danger":"primary"} onPress={toggleCapture} disabled={busy}/>
        {!status.overlayGranted&&<ActionButton label="启用悬浮窗" icon="albums-outline" variant="secondary" onPress={enableOverlay}/>} 
      </View>:null}
    </View>
    <View style={styles.selectorBar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
        {data.courses.map(course=><Pressable key={course.id} onPress={()=>switchCourse.mutate(course.id)} onLongPress={()=>confirmDeleteCourse(course.id,course.name)} delayLongPress={600} style={[styles.pill,course.id===data.course.id&&styles.pillActive]}><Text style={[styles.pillText,course.id===data.course.id&&styles.pillTextActive]}>{course.name}</Text></Pressable>)}
        {courseInput?<View style={styles.pillInputWrap}><TextInput value={courseName} onChangeText={setCourseName} placeholder="课程名" placeholderTextColor="#909891" style={styles.pillInput} autoFocus onSubmitEditing={()=>{if(courseName.trim()){newCourse.mutate(courseName.trim());setCourseName("");setCourseInput(false);}}}/><Pressable onPress={()=>{if(courseName.trim()){newCourse.mutate(courseName.trim());setCourseName("");setCourseInput(false);}}} hitSlop={8}><Ionicons name="checkmark-circle" size={18} color={colors.primary}/></Pressable></View>:<Pressable style={styles.pillAdd} onPress={()=>setCourseInput(true)}><Ionicons name="add" size={14} color={colors.muted}/><Text style={styles.pillAddText}>新课程</Text></Pressable>}
      </ScrollView>
    </View>
    <View style={styles.selectorBar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
        {data.sessions.map(session=><Pressable key={session.id} onPress={()=>switchSession.mutate(session.id)} onLongPress={()=>confirmDeleteSession(session.id,session.title)} delayLongPress={600} style={[styles.pill,session.id===data.session.id&&styles.pillActive]}><Text style={[styles.pillText,session.id===data.session.id&&styles.pillTextActive]}>{session.title}</Text></Pressable>)}
        <Pressable style={styles.pillAdd} onPress={()=>newSession.mutate(data.course.id)}><Ionicons name="add" size={14} color={colors.muted}/><Text style={styles.pillAddText}>新课次</Text></Pressable>
      </ScrollView>
    </View>
    <View style={styles.stats}>{[[data.stats.minutes.toFixed(0),"分钟"],[String(data.stats.concepts),"概念"],[String(data.stats.openTasks),"待办"],[String(data.stats.days),"天"]].map(([value,label])=><View key={label} style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>)}</View>

    {!status.supported&&<ErrorNotice message="iOS 不允许捕获其他 App 的系统音频，可继续手工添加字幕。"/>}
    {status.supported&&!status.modelReady&&<View style={styles.localModel}>
      <Ionicons name="hardware-chip-outline" size={20} color={colors.primary}/>
      <View style={styles.localModelBody}><Text style={styles.localModelTitle}>本地语音识别模型</Text><Text style={styles.localModelText}>{modelProgress?modelProgressLabel(modelProgress):"约 117 MB，仅保存在设备内"}</Text></View>
      <ActionButton label={modelDownload.isPending?"下载中":"下载"} icon="download-outline" variant="secondary" busy={modelDownload.isPending} onPress={()=>modelDownload.mutate()} disabled={modelDownload.isPending}/>
    </View>}
    {modelDownload.error&&<ErrorNotice message={message(modelDownload.error)}/>} 
    {status.partialText?<View style={styles.partial}><Text style={styles.partialLabel}>本地实时字幕</Text><Text style={styles.partialText}>{status.partialText}</Text></View>:null}
    {(captureError||status.error)&&<ErrorNotice message={captureError||captureErrorLabel(status.error)}/>} 
    {status.pendingSegments>0&&<Pressable accessibilityRole="button" style={styles.retry} onPress={()=>{attempted.current.clear();void drainPending();}}><Ionicons name="refresh" size={17} color={colors.primary}/><Text style={styles.retryText}>重试整理 {status.pendingSegments} 条本地字幕</Text></Pressable>}

    {data.transcripts.length>0&&<View>
      <Pressable accessibilityRole="button" style={styles.sectionHeader} onPress={()=>setExpandedSummary(v=>!v)}>
        <View style={styles.sectionLeft}><Ionicons name={expandedSummary?"chevron-down":"chevron-forward"} size={16} color={colors.muted}/><Text style={styles.sectionTitle}>本课摘要</Text></View>
        {summary.data&&expandedSummary&&!generateSummary.isPending?<View style={styles.sectionRight}>
          <Pressable accessibilityLabel="复制" hitSlop={8} onPress={copySummary}><Ionicons name="copy-outline" size={16} color={colors.primary}/></Pressable>
          <Pressable accessibilityLabel="导出" hitSlop={8} onPress={()=>void exportSummary()} disabled={exportingSummary}><Ionicons name="share-outline" size={16} color={exportingSummary?colors.muted:colors.primary}/></Pressable>
          <Pressable accessibilityLabel="重新生成" hitSlop={8} onPress={()=>generateSummary.mutate(data.session.id)}><Ionicons name="refresh" size={17} color={colors.primary}/></Pressable>
        </View>:summary.data&&!generateSummary.isPending?<Pressable accessibilityLabel="重新生成" hitSlop={8} onPress={()=>generateSummary.mutate(data.session.id)}><Ionicons name="refresh" size={17} color={colors.primary}/></Pressable>:null}
      </Pressable>
      {expandedSummary&&(generateSummary.isPending?<View style={styles.summaryBox}><Text style={styles.summaryText}>正在依据课堂字幕生成摘要…</Text></View>:summary.data?<View style={styles.summaryBox}><MarkdownText content={summary.data.contentMd}/></View>:<Pressable onPress={()=>generateSummary.mutate(data.session.id)} style={({pressed})=>[styles.summaryGenerate,{opacity:pressed?0.5:1}]}><Ionicons name="sparkles-outline" size={16} color={colors.primary}/><Text style={styles.summaryGenerateText}>生成本课摘要</Text></Pressable>)}
    </View>}

    <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>快速添加字幕</Text></View>
    <TextInput multiline value={manual} onChangeText={setManual} placeholder="粘贴或输入老师刚刚讲的内容" placeholderTextColor="#909891" style={styles.input}/>
    <Pressable disabled={!manual.trim()||manualProcess.isPending} onPress={()=>manualProcess.mutate(manual)} style={({pressed})=>[styles.addText,{opacity:pressed||!manual.trim()?0.5:1}]}>
      <Ionicons name="add-circle-outline" size={18} color={colors.primary}/><Text style={styles.addTextLabel}>{manualProcess.isPending?"正在整理":"保存并分析文字"}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" style={styles.sectionHeader} onPress={()=>setExpandedTranscripts(v=>!v)}>
      <View style={styles.sectionLeft}><Ionicons name={expandedTranscripts?"chevron-down":"chevron-forward"} size={16} color={colors.muted}/><Text style={styles.sectionTitle}>最近字幕</Text></View>
      <Text style={styles.sectionMeta}>{data.transcripts.length} 条</Text>
    </Pressable>
    {expandedTranscripts&&(data.transcripts.length?data.transcripts.slice(0,10).map(item=><View key={item.id} style={styles.transcript}><Text style={styles.time}>{formatMs(item.startMs)}</Text><Text style={styles.transcriptText}>{item.text}</Text></View>):<EmptyState title="还没有课堂字幕" detail="开始系统捕获或手工添加一段文字后会出现在这里。" icon="mic-outline"/>)}
    <Pressable accessibilityRole="button" style={styles.sectionHeader} onPress={()=>setExpandedEvents(v=>!v)}>
      <View style={styles.sectionLeft}><Ionicons name={expandedEvents?"chevron-down":"chevron-forward"} size={16} color={colors.muted}/><Text style={styles.sectionTitle}>课堂理解</Text></View>
    </Pressable>
    {expandedEvents&&(data.events.length?data.events.slice(0,8).map(event=><View key={event.id} style={styles.event}><View style={styles.eventTop}><Text style={styles.eventType}>{event.type}</Text><Text style={styles.importance}>{"重要度 "+String(event.importance)}</Text></View><Text style={styles.eventTitle}>{event.title}</Text><Text style={styles.eventContent} numberOfLines={3}>{event.content}</Text></View>):<EmptyState title="等待语义事件" detail="重点、定义、作业和截止时间会保留字幕证据。" icon="sparkles-outline"/>)}
  </ScrollView>;
}

const styles=StyleSheet.create({page:{padding:spacing.md,paddingBottom:48},hero:{borderTopWidth:1,borderBottomWidth:1,borderColor:colors.line,backgroundColor:colors.surface,padding:spacing.md},heroTop:{flexDirection:"row",alignItems:"center",gap:10},statusDot:{width:10,height:10,borderRadius:5},heroText:{flex:1},title:{fontSize:19,fontWeight:"700",color:colors.ink},subtitle:{marginTop:3,fontSize:12,color:colors.muted},actions:{marginTop:16,flexDirection:"row",flexWrap:"wrap",gap:8},stats:{flexDirection:"row",backgroundColor:colors.surfaceMuted,borderBottomWidth:1,borderColor:colors.line},stat:{flex:1,alignItems:"center",paddingVertical:13},statValue:{fontSize:18,fontWeight:"700",color:colors.primary},statLabel:{fontSize:10,color:colors.muted,marginTop:2},localModel:{marginTop:16,minHeight:72,padding:12,borderTopWidth:1,borderBottomWidth:1,borderColor:colors.line,backgroundColor:colors.surface,flexDirection:"row",alignItems:"center",gap:10},localModelBody:{flex:1},localModelTitle:{fontSize:13,fontWeight:"700",color:colors.ink},localModelText:{marginTop:3,fontSize:10,color:colors.muted},partial:{marginTop:16,padding:13,borderLeftWidth:2,borderLeftColor:colors.primary,backgroundColor:colors.primarySoft},partialLabel:{fontSize:10,fontWeight:"700",color:colors.primary},partialText:{marginTop:4,fontSize:14,lineHeight:21,color:colors.ink},retry:{minHeight:48,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7},retryText:{fontSize:12,fontWeight:"700",color:colors.primary},sectionHeader:{marginTop:24,marginBottom:10,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},sectionLeft:{flexDirection:"row",alignItems:"center",gap:6},sectionRight:{flexDirection:"row",alignItems:"center",gap:12},sectionTitle:{fontSize:15,fontWeight:"700",color:colors.ink},sectionMeta:{fontSize:11,color:colors.muted},input:{minHeight:88,maxHeight:150,borderWidth:1,borderColor:colors.line,borderRadius:7,backgroundColor:colors.surface,padding:12,fontSize:14,lineHeight:21,textAlignVertical:"top",color:colors.ink},addText:{minHeight:48,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7},addTextLabel:{fontSize:13,fontWeight:"700",color:colors.primary},transcript:{flexDirection:"row",gap:12,paddingVertical:12,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.line},time:{width:42,fontSize:11,color:colors.muted,fontVariant:["tabular-nums"]},transcriptText:{flex:1,fontSize:14,lineHeight:22,color:colors.ink},event:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.line,borderRadius:7,padding:14,marginBottom:8},eventTop:{flexDirection:"row",justifyContent:"space-between"},eventType:{fontSize:10,fontWeight:"800",color:colors.accent},importance:{fontSize:10,color:colors.muted},eventTitle:{marginTop:6,fontSize:14,fontWeight:"700",color:colors.ink},eventContent:{marginTop:4,fontSize:12,lineHeight:19,color:colors.muted},selectorBar:{borderBottomWidth:StyleSheet.hairlineWidth,borderColor:colors.line,backgroundColor:colors.surface},pillRow:{flexDirection:"row",alignItems:"center",gap:6,paddingHorizontal:spacing.md,paddingVertical:8},pill:{paddingHorizontal:12,paddingVertical:6,borderRadius:6,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface},pillActive:{backgroundColor:colors.primary,borderColor:colors.primary},pillText:{fontSize:12,color:colors.ink},pillTextActive:{color:"#fff",fontWeight:"600"},pillAdd:{flexDirection:"row",alignItems:"center",gap:3,paddingHorizontal:10,paddingVertical:6,borderRadius:6,borderWidth:1,borderColor:colors.line,borderStyle:"dashed"},pillAddText:{fontSize:11,color:colors.muted},pillInputWrap:{flexDirection:"row",alignItems:"center",gap:4,paddingHorizontal:8,paddingVertical:3,borderRadius:6,borderWidth:1,borderColor:colors.primary},pillInput:{fontSize:12,color:colors.ink,minWidth:80,paddingVertical:3,paddingHorizontal:4},summaryBox:{padding:14,borderLeftWidth:2,borderLeftColor:colors.primary,backgroundColor:colors.primarySoft,borderRadius:4},summaryText:{fontSize:13,lineHeight:20,color:colors.ink},summaryGenerate:{minHeight:48,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7,borderWidth:1,borderColor:colors.line,borderRadius:7,backgroundColor:colors.surface},summaryGenerateText:{fontSize:13,fontWeight:"700",color:colors.primary}});
const formatMs=(ms:number)=>`${String(Math.floor(ms/60000)).padStart(2,"0")}:${String(Math.floor(ms/1000)%60).padStart(2,"0")}`;
const formatDuration=(ms:number)=>`${String(Math.floor(ms/60000)).padStart(2,"0")}:${String(Math.floor(ms/1000)%60).padStart(2,"0")}`;
const captureLabel=(status:Awaited<ReturnType<typeof getSystemCaptureStatus>>)=>status.active?(status.phase==="silent"?"未检测到允许捕获的播放音频":`设备内识别 ${formatDuration(status.elapsedMs)}`):status.supported?"Android 系统音频 · 音频不上传":"当前平台仅支持手工字幕";
const captureErrorLabel=(code:string)=>({capture_permission_denied:"已取消系统音频授权",capture_projection_stopped:"系统终止了音频捕获",capture_not_permitted:"当前播放内容不允许被捕获",audio_record_init_failed:"无法初始化系统音频通道",audio_device_lost:"系统音频设备已断开",local_asr_model_required:"请先下载本地中文识别模型",capture_runtime_failed:"本地系统音频识别失败"}[code]??code);
const modelProgressLabel=(value:ModelProgress)=>value.phase==="downloading"?`下载 ${Math.min(100,Math.round(value.downloaded/value.total*100))}%`:value.phase==="verifying"?"正在校验模型":"正在安装模型";
const message=(error:unknown)=>error instanceof Error?error.message:"发生未知错误";
