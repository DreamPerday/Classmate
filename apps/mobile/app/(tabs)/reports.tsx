import{useEffect,useState}from"react";
import{Pressable,ScrollView,StyleSheet,Text,TextInput,View}from"react-native";
import{useMutation,useQuery,useQueryClient}from"@tanstack/react-query";
import{Ionicons}from"@expo/vector-icons";
import{ActionButton}from"@/components/ui/action-button";
import{EmptyState,ErrorNotice,LoadingState}from"@/components/ui/states";
import{colors,spacing}from"@/constants/theme";
import{getReportBounds,getReports,reportContext,saveReport}from"@/services/database";
import{generateLearningReport}from"@/services/ai";
import{exportReportDocx,exportReportPdf}from"@/services/report-export";
import type{LearningReport,ReportScope,ReportTemplate}from"@/types/domain";

const templates:Array<{value:ReportTemplate;label:string}>=[{value:"daily",label:"单日"},{value:"weekly",label:"周报"},{value:"course",label:"课程"},{value:"practicum",label:"实训"},{value:"custom",label:"自定义"}];

export default function ReportsScreen(){
  const queryClient=useQueryClient();
  const reports=useQuery({queryKey:["mobile-reports"],queryFn:getReports});
  const bounds=useQuery({queryKey:["mobile-report-bounds"],queryFn:getReportBounds});
  const[scope,setScope]=useState<ReportScope>({template:"course",title:"课程学习总结",startDate:"",endDate:""});
  const[initialized,setInitialized]=useState(false);
  const[expanded,setExpanded]=useState<string>();
  const[exporting,setExporting]=useState("");
  const[exportError,setExportError]=useState("");

  useEffect(()=>{if(bounds.data&&!initialized){setScope(current=>({...current,startDate:bounds.data.startDate,endDate:bounds.data.endDate}));setInitialized(true);}},[bounds.data,initialized]);

  const generate=useMutation({
    mutationFn:async()=>{
      validateScope(scope);
      const rows=await reportContext(scope);
      if(!rows.length)throw new Error("所选日期范围内没有课堂字幕");
      const context=rows.map((row,index)=>`[证据${index+1}] ${String(row.createdAt).slice(0,10)} ${formatMs(Number(row.startMs))} · ${row.title}\n${row.text}`).join("\n\n");
      const content=await generateLearningReport(scope,context,rows.length);
      const long=scope.template==="course"||scope.template==="practicum"||scope.template==="custom"||daysBetween(scope.startDate,scope.endDate)>=7;
      if(long&&content.replace(/\s/g,"").length<2000)throw new Error("模型生成内容未达到综合报告质量门槛，请重试");
      return saveReport(scope,content,rows.length);
    },
    onSuccess:async report=>{setExpanded(report.id);await queryClient.invalidateQueries({queryKey:["mobile-reports"]});},
  });

  async function exportFile(report:LearningReport,kind:"docx"|"pdf"){
    setExportError("");setExporting(`${report.id}:${kind}`);
    try{if(kind==="docx")await exportReportDocx(report);else await exportReportPdf(report);}catch(error){setExportError(message(error));}finally{setExporting("");}
  }

  function chooseTemplate(template:ReportTemplate){
    const end=bounds.data?.endDate||scope.endDate||today(),start=bounds.data?.startDate||scope.startDate||end;
    const next=template==="daily"?{startDate:end,endDate:end}:template==="weekly"?{startDate:shiftDate(end,-6),endDate:end}:{startDate:start,endDate:end};
    setScope({...scope,template,title:defaultTitle(template),...next});
  }
  function tenDayPreset(){const end=bounds.data?.endDate||scope.endDate||today();setScope({template:"practicum",title:"10 天实训学习报告",startDate:shiftDate(end,-9),endDate:end});}

  if(reports.isLoading||bounds.isLoading)return <LoadingState/>;
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.intro}><Ionicons name="document-text-outline" size={24} color={colors.primary}/><View style={styles.introBody}><Text style={styles.title}>范围学习报告</Text><Text style={styles.detail}>按课程与日期范围引用设备内课堂证据，十天仅作为快捷预设。</Text></View></View>

    <Text style={styles.label}>报告类型</Text>
    <View accessibilityRole="radiogroup" style={styles.segmented}>{templates.map(item=><Pressable accessibilityRole="radio" accessibilityState={{checked:scope.template===item.value}} key={item.value} onPress={()=>chooseTemplate(item.value)} style={[styles.segment,scope.template===item.value&&styles.segmentActive]}><Text style={[styles.segmentText,scope.template===item.value&&styles.segmentTextActive]}>{item.label}</Text></Pressable>)}</View>
    <Pressable accessibilityRole="button" onPress={tenDayPreset} style={styles.preset}><Ionicons name="calendar-outline" size={17} color={colors.primary}/><Text style={styles.presetText}>使用 10 天实训预设</Text></Pressable>
    <Field label="报告标题" value={scope.title} onChangeText={title=>setScope({...scope,title})}/>
    <View style={styles.dateRow}><Field compact label="开始日期" value={scope.startDate} onChangeText={startDate=>setScope({...scope,startDate})} placeholder="YYYY-MM-DD"/><Field compact label="结束日期" value={scope.endDate} onChangeText={endDate=>setScope({...scope,endDate})} placeholder="YYYY-MM-DD"/></View>
    <ActionButton label={generate.isPending?"正在生成":"生成范围报告"} icon="sparkles" busy={generate.isPending} onPress={()=>generate.mutate()} disabled={generate.isPending||!scope.title.trim()||!scope.startDate||!scope.endDate}/>
    {generate.error&&<ErrorNotice message={message(generate.error)}/>} {exportError&&<ErrorNotice message={exportError}/>} 

    <View style={styles.header}><Text style={styles.heading}>报告历史</Text><Text style={styles.meta}>{reports.data?.length??0} 份</Text></View>
    {reports.data?.length?reports.data.map(report=>{const open=expanded===report.id;return <View key={report.id} style={styles.report}><Pressable accessibilityRole="button" onPress={()=>setExpanded(open?undefined:report.id)} style={styles.reportTop}><View style={styles.reportHead}><Text style={styles.reportTitle}>{report.title}</Text><Text style={styles.date}>{templateName(report.template)} · {report.startDate} 至 {report.endDate} · {report.evidenceCount} 条证据</Text><Text style={styles.date}>{new Date(report.createdAt).toLocaleDateString("zh-CN")} · {report.content.replace(/\s/g,"").length} 字符</Text></View><Ionicons name={open?"chevron-up":"chevron-down"} size={18} color={colors.muted}/></Pressable><Text numberOfLines={open?undefined:6} style={styles.content}>{report.content}</Text>{open&&<View style={styles.exports}><ActionButton label="Word" icon="document-outline" variant="secondary" busy={exporting===`${report.id}:docx`} onPress={()=>void exportFile(report,"docx")} disabled={Boolean(exporting)}/><ActionButton label="PDF" icon="document-text-outline" variant="secondary" busy={exporting===`${report.id}:pdf`} onPress={()=>void exportFile(report,"pdf")} disabled={Boolean(exporting)}/></View>}</View>}):<EmptyState title="暂无报告" detail="选择日期范围后，可在设备上调用所选模型生成并导出。" icon="document-outline"/>}
  </ScrollView>;
}

function Field({label,compact=false,...props}:React.ComponentProps<typeof TextInput>&{label:string;compact?:boolean}){return <View style={[styles.field,compact&&styles.fieldCompact]}><Text style={styles.label}>{label}</Text><TextInput {...props} autoCapitalize="none" placeholderTextColor="#939a94" style={styles.input}/></View>}
function validateScope(scope:ReportScope){if(!scope.title.trim())throw new Error("请输入报告标题");if(!/^\d{4}-\d{2}-\d{2}$/.test(scope.startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(scope.endDate)||scope.startDate>scope.endDate)throw new Error("请输入有效的报告日期范围");}
const defaultTitle=(value:ReportTemplate)=>({daily:"单日学习记录",weekly:"周学习报告",course:"课程学习总结",practicum:"实训学习报告",custom:"自定义学习报告"}[value]);
const templateName=defaultTitle;
const today=()=>new Date().toISOString().slice(0,10);
const shiftDate=(value:string,days:number)=>{const date=new Date(`${value}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);};
const daysBetween=(start:string,end:string)=>Math.floor((Date.parse(end)-Date.parse(start))/86400000)+1;
const formatMs=(ms:number)=>`${String(Math.floor(ms/60000)).padStart(2,"0")}:${String(Math.floor(ms/1000)%60).padStart(2,"0")}`;
const message=(error:unknown)=>error instanceof Error?error.message:"发生未知错误";
const styles=StyleSheet.create({page:{padding:spacing.md,paddingBottom:48},intro:{flexDirection:"row",gap:12,borderTopWidth:1,borderBottomWidth:1,borderColor:colors.line,backgroundColor:colors.surface,padding:16,marginBottom:18},introBody:{flex:1},title:{fontSize:16,fontWeight:"700",color:colors.ink},detail:{marginTop:4,fontSize:12,lineHeight:19,color:colors.muted},label:{marginBottom:7,fontSize:12,fontWeight:"700",color:colors.ink},segmented:{flexDirection:"row",borderWidth:1,borderColor:colors.line,borderRadius:7,overflow:"hidden",marginBottom:10},segment:{flex:1,minHeight:44,alignItems:"center",justifyContent:"center",backgroundColor:colors.surface,borderRightWidth:StyleSheet.hairlineWidth,borderRightColor:colors.line},segmentActive:{backgroundColor:colors.primarySoft},segmentText:{fontSize:11,fontWeight:"700",color:colors.muted},segmentTextActive:{color:colors.primary},preset:{minHeight:48,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7,marginBottom:10},presetText:{fontSize:12,fontWeight:"700",color:colors.primary},field:{marginBottom:14},fieldCompact:{flex:1},input:{minHeight:48,borderWidth:1,borderColor:colors.line,borderRadius:7,backgroundColor:colors.surface,paddingHorizontal:12,fontSize:13,color:colors.ink},dateRow:{flexDirection:"row",gap:10},header:{marginTop:26,marginBottom:10,flexDirection:"row",justifyContent:"space-between"},heading:{fontSize:15,fontWeight:"700",color:colors.ink},meta:{fontSize:11,color:colors.muted},report:{borderWidth:1,borderColor:colors.line,borderRadius:7,backgroundColor:colors.surface,padding:14,marginBottom:10},reportTop:{minHeight:48,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},reportHead:{flex:1,paddingRight:10},reportTitle:{fontSize:14,fontWeight:"700",color:colors.ink},date:{marginTop:3,fontSize:10,color:colors.muted},content:{marginTop:10,fontSize:12,lineHeight:20,color:colors.ink},exports:{flexDirection:"row",gap:8,marginTop:14}});
