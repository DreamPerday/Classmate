import{AlignmentType,Document,Footer,Header,HeadingLevel,Packer,PageNumber,Paragraph,TextRun}from"docx";
import*as FileSystem from"expo-file-system/legacy";
import*as Print from"expo-print";
import*as Sharing from"expo-sharing";
import type{LearningReport}from"@/types/domain";

const MIME_DOCX="application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function exportReportDocx(report:LearningReport){
  const document=new Document({
    creator:"Classmate",
    title:report.title,
    description:`${report.startDate} 至 ${report.endDate}，${report.evidenceCount} 条课堂证据`,
    styles:{default:{document:{run:{font:"Microsoft YaHei",size:22},paragraph:{spacing:{line:360,after:120}}}},paragraphStyles:[{id:"ReportTitle",name:"Report Title",basedOn:"Normal",next:"Normal",quickFormat:true,run:{font:"Microsoft YaHei",size:36,bold:true,color:"1F332B"},paragraph:{spacing:{before:0,after:320},alignment:AlignmentType.CENTER}},{id:"ReportHeading1",name:"Report Heading 1",basedOn:"Normal",next:"Normal",quickFormat:true,run:{font:"Microsoft YaHei",size:30,bold:true,color:"286750"},paragraph:{spacing:{before:320,after:160},keepNext:true}},{id:"ReportHeading2",name:"Report Heading 2",basedOn:"Normal",next:"Normal",quickFormat:true,run:{font:"Microsoft YaHei",size:26,bold:true,color:"31483F"},paragraph:{spacing:{before:240,after:120},keepNext:true}}]},
    sections:[{
      properties:{page:{size:{width:11906,height:16838},margin:{top:1134,right:1134,bottom:1134,left:1134,header:560,footer:560}}},
      headers:{default:new Header({children:[new Paragraph({alignment:AlignmentType.RIGHT,children:[new TextRun({text:`Classmate · ${report.startDate} 至 ${report.endDate}`,size:18,color:"69766F"})]})]})},
      footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({children:["第 ",PageNumber.CURRENT," 页"],size:18,color:"69766F"})]})]})},
      children:[new Paragraph({style:"ReportTitle",children:[new TextRun(report.title)]}),new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:`${templateLabel(report.template)} · ${report.startDate} 至 ${report.endDate} · ${report.evidenceCount} 条证据`,size:20,color:"69766F"})]}),...markdownParagraphs(report.content)],
    }],
  });
  const base64=await Packer.toBase64String(document),uri=await exportUri(report,"docx");
  await FileSystem.writeAsStringAsync(uri,base64,{encoding:FileSystem.EncodingType.Base64});
  await share(uri,MIME_DOCX);
  return uri;
}

export async function exportReportPdf(report:LearningReport){
  const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>@page{size:A4;margin:18mm 17mm 20mm}*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Noto Sans CJK SC","Microsoft YaHei",sans-serif;color:#1f2b26;font-size:11pt;line-height:1.72;margin:0}h1{font-size:20pt;text-align:center;margin:0 0 8mm;color:#1f332b}h2{font-size:15pt;color:#286750;margin:8mm 0 3mm;page-break-after:avoid}h3{font-size:12.5pt;color:#31483f;margin:6mm 0 2mm;page-break-after:avoid}.meta{text-align:center;color:#69766f;font-size:9pt;border-bottom:1px solid #d8dfda;padding-bottom:5mm;margin-bottom:7mm}p{margin:0 0 3mm;text-align:justify;orphans:2;widows:2}.bullet{padding-left:5mm}.evidence{color:#286750;font-weight:600}footer{position:fixed;bottom:-12mm;left:0;right:0;text-align:center;color:#7a837e;font-size:8pt}</style></head><body><h1>${escapeHtml(report.title)}</h1><div class="meta">${escapeHtml(templateLabel(report.template))} · ${escapeHtml(report.startDate)} 至 ${escapeHtml(report.endDate)} · ${report.evidenceCount} 条证据</div>${markdownHtml(report.content)}<footer>Classmate · 本报告依据设备内课堂记录生成</footer></body></html>`;
  const generated=await Print.printToFileAsync({html,base64:false}),uri=await exportUri(report,"pdf");
  await FileSystem.copyAsync({from:generated.uri,to:uri});
  await share(uri,"application/pdf");
  return uri;
}

export async function exportReportMarkdown(report:LearningReport){
  const md=`# ${report.title}\n\n> ${templateLabel(report.template)} · ${report.startDate} 至 ${report.endDate} · ${report.evidenceCount} 条证据\n\n${report.content}\n`;
  const uri=await exportUri(report,"md");
  await FileSystem.writeAsStringAsync(uri,md,{encoding:FileSystem.EncodingType.UTF8});
  await share(uri,"text/markdown");
  return uri;
}

export async function exportSummaryMarkdown(title:string,contentMd:string){
  const md=`# ${title}\n\n${contentMd}\n`;
  const directory=`${FileSystem.documentDirectory}exports/`;
  await FileSystem.makeDirectoryAsync(directory,{intermediates:true});
  const safeName=title.trim().replace(/[\\/:*?"<>|]/g,"-").replace(/\s+/g,"-").slice(0,60)||"session-summary";
  const uri=`${directory}${safeName}.md`;
  await FileSystem.writeAsStringAsync(uri,md,{encoding:FileSystem.EncodingType.UTF8});
  await share(uri,"text/markdown");
  return uri;
}

async function exportUri(report:LearningReport,extension:string){const directory=`${FileSystem.documentDirectory}exports/`;await FileSystem.makeDirectoryAsync(directory,{intermediates:true});return`${directory}${safeName(report.title)}-${report.startDate}-${report.endDate}.${extension}`;}
async function share(uri:string,mimeType:string){if(!await Sharing.isAvailableAsync())throw new Error("当前设备不支持系统分享");await Sharing.shareAsync(uri,{mimeType,dialogTitle:"导出学习报告",UTI:mimeType});}
function safeName(value:string){return value.trim().replace(/[\\/:*?"<>|]/g,"-").replace(/\s+/g,"-").slice(0,60)||"learning-report";}
function templateLabel(value:LearningReport["template"]){return{daily:"单日学习记录",weekly:"周学习报告",course:"课程总结",practicum:"实训报告",custom:"自定义报告"}[value];}

function markdownParagraphs(content:string){return content.split(/\r?\n/).flatMap(line=>{const text=line.trim();if(!text)return[];const heading=text.match(/^(#{1,3})\s+(.+)$/);if(heading)return[new Paragraph({style:heading[1]!.length===1?"ReportHeading1":"ReportHeading2",children:inlineRuns(heading[2]!)})];const bullet=text.match(/^[-*]\s+(.+)$/);if(bullet)return[new Paragraph({bullet:{level:0},children:inlineRuns(bullet[1]!)})];return[new Paragraph({children:inlineRuns(text)})];});}
function inlineRuns(value:string){const values=value.split(/(\*\*[^*]+\*\*|\[证据\d+\])/g).filter(Boolean);return values.map(part=>part.startsWith("**")&&part.endsWith("**")?new TextRun({text:part.slice(2,-2),bold:true}):/^\[证据\d+\]$/.test(part)?new TextRun({text:part,bold:true,color:"286750"}):new TextRun(part));}
function markdownHtml(content:string){return content.split(/\r?\n/).map(line=>{const text=line.trim();if(!text)return"";const heading=text.match(/^(#{1,3})\s+(.+)$/);if(heading){const level=Math.min(3,heading[1]!.length+1);return`<h${level}>${inlineHtml(heading[2]!)}</h${level}>`;}const bullet=text.match(/^[-*]\s+(.+)$/);if(bullet)return`<p class="bullet">• ${inlineHtml(bullet[1]!)}</p>`;return`<p>${inlineHtml(text)}</p>`;}).join("");}
function inlineHtml(value:string){return escapeHtml(value).replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/(\[证据\d+\])/g,'<span class="evidence">$1</span>');}
function escapeHtml(value:string){return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
