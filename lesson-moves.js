/* Shared one-off schedule mapping; regular days and lesson counts stay unchanged. */
window.lessonMoves = (() => {
 const time=v=>String(v||'').slice(0,5);
 async function load(client,memberId){if(!client)return [];let query=client.from('personal_lesson_moves').select('*');if(memberId)query=query.eq('member_id',memberId);const {data,error}=await query;if(error)throw error;return data||[];}
 function apply(items,moves,options={}){
  const ids=item=>item.memberIds||[item.memberId].filter(Boolean);
  const status=(date,t,members)=>options.statusFor?.(date,time(t),members)||'scheduled';
  const consumed=new Set();
  const output=items.map(item=>{
   if(item.type && item.type!=='personal')return item;
   const members=ids(item);
   const matched=moves.filter(m=>members.includes(m.member_id)&&m.original_date===item.date&&time(m.original_time)===time(item.time));
   if(matched.length!==members.length||!matched.length)return item;
   if(!matched.every(m=>m.new_date===matched[0].new_date&&time(m.new_time)===time(matched[0].new_time)))return item;
   matched.forEach(m=>consumed.add(m.id));const m=matched[0];
   return {...item,date:m.new_date,time:time(m.new_time),originalDate:m.original_date,originalTime:time(m.original_time),isMoved:true};
  });
  const orphanGroups=new Map();
  for(const move of moves){
   if(consumed.has(move.id))continue;
   const template=(options.templates||items).find(item=>ids(item).includes(move.member_id));
   if(!template||status(move.new_date,move.new_time,ids(template))!=='scheduled')continue;
   const key=[ids(template).join('+'),move.original_date,move.original_time,move.new_date,move.new_time].join('|');
   const group=orphanGroups.get(key)||{template,moves:[]};group.moves.push(move);orphanGroups.set(key,group);
  }
  for(const {template,moves:group} of orphanGroups.values()){
   if(group.length!==ids(template).length)continue;const m=group[0];
   if(output.some(item=>item.date===m.new_date&&time(item.time)===time(m.new_time)&&ids(item).join('+')===ids(template).join('+')))continue;
   const index=output.findLastIndex(item=>!item.isMoved&&(!item.type||item.type==='personal')&&ids(item).join('+')===ids(template).join('+')&&status(item.date,item.time,ids(item))==='scheduled');
   if(index<0)continue;output.splice(index,1);
   output.push({...template,date:m.new_date,time:time(m.new_time),type:'personal',status:'scheduled',originalDate:m.original_date,originalTime:time(m.original_time),isMoved:true});
  }
  const unique=new Map();for(const item of output)unique.set([item.type||'personal',item.date,time(item.time),ids(item).join('+')].join('|'),item);
  return [...unique.values()].sort((a,b)=>`${a.date}_${a.time}`.localeCompare(`${b.date}_${b.time}`));
 }
 return {load,apply};
})();
