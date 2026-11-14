export class HttpError extends Error {
 constructor(status,message){super(message);this.status=status}
}
export function sanitizeText(value,max=200){
 if(typeof value!=="string")throw new HttpError(400,"Expected text");
 const result=value.trim();
 if(!result||result.length>max)throw new HttpError(400,"Invalid text length");
 return result;
}
export function allowedRole(role,action){
 return ["owner","manager"].includes(role) || (action==="read" && ["worker","homeowner"].includes(role));
}
export function ensureUuid(id){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||""))
  throw new HttpError(400,"Invalid ID");
 return id;
}
export function parseJSON(data){
 try{
  const o=JSON.parse(data);
  if(!o || Array.isArray(o) || typeof o!=="object")throw Error();
  return o;
 }catch{throw new HttpError(400,"Invalid JSON body")}
}
export function taskColumns(role){
 return ["owner","manager"].includes(role)
  ? "id,title,notes,status,qty,unit,unit_cost_ex_gst,assigned_to,due_on"
  : "id,title,status,due_on";
}
