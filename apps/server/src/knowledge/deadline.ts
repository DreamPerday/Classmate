const weekdays: Record<string, number> = { "周日":0,"星期日":0,"周一":1,"星期一":1,"周二":2,"星期二":2,"周三":3,"星期三":3,"周四":4,"星期四":4,"周五":5,"星期五":5,"周六":6,"星期六":6 };
const chineseDigits:Record<string,number>={"零":0,"一":1,"二":2,"两":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9};
export function resolveDeadline(raw: string | null, sessionDate: Date): { resolved: string | null; needsReview: boolean } {
  if (!raw) return { resolved:null, needsReview:false };
  const needsReview=/(?:左右|大约|待定|另行通知)/.test(raw);
  const iso=raw.match(/(20\d{2})[年\/-](\d{1,2})[月\/-](\d{1,2})日?/); if(iso){const date=withTime(new Date(Number(iso[1]),Number(iso[2])-1,Number(iso[3])),raw);return {resolved:date.toISOString(),needsReview};}
  const md=raw.match(/(\d{1,2})月(\d{1,2})日/); if(md){let year=sessionDate.getFullYear();let date=new Date(year,Number(md[1])-1,Number(md[2]));if(date.getTime()<startOfDay(sessionDate).getTime())date=new Date(year+1,Number(md[1])-1,Number(md[2]));return {resolved:withTime(date,raw).toISOString(),needsReview};}
  const key=Object.keys(weekdays).find(k=>raw.includes(k)); if(key){const target=weekdays[key]!,date=startOfDay(sessionDate);if(raw.includes("下下周")||raw.includes("下下星期")){const monday=mondayOf(date);date.setTime(monday.getTime());date.setDate(date.getDate()+14+toMondayIndex(target));}else if(raw.includes("下周")||raw.includes("下星期")){const monday=mondayOf(date);date.setTime(monday.getTime());date.setDate(date.getDate()+7+toMondayIndex(target));}else if(raw.includes("本周")||raw.includes("这周")||raw.includes("本星期")||raw.includes("这星期")){const monday=mondayOf(date);date.setTime(monday.getTime());date.setDate(date.getDate()+toMondayIndex(target));}else{let delta=(target-date.getDay()+7)%7;if(delta===0)delta=7;date.setDate(date.getDate()+delta);}return {resolved:withTime(date,raw).toISOString(),needsReview:needsReview||date.getTime()<startOfDay(sessionDate).getTime()};}
  if(raw.includes("明天")){const date=startOfDay(sessionDate);date.setDate(date.getDate()+1);return {resolved:withTime(date,raw).toISOString(),needsReview};}
  return {resolved:null,needsReview:true};
}

function startOfDay(value:Date):Date{const date=new Date(value);date.setHours(0,0,0,0);return date;}
function mondayOf(value:Date):Date{const date=startOfDay(value);date.setDate(date.getDate()-toMondayIndex(date.getDay()));return date;}
function toMondayIndex(day:number):number{return(day+6)%7;}
function withTime(date:Date,raw:string):Date{const time=parseTime(raw);date.setHours(time?.hour??23,time?.minute??59,0,0);return date;}
function parseTime(raw:string):{hour:number;minute:number}|null{const match=raw.match(/(凌晨|早上|上午|中午|下午|晚上)?\s*([0-9一二两三四五六七八九十]{1,3})[点时](半|[0-9一二两三四五六七八九十]{1,3}分?)?/);if(!match)return null;let hour=parseChineseNumber(match[2]!);if(hour===null||hour>23)return null;const period=match[1]??"";if((period==="下午"||period==="晚上")&&hour<12)hour+=12;if(period==="中午"&&hour<11)hour+=12;if(period==="凌晨"&&hour===12)hour=0;let minute=0;if(match[3]==="半")minute=30;else if(match[3]){const parsed=parseChineseNumber(match[3].replace("分",""));if(parsed===null||parsed>59)return null;minute=parsed;}return{hour,minute};}
function parseChineseNumber(value:string):number|null{if(/^\d+$/.test(value))return Number(value);if(value==="十")return 10;if(value.startsWith("十"))return 10+(chineseDigits[value[1]!]??0);if(value.endsWith("十"))return(chineseDigits[value[0]!]??0)*10;if(value.length===3&&value[1]==="十")return(chineseDigits[value[0]!]??0)*10+(chineseDigits[value[2]!]??0);return value.length===1?chineseDigits[value]??null:null;}
