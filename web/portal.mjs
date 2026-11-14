import {config} from "./config.mjs";
const $=id=>document.getElementById(id);
const html=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let accessToken=null,activeTenant=null;
const configured=()=>{
 return ["cognitoDomain","apiOrigin","redirectUri"].every(x=>typeof config[x]==="string"&&config[x].startsWith("https://")) && typeof config.cognitoClientId==="string" && config.cognitoClientId.length>8;
};
function status(message,error=false){$("status").textContent=message;$("status").style.color=error?"#ac2525":"#405a72"}
function base64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function randomToken(){return base64url(crypto.getRandomValues(new Uint8Array(32)))}
async function hash(text){return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))))}
async function signIn(){
 if(!configured())return status("AWS Cognito chưa được cấu hình cho staging.",true);
 const state=randomToken(),verifier=randomToken();
 sessionStorage.setItem("handyos.oauth.state",state);
 sessionStorage.setItem("handyos.oauth.verifier",verifier);
 const url=new URL("/oauth2/authorize",config.cognitoDomain);
 url.searchParams.set("response_type","code");
 url.searchParams.set("client_id",config.cognitoClientId);
 url.searchParams.set("redirect_uri",config.redirectUri);
 url.searchParams.set("scope","openid email profile");
 url.searchParams.set("state",state);
 url.searchParams.set("code_challenge_method","S256");
 url.searchParams.set("code_challenge",await hash(verifier));
 location.assign(url.toString());
}
async function completeLogin(){
 const params=new URLSearchParams(location.search);
 if(params.get("error"))throw Error("Cognito từ chối đăng nhập. Vui lòng thử lại.");
 const code=params.get("code"),state=params.get("state");
 if(!code)return false;
 const saved=sessionStorage.getItem("handyos.oauth.state");
 const verifier=sessionStorage.getItem("handyos.oauth.verifier");
 sessionStorage.removeItem("handyos.oauth.state");
 sessionStorage.removeItem("handyos.oauth.verifier");
 history.replaceState({},"",location.pathname);
 if(!state||!saved||state!==saved||!verifier)throw Error("OAuth state mismatch. Login cancelled.");
 const tokenEndpoint=new URL("/oauth2/token",config.cognitoDomain);
 const body=new URLSearchParams({grant_type:"authorization_code",client_id:config.cognitoClientId,code,redirect_uri:config.redirectUri,code_verifier:verifier});
 const response=await fetch(tokenEndpoint,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body});
 if(!response.ok)throw Error("Không thể xác thực phiên đăng nhập.");
 const tokens=await response.json();
 if(typeof tokens.access_token!=="string")throw Error("Thiếu access token.");
 // Store access token in memory only. Never put JWT in URL or localStorage.
 accessToken=tokens.access_token;return true;
}
async function api(path,options={}){
 if(!accessToken)throw Error("Not signed in");
 const headers={"authorization":"Bearer "+accessToken};
 if(options.body)headers["content-type"]="application/json";
 if(activeTenant)headers["x-handyos-tenant"]=activeTenant;
 const result=await fetch(new URL(path,config.apiOrigin),{...options,headers,cache:"no-store"});
 if(result.status===401){accessToken=null;throw Error("Phiên đăng nhập hết hạn; hãy đăng nhập lại.")}
 const data=await result.json();
 if(!result.ok)throw Error(data.error||"API error");
 return data;
}
async function load(){
 const info=await api("/v1/me");
 activeTenant=info.tenant_id;
 $("identity").textContent="Vai trò: "+info.role;
 const {jobs}=await api("/v1/jobs");
 $("jobs").innerHTML=jobs.length?jobs.map(j=>'<button class="job" data-id="'+html(j.id)+'">'+html(j.name)+' <small>'+html(j.stage)+'</small></button>').join(""):'<p>Chưa có công trình được phân quyền.</p>';
 $("newJobSection").hidden=!["owner","manager"].includes(info.role);
 $("app").hidden=false;$("auth").hidden=true;
 status("Đã đăng nhập và xác minh quyền qua AWS API.");
}
async function loadTasks(id){
 const {tasks}=await api("/v1/jobs/"+encodeURIComponent(id)+"/tasks");
 $("taskResults").innerHTML=tasks.map(t=>'<div class="task"><b>'+html(t.title)+'</b><small>'+html(t.status)+'</small></div>').join("")||"<p>Chưa có task được chia sẻ.</p>";
}
$("login").addEventListener("click",()=>signIn().catch(e=>status(e.message,true)));
$("logout").addEventListener("click",()=>{accessToken=null;activeTenant=null;$("app").hidden=true;$("auth").hidden=false;$("taskResults").textContent="";status("Đã thoát phiên ứng dụng. Đăng nhập lại nếu cần.");});
$("jobs").addEventListener("click",e=>{const b=e.target.closest("[data-id]");if(b)loadTasks(b.dataset.id).catch(err=>status(err.message,true))});
$("newJob").addEventListener("submit",async e=>{
 e.preventDefault();
 const name=$("jobName").value.trim();
 if(!name)return;
 try{await api("/v1/jobs",{method:"POST",body:JSON.stringify({name})});$("jobName").value="";await load();}catch(err){status(err.message,true)}
});
if(!configured()){status("Chưa có hạ tầng AWS staging. Không cho phép đăng nhập giả.",true);$("login").disabled=true;}
else completeLogin().then(ok=>{if(ok)return load();status("Đăng nhập bằng AWS Cognito để mở HandyOS.")}).catch(e=>status(e.message,true));
