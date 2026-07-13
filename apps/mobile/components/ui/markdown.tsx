import{StyleSheet,Text,View}from"react-native";
import{colors}from"@/constants/theme";

type MarkdownTextProps={content:string|undefined|null;style?:any};

export function MarkdownText({content,style}:MarkdownTextProps){
  const safeContent=typeof content==="string"?content:"";
  if(!safeContent.trim())return null;
  const blocks=parseBlocks(safeContent);
  return <View style={[styles.container,style]}>
    {blocks.map((block,index)=>renderBlock(block,index))}
  </View>;
}

type Block=
  |{type:"h1";text:string}
  |{type:"h2";text:string}
  |{type:"h3";text:string}
  |{type:"bullet";items:string[]}
  |{type:"paragraph";text:string};

function parseBlocks(content:string):Block[]{
  const lines=content.split(/\r?\n/);
  const blocks:Block[]=[];
  let bulletBuffer:string[]=[];
  for(const raw of lines){
    const line=raw.trim();
    if(!line){
      if(bulletBuffer.length){blocks.push({type:"bullet",items:bulletBuffer});bulletBuffer=[];}
      continue;
    }
    const heading=line.match(/^(#{1,3})\s+(.+)$/);
    if(heading){
      if(bulletBuffer.length){blocks.push({type:"bullet",items:bulletBuffer});bulletBuffer=[];}
      const level=heading[1]!.length;
      blocks.push({type:level===1?"h1":level===2?"h2":"h3",text:heading[2]!});
      continue;
    }
    const bullet=line.match(/^[-*]\s+(.+)$/);
    if(bullet){
      bulletBuffer.push(bullet[1]!);
      continue;
    }
    if(bulletBuffer.length){blocks.push({type:"bullet",items:bulletBuffer});bulletBuffer=[];}
    blocks.push({type:"paragraph",text:line});
  }
  if(bulletBuffer.length)blocks.push({type:"bullet",items:bulletBuffer});
  return blocks;
}

function renderBlock(block:Block,key:number){
  switch(block.type){
    case"h1":return <Text key={key} style={styles.h1}>{renderInline(block.text)}</Text>;
    case"h2":return <Text key={key} style={styles.h2}>{renderInline(block.text)}</Text>;
    case"h3":return <Text key={key} style={styles.h3}>{renderInline(block.text)}</Text>;
    case"bullet":return <View key={key} style={styles.bulletGroup}>{block.items.map((item,i)=>
      <View key={i} style={styles.bulletRow}><Text style={styles.bulletDot}>{"•"}</Text><Text style={styles.bulletText}>{renderInline(item)}</Text></View>
    )}</View>;
    case"paragraph":return <Text key={key} style={styles.paragraph}>{renderInline(block.text)}</Text>;
    default:return null;
  }
}

function renderInline(text:string){
  const parts=text.split(/(\*\*[^*]+\*\*|\[证据\d+\])/g).filter(Boolean);
  return parts.map((part,index)=>{
    if(part.startsWith("**")&&part.endsWith("**"))
      return <Text key={index} style={styles.bold}>{part.slice(2,-2)}</Text>;
    if(/^\[证据\d+\]$/.test(part))
      return <Text key={index} style={styles.evidence}>{part}</Text>;
    return <Text key={index}>{part}</Text>;
  });
}

const styles=StyleSheet.create({
  container:{gap:6},
  h1:{fontSize:17,fontWeight:"800",color:colors.ink,lineHeight:24,marginTop:4,marginBottom:2},
  h2:{fontSize:15,fontWeight:"700",color:colors.primary,lineHeight:22,marginTop:6,marginBottom:2},
  h3:{fontSize:13,fontWeight:"700",color:colors.ink,lineHeight:20,marginTop:4,marginBottom:1},
  paragraph:{fontSize:13,lineHeight:21,color:colors.ink},
  bulletGroup:{gap:3,paddingLeft:4},
  bulletRow:{flexDirection:"row",gap:7},
  bulletDot:{fontSize:13,color:colors.muted,lineHeight:21},
  bulletText:{flex:1,fontSize:13,lineHeight:21,color:colors.ink},
  bold:{fontWeight:"700",color:colors.ink},
  evidence:{fontWeight:"700",color:colors.primary},
});
