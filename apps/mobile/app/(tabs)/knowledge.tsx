import{useState}from"react";
import{Pressable,ScrollView,StyleSheet,Text,TextInput,View}from"react-native";
import{useMutation,useQuery}from"@tanstack/react-query";
import{Ionicons}from"@expo/vector-icons";
import{ActionButton}from"@/components/ui/action-button";
import{EmptyState,ErrorNotice,LoadingState}from"@/components/ui/states";
import{MarkdownText}from"@/components/ui/markdown";
import{colors,spacing}from"@/constants/theme";
import{getKnowledge,searchEvidence}from"@/services/database";
import{answerFromEvidence}from"@/services/ai";
import type{KnowledgeNode}from"@/types/domain";

type NodeTier={title:string;nodes:KnowledgeNode[];color:string};

export default function KnowledgeScreen(){
  const knowledge=useQuery({queryKey:["mobile-knowledge"],queryFn:getKnowledge});
  const[question,setQuestion]=useState("");
  const[expandedTiers, setExpandedTiers]=useState<Record<string,boolean>>({});
  const[expandedGroups, setExpandedGroups]=useState<Record<string,boolean>>({});
  const ask=useMutation({mutationFn:async()=>{
    const sources=await searchEvidence(question);
    return{answer:await answerFromEvidence(question,sources),sources};
  }});

  if(knowledge.isLoading)return <LoadingState/>;

  const nodes=knowledge.data?.nodes??[];
  const edges=knowledge.data?.edges??[];
  const tiers:NodeTier[]=[
    {title:"核心概念",nodes:nodes.filter(n=>n.importance>=8),color:colors.accent},
    {title:"重要概念",nodes:nodes.filter(n=>n.importance>=5&&n.importance<8),color:colors.primary},
    {title:"一般概念",nodes:nodes.filter(n=>n.importance<5),color:colors.muted},
  ].filter(t=>t.nodes.length>0);

  const edgeGroups=new Map<string,{relation:string;targets:string[]}[]>();
  for(const edge of edges){
    const groups=edgeGroups.get(edge.source)??[];
    const existing=groups.find(g=>g.relation===edge.relation);
    if(existing)existing.targets.push(edge.target);
    else groups.push({relation:edge.relation,targets:[edge.target]});
    edgeGroups.set(edge.source,groups);
  }

  function toggleTier(title:string){
    setExpandedTiers(prev=>({...prev,[title]:!prev[title]}));
  }
  function toggleGroup(source:string){
    setExpandedGroups(prev=>({...prev,[source]:!prev[source]}));
  }

  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Text style={styles.lead}>知识节点和关系均来自设备中的课堂字幕，问答使用本地混合检索后再调用所选模型。</Text>
    <View style={styles.ask}>
      <TextInput value={question} onChangeText={setQuestion} placeholder="询问课堂中讲过的内容" placeholderTextColor="#929992" style={styles.input}/>
      <ActionButton label="查询" icon="search" onPress={()=>ask.mutate()} disabled={!question.trim()||ask.isPending} busy={ask.isPending}/>
    </View>
    {ask.error?<ErrorNotice message={ask.error.message}/>:null}
    {ask.data?<View style={styles.answer}>
      <Text style={styles.answerTitle}>证据回答</Text>
      <View style={styles.answerContent}><MarkdownText content={ask.data.answer}/></View>
      <Text style={styles.sourceMeta}>{ask.data.sources.length} 条本地证据</Text>
    </View>:null}

    <View style={styles.header}>
      <Text style={styles.heading}>知识节点</Text>
      <Text style={styles.meta}>{nodes.length} 个 · {tiers.length} 个分类</Text>
    </View>
    {nodes.length?tiers.map(tier=>{
      const expanded=expandedTiers[tier.title]??tier.nodes.length<=5;
      const shown=expanded?tier.nodes:tier.nodes.slice(0,5);
      return <View key={tier.title} style={styles.tierSection}>
        <Pressable accessibilityRole="button" style={styles.tierHeader} onPress={()=>toggleTier(tier.title)}>
          <Ionicons name={expanded?"chevron-down":"chevron-forward"} size={15} color={tier.color}/>
          <Text style={[styles.tierTitle,{color:tier.color}]}>{tier.title}</Text>
          <Text style={styles.tierMeta}>{tier.nodes.length} 个</Text>
        </Pressable>
        {shown.map(node=><View key={node.id} style={styles.node}>
          <View style={styles.nodeIcon}><Ionicons name="ellipse" size={10} color={tier.color}/></View>
          <View style={styles.nodeBody}>
            <Text style={styles.nodeName}>{node.name}</Text>
            <Text style={styles.definition} numberOfLines={expanded?undefined:2}>{node.definition||"暂无稳定定义"}</Text>
          </View>
          <Text style={styles.score}>{node.importance}</Text>
        </View>)}
        {tier.nodes.length>5&&!expanded&&<Pressable style={styles.moreBtn} onPress={()=>toggleTier(tier.title)}>
          <Text style={styles.moreText}>展开剩余 {tier.nodes.length-5} 个</Text>
        </Pressable>}
      </View>;
    }):<EmptyState title="知识网络为空" detail="分析课堂字幕后，概念与关系会在这里归并。" icon="git-network-outline"/>}

    <View style={styles.header}>
      <Text style={styles.heading}>概念关系</Text>
      <Text style={styles.meta}>{edges.length} 条 · {edgeGroups.size} 个源节点</Text>
    </View>
    {edgeGroups.size?[...edgeGroups.entries()].map(([source,groups])=>{
      const expanded=expandedGroups[source]??false;
      const allTargets=groups.flatMap(g=>g.targets);
      return <View key={source} style={styles.edgeGroup}>
        <Pressable accessibilityRole="button" style={styles.edgeGroupHeader} onPress={()=>toggleGroup(source)}>
          <Ionicons name={expanded?"chevron-down":"chevron-forward"} size={15} color={colors.primary}/>
          <Text style={styles.edgeSource}>{source}</Text>
          <Text style={styles.edgeCount}>{allTargets.length} 个关联</Text>
        </Pressable>
        {expanded?groups.flatMap((group,gi)=>
          group.targets.map((target,ti)=>
            <View key={`${gi}-${ti}`} style={styles.edge}>
              <Text style={styles.edgeName}>{source}</Text>
              <View style={styles.relation}>
                <View style={styles.line}/>
                <Text style={styles.relationText}>{group.relation}</Text>
                <View style={styles.line}/>
              </View>
              <Text style={styles.edgeName}>{target}</Text>
            </View>
          )
        ):<Text style={styles.edgePreview}>{allTargets.slice(0,3).join("、")}{allTargets.length>3?"…":""}</Text>}
      </View>;
    }):<EmptyState title="暂无概念关系" detail="分析字幕后，概念间的关系会在这里汇总。" icon="git-network-outline"/>}
  </ScrollView>;
}

const styles=StyleSheet.create({
  page:{padding:spacing.md,paddingBottom:48},
  lead:{fontSize:12,lineHeight:20,color:colors.muted,marginBottom:14},
  ask:{gap:8},
  input:{height:46,borderWidth:1,borderColor:colors.line,borderRadius:7,backgroundColor:colors.surface,paddingHorizontal:13,fontSize:14,color:colors.ink},
  answer:{marginTop:14,borderLeftWidth:2,borderLeftColor:colors.primary,backgroundColor:colors.surface,padding:14},
  answerTitle:{fontSize:12,fontWeight:"800",color:colors.primary},
  answerContent:{marginTop:6},
  sourceMeta:{marginTop:8,fontSize:10,color:colors.muted},
  header:{marginTop:26,marginBottom:10,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
  heading:{fontSize:15,fontWeight:"700",color:colors.ink},
  meta:{fontSize:11,color:colors.muted},
  tierSection:{backgroundColor:colors.surface,borderRadius:7,borderWidth:1,borderColor:colors.line,marginBottom:10,overflow:"hidden"},
  tierHeader:{flexDirection:"row",alignItems:"center",gap:7,paddingHorizontal:12,paddingVertical:10,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.line},
  tierTitle:{flex:1,fontSize:13,fontWeight:"700"},
  tierMeta:{fontSize:11,color:colors.muted},
  node:{flexDirection:"row",alignItems:"center",paddingHorizontal:12,paddingVertical:10,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.line},
  nodeIcon:{width:22},
  nodeBody:{flex:1},
  nodeName:{fontSize:14,fontWeight:"700",color:colors.ink},
  definition:{marginTop:3,fontSize:11,lineHeight:17,color:colors.muted},
  score:{fontSize:13,fontWeight:"700",color:colors.accent},
  moreBtn:{paddingVertical:10,alignItems:"center"},
  moreText:{fontSize:11,fontWeight:"700",color:colors.primary},
  edgeGroup:{backgroundColor:colors.surface,borderRadius:7,borderWidth:1,borderColor:colors.line,marginBottom:8,overflow:"hidden"},
  edgeGroupHeader:{flexDirection:"row",alignItems:"center",gap:7,paddingHorizontal:12,paddingVertical:10},
  edgeSource:{flex:1,fontSize:13,fontWeight:"700",color:colors.ink},
  edgeCount:{fontSize:10,color:colors.muted},
  edgePreview:{paddingHorizontal:12,paddingBottom:10,fontSize:11,color:colors.muted},
  edge:{flexDirection:"row",alignItems:"center",paddingHorizontal:12,paddingVertical:8,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.line},
  edgeName:{maxWidth:"34%",fontSize:12,fontWeight:"700",color:colors.ink},
  relation:{flex:1,flexDirection:"row",alignItems:"center",marginHorizontal:8},
  line:{height:1,backgroundColor:colors.line,flex:1},
  relationText:{fontSize:9,color:colors.muted,marginHorizontal:5},
});
