import React,{useEffect,useMemo,useState}from"react";
import{createRoot}from"react-dom/client";
import{BrowserRouter,NavLink,useLocation,useNavigate}from"react-router-dom";

const h=React.createElement;
const SB_URL="https://ylybwiwemlnekclrwwjq.supabase.co";
const SB_KEY="sb_publishable_CLbbu_GKYbH5sRB9R-EsSg_r3-jL9BN";
const SESSION_KEY="global_streamverse_session_v1";
const COUNTRIES={"AR":"Argentina","AU":"Australia","AT":"Austria","BE":"Bélgica","BO":"Bolivia","BR":"Brasil","CA":"Canadá","CL":"Chile","CO":"Colombia","CR":"Costa Rica","CU":"Cuba","DO":"República Dominicana","EC":"Ecuador","ES":"España","FR":"Francia","DE":"Alemania","IN":"India","ID":"Indonesia","IT":"Italia","JP":"Japón","MX":"México","NL":"Países Bajos","PE":"Perú","PH":"Filipinas","PT":"Portugal","RU":"Rusia","KR":"Corea del Sur","TH":"Tailandia","GB":"Reino Unido","US":"Estados Unidos","VE":"Venezuela","UY":"Uruguay","CA":"Canadá","SG":"Singapur","MY":"Malasia","NZ":"Nueva Zelanda","IE":"Irlanda","ZA":"Sudáfrica","NG":"Nigeria","TR":"Turquía","UA":"Ucrania","PL":"Polonia","SE":"Suecia","NO":"Noruega","FI":"Finlandia","CH":"Suiza","AE":"Emiratos Árabes Unidos"};
const fmt=v=>new Intl.NumberFormat("es-MX").format(Number(v)||0);
const flag=code=>{const c=String(code||"").toUpperCase();return/^[A-Z]{2}$/.test(c)?String.fromCodePoint(...c.split("").map(x=>127397+x.charCodeAt(0))):"🌎"};
const safeUrl=value=>{try{const u=new URL(value);return u.protocol==="https:"?u.href:""}catch{return""}};
const when=value=>{if(!value)return"—";const d=new Date(value);return Number.isNaN(d.getTime())?"—":d.toLocaleString("es-MX",{dateStyle:"medium",timeStyle:"short"})};
const sessionRead=()=>{try{return JSON.parse(localStorage.getItem(SESSION_KEY)||"null")}catch{return null}};
const sessionSave=d=>localStorage.setItem(SESSION_KEY,JSON.stringify({access_token:d.access_token,refresh_token:d.refresh_token,expires_at:Date.now()+Number(d.expires_in||3600)*1000,user:d.user}));
const authHeaders=token=>({apikey:SB_KEY,Authorization:"Bearer "+token,"Content-Type":"application/json"});
async function currentSession(){
 let s=sessionRead();if(!s?.access_token)return null;
 let r=await fetch(SB_URL+"/auth/v1/user",{headers:authHeaders(s.access_token)});
 if(r.ok)return{user:await r.json(),session:s};
 if(s.refresh_token){r=await fetch(SB_URL+"/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:{apikey:SB_KEY,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:s.refresh_token})});const d=await r.json().catch(()=>({}));if(r.ok&&d.access_token){sessionSave(d);return{user:d.user,session:sessionRead()}}}
 localStorage.removeItem(SESSION_KEY);return null;
}
async function api(path,options={}){
 const r=await fetch(path,options);const data=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(data.detail||data.error||data.message||"No pudimos completar la solicitud.");
 return data;
}
async function sbRpc(name,body={},token){
 const headers=token?authHeaders(token):{apikey:SB_KEY,"Content-Type":"application/json"};
 return api(SB_URL+"/rest/v1/rpc/"+name,{method:"POST",headers,body:JSON.stringify(body),cache:"no-store"});
}
function Button({children,variant="primary",...props}){return h("button",{className:"button "+variant,...props},children)}
function Eyebrow({children}){return h("div",{className:"eyebrow"},children)}
function Metric({label,value,note,icon}){return h("article",{className:"metric-card"},h("div",{className:"metric-top"},h("span",null,label),icon?h("span",{className:"metric-icon"},icon):null),h("strong",null,fmt(value)),note?h("small",null,note):null)}
function Empty({children}){return h("div",{className:"empty-state"},children)}
function PageTitle({eyebrow,title,description,actions}){return h("div",{className:"page-title"},h("div",null,h(Eyebrow,null,eyebrow),h("h1",null,title),description?h("p",null,description):null),actions?h("div",{className:"title-actions"},actions):null)}
function App(){
 const location=useLocation(),navigate=useNavigate();
 const [account,setAccount]=useState(null),[accountLoading,setAccountLoading]=useState(true);
 useEffect(()=>{let active=true;currentSession().then(async auth=>{if(!active)return;if(!auth){setAccount(null);return}try{const rows=await api(SB_URL+"/rest/v1/participants?select=id,login_username,display_name,country_code,status,last_synced_at,last_error,created_at&auth_user_id=eq."+encodeURIComponent(auth.user.id)+"&limit=1",{headers:authHeaders(auth.session.access_token),cache:"no-store"});setAccount(rows[0]||null)}catch{setAccount(null)}}).finally(()=>active&&setAccountLoading(false));return()=>{active=false}},[]);
 const signOut=async()=>{const s=sessionRead();if(s?.access_token)fetch(SB_URL+"/auth/v1/logout",{method:"POST",headers:authHeaders(s.access_token)}).catch(()=>{});localStorage.removeItem(SESSION_KEY);setAccount(null);navigate("/")};
 const route=location.pathname;
 const [refreshKey,setRefreshKey]=useState(0);
 const navItems=[["/","Inicio","⌂"],["/analytics","Estadísticas","▥"],["/tracks.html","Canciones","♫"],["/albums","Álbumes","▤"]];
 return h("div",{className:"app-shell"},
  h("header",{className:"topbar"},
   h("a",{className:"brand",href:"/"},h("span",{className:"brand-mark"},"S"),h("span",null,"STREAMVERSE"),h("small",null,"GLOBAL ARMY CHARTS")),
   h("nav",{className:"desktop-nav"},navItems.map(([url,label])=>h(NavLink,{to:url,end:url==="/",key:url,className:({isActive})=>"nav-link"+(isActive?" active":"")},label))),
   h("div",{className:"top-actions"},account?h("a",{className:"account-chip",href:"/profile.html"},h("span",{className:"account-dot"}),account.display_name||"Mi perfil"):h("a",{className:"button small secondary",href:"/#access"},accountLoading?"…":"Iniciar sesión"))
  ),
  h("main",{className:"main-content"},
   route==="/analytics"?h(Analytics,{refreshKey}):
   route==="/tracks.html"||route==="/tracks"?h(Catalog,{kind:"tracks",refreshKey}):
   route==="/albums"?h(Catalog,{kind:"albums",refreshKey}):
   route==="/profile.html"||route==="/profile"?h(Profile,{account,onAccount:setAccount,onRefresh:()=>setRefreshKey(x=>x+1)}):
   h(Home,{account,onAccount:setAccount,refreshKey})
  ),
  h("footer",{className:"site-footer"},h("div",null,h("b",null,"GLOBAL STREAMVERSE"),h("span",null,"Una comunidad global, una misma música.")),h("small",null,"Proyecto independiente de fans · No afiliado a BTS, HYBE, Musicat ni Spotify.")),
  h("nav",{className:"mobile-dock"},navItems.map(([url,label,icon])=>h(NavLink,{to:url,end:url==="/",key:url,className:({isActive})=>"dock-link"+(isActive?" active":"")},h("span",null,icon),label)),h(NavLink,{to:"/profile.html",className:({isActive})=>"dock-link"+(isActive?" active":"")},h("span",null,"◎"),"Perfil"))
 );
}
function Home({account,onAccount,refreshKey}){
 const[mode,setMode]=useState("login"),[username,setUsername]=useState(""),[password,setPassword]=useState(""),[nickname,setNickname]=useState(""),[country,setCountry]=useState(""),[musicat,setMusicat]=useState(""),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[messageType,setMessageType]=useState("");
 const[members,setMembers]=useState([]),[countries,setCountries]=useState([]),[directoryState,setDirectoryState]=useState("loading"),[rankingState,setRankingState]=useState("loading");
 useEffect(()=>{let live=true;sbRpc("get_public_profiles").then(d=>{if(live){setMembers(Array.isArray(d)?d:[]);setDirectoryState("ready")}}).catch(()=>live&&setDirectoryState("error"));fetch(SB_URL+"/rest/v1/country_daily_totals?select=country_code,total_streams,reset_at&order=total_streams.desc&limit=100",{headers:{apikey:SB_KEY},cache:"no-store"}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{if(live){setCountries(d.map(x=>({...x,total_streams:Number(x.total_streams)||0})).filter(x=>x.total_streams>0).sort((a,b)=>b.total_streams-a.total_streams));setRankingState("ready")}}).catch(()=>live&&setRankingState("error"));return()=>{live=false}},[refreshKey]);
 const signIn=async()=>{const email=username.trim().toLowerCase()+"@accounts.global-streamverse.invalid";const d=await api(SB_URL+"/auth/v1/token?grant_type=password",{method:"POST",headers:{apikey:SB_KEY,"Content-Type":"application/json"},body:JSON.stringify({email,password})});if(!d.access_token)throw Error("Usuario o contraseña incorrectos.");sessionSave(d);const rows=await api(SB_URL+"/rest/v1/participants?select=id,login_username,display_name,country_code,status,last_synced_at,last_error,created_at&auth_user_id=eq."+encodeURIComponent(d.user.id)+"&limit=1",{headers:authHeaders(d.access_token)});onAccount(rows[0]||null);};
 const submit=async e=>{e.preventDefault();setBusy(true);setMessage("");try{if(mode==="signup"){const d=await api(SB_URL+"/functions/v1/register-participant",{method:"POST",headers:{apikey:SB_KEY,"Content-Type":"application/json"},body:JSON.stringify({username:username.trim().toLowerCase(),password,display_name:nickname.trim(),country_code:country,public_profile_url:musicat.trim(),consent})});try{await signIn();setMessage("Cuenta creada. Tu perfil de Musicat está en validación automática.");setMessageType("ok")}catch{setMessage("Tu cuenta fue creada. Inicia sesión con tus credenciales.");setMessageType("ok");setMode("login")}}else{await signIn();setMessage("Sesión iniciada.");setMessageType("ok")}}catch(err){setMessage(err.message||"Ocurrió un error.");setMessageType("error")}finally{setBusy(false)}};
 const total=countries.reduce((n,x)=>n+x.total_streams,0),leader=countries[0];
 return h("div",{className:"page home-page"},
  h("section",{className:"hero"},
   h("div",{className:"hero-copy"},h(Eyebrow,null,"ONE WORLD · ONE MUSIC COMMUNITY"),h("h1",null,"Una comunidad.",h("br"),h("span",null,"Un mismo universo.")),h("p",null,"Conectamos a ARMY de todo el mundo a través de la música, los datos y el apoyo colectivo a BTS."),h("div",{className:"hero-actions"},h("a",{className:"button primary",href:"#access"},"Únete a Streamverse"),h("a",{className:"button secondary",href:"/analytics"},"Explorar estadísticas"))),
   h("div",{className:"hero-art"},h("div",{className:"orbit orbit-one"}),h("div",{className:"orbit orbit-two"}),h("div",{className:"hero-core"},h("span",null,"S"),h("small",null,"ARMY"),h("b",null,"WORLDWIDE")),h("div",{className:"floating-note note-one"},"♡ 7 MEMBERS"),h("div",{className:"floating-note note-two"},"∞ ONE COMMUNITY"))
  ),
  h("section",{className:"intro-strip"},h("div",null,h("b",null,"Hecho por ARMY, para ARMY."),h("span",null,"Un espacio internacional para celebrar cada reproducción y cada país.")),h("span",{className:"live-mark"},h("i")," TRACKING MUSICAT")),
  h("section",{className:"section-block"},h(PageTitle,{eyebrow:"THE COMMUNITY",title:"El mundo se conecta aquí",description:"Una comunidad que crece con cada perfil que decide participar."}),h("div",{className:"metric-grid three"},h(Metric,{label:"Streams públicos registrados",value:total,note:"Actividad diaria por país",icon:"↗"}),h(Metric,{label:"Países con actividad",value:countries.length,note:"Participación internacional",icon:"◎"}),h(Metric,{label:"Perfiles públicos",value:members.length,note:"Participantes activos",icon:"♡"}))),
  h("section",{className:"section-block split-section"},h("div",null,h(PageTitle,{eyebrow:"GLOBAL RANKING",title:"La fuerza de cada país",description:"Totales diarios registrados a partir de perfiles públicos consentidos."}),rankingState==="loading"?h(Empty,null,"Cargando actividad…"):rankingState==="error"?h(Empty,null,"No pudimos cargar el ranking."):countries.length?h("div",{className:"ranking-list"},countries.slice(0,8).map((r,i)=>h("div",{className:"ranking-row",key:r.country_code},h("span",{className:"rank-num"},String(i+1).padStart(2,"0")),h("span",{className:"country-flag"},flag(r.country_code)),h("span",{className:"country-name"},COUNTRIES[r.country_code]||r.country_code),h("div",{className:"bar-track"},h("div",{className:"bar-fill",style:{width:(r.total_streams/leader.total_streams*100)+"%"}})),h("b",{className:"rank-value"},fmt(r.total_streams))))):h(Empty,null,"Aún no hay actividad verificada.")),
   h("aside",{className:"join-card",id:"access"},account?h(React.Fragment,null,h(Eyebrow,null,"WELCOME BACK"),h("h2",null,"Hola, ",account.display_name||"ARMY"),h("p",null,account.status==="approved"?"Tu perfil de Musicat está activo en la comunidad.":"Estamos validando tu perfil de Musicat automáticamente."),h("a",{className:"button primary block",href:"/profile.html"},"Abrir mi perfil"),h("small",null,"Tu usuario de acceso permanece privado.")):h(React.Fragment,null,h(Eyebrow,null,"YOUR PLACE IN THE COMMUNITY"),h("h2",null,mode==="signup"?"Forma parte de Streamverse":"Vuelve a Streamverse"),h("p",null,"Tu nickname, tu país y tu perfil público de Musicat. Sin compartir contraseñas de terceros."),h("div",{className:"auth-tabs"},h("button",{className:mode==="login"?"active":"",onClick:()=>{setMode("login");setMessage("")}},"Iniciar sesión"),h("button",{className:mode==="signup"?"active":"",onClick:()=>{setMode("signup");setMessage("")}},"Crear cuenta")),h("form",{onSubmit:submit,className:"auth-form"},
   h("label",null,"Nombre de usuario",h("input",{value:username,onChange:e=>setUsername(e.target.value),autoComplete:"username",minLength:3,maxLength:20,pattern:"[A-Za-z0-9._-]{3,20}",required:true,placeholder:"Tu usuario de Streamverse"})),
   h("label",null,"Contraseña",h("input",{type:"password",value:password,onChange:e=>setPassword(e.target.value),autoComplete:mode==="signup"?"new-password":"current-password",minLength:mode==="signup"?8:undefined,maxLength:72,required:true,placeholder:"Tu contraseña"})),
   mode==="signup"?h(React.Fragment,null,h("label",null,"Nickname público",h("input",{value:nickname,onChange:e=>setNickname(e.target.value),minLength:2,maxLength:40,required:true,placeholder:"Cómo quieres aparecer"})),h("div",{className:"form-pair"},h("label",null,"País",h("select",{value:country,onChange:e=>setCountry(e.target.value),required:true},h("option",{value:""},"Selecciona"),Object.entries(COUNTRIES).sort((a,b)=>a[1].localeCompare(b[1],"es")).map(([c,n])=>h("option",{key:c,value:c},flag(c)+" "+n)))),h("label",null,"Perfil Musicat",h("input",{type:"url",value:musicat,onChange:e=>setMusicat(e.target.value),required:true,placeholder:"https://musicat.fm/tu-perfil"}))),h("label",{className:"consent-line"},h("input",{type:"checkbox",checked:consent,onChange:e=>setConsent(e.target.checked),required:true}),h("span",null,"Acepto mostrar mi nickname y país en el directorio público y autorizo la consulta de mi historial público de Musicat."))):null,
   h(Button,{type:"submit",disabled:busy},busy?"Un momento…":mode==="signup"?"Crear mi cuenta":"Entrar"),
   message?h("p",{className:"form-message "+messageType},message):null,
   h("small",null,mode==="signup"?"No necesitas correo electrónico. Guarda tu usuario y contraseña; no existe recuperación por correo.":"Inicia sesión con tus credenciales de Streamverse.")
  )))),
  h("section",{className:"section-block"},h(PageTitle,{eyebrow:"ARMY DIRECTORY",title:"Personas detrás de los números",description:"Perfiles que decidieron compartir su actividad con la comunidad."}),directoryState==="loading"?h(Empty,null,"Cargando el directorio…"):directoryState==="error"?h(Empty,null,"No pudimos cargar el directorio."):members.length?h("div",{className:"member-grid"},members.slice(0,12).map(m=>h("a",{className:"member-card",href:"/profile.html?u="+encodeURIComponent(m.handle),key:m.handle},h("span",{className:"member-avatar"},flag(m.country_code)),h("span",{className:"member-info"},h("b",null,m.display_name),h("small",null,"@"+m.handle),h("small",null,COUNTRIES[m.country_code]||m.country_code)),h("span",{className:"member-arrow"},"↗")))):h(Empty,null,"Sé parte de los primeros perfiles de la comunidad.")),
  h("section",{className:"section-block how-section"},h(PageTitle,{eyebrow:"HOW IT WORKS",title:"Transparencia en cada reproducción"}),h("div",{className:"feature-grid"},[["01","Conecta tu perfil","Comparte el enlace público de Musicat. Nunca pedimos tu contraseña de Musicat."],["02","Sincronización automática","El sistema consulta el historial disponible cada diez minutos y evita duplicados."],["03","Estadísticas con contexto","Los perfiles públicos usan Musicat. El historial personal de Spotify permanece privado."]].map(x=>h("article",{className:"feature-card",key:x[0]},h("small",null,x[0]),h("h3",null,x[1]),h("p",null,x[2])))))
 );
}
function Analytics({refreshKey}){
 const[data,setData]=useState(null),[catalog,setCatalog]=useState(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[period,setPeriod]=useState("today"),[tab,setTab]=useState("overview"),[query,setQuery]=useState("");
 useEffect(()=>{let live=true;setLoading(true);Promise.all([api("/api/analytics"),api("/api/catalog")]).then(([a,c])=>{if(live){setData(a);setCatalog(c);setError("")}}).catch(e=>live&&setError(e.message)).finally(()=>live&&setLoading(false));return()=>{live=false}},[refreshKey]);
 const rows=(catalog?.rows||[]).filter(x=>x.match_status==="matched"),summary=data?.summary||{},cs=catalog?.python_analytics?.summary||{};
 const key=period==="today"?"today_streams":period==="week"?"week_streams":period==="month"?"month_streams":"total_streams";
 const term=query.toLocaleLowerCase().trim();
 const tracks=rows.filter(x=>[x.track_name,x.artist_name,x.album_name].join(" ").toLocaleLowerCase().includes(term)).sort((a,b)=>(Number(b[key])||0)-(Number(a[key])||0));
 const albums=useMemo(()=>{const map=new Map();rows.forEach(r=>{if(!r.album_uri||!r.album_name)return;let a=map.get(r.album_uri);if(!a){a={uri:r.album_uri,name:r.album_name,image:r.album_image_url,type:r.album_type,count:0,total:0,today:0,week:0,month:0};map.set(r.album_uri,a)}a.count++;a.total+=Number(r.total_streams)||0;a.today+=Number(r.today_streams)||0;a.week+=Number(r.week_streams)||0;a.month+=Number(r.month_streams)||0});return[...map.values()].sort((a,b)=>b[key.replace("_streams","")] - a[key.replace("_streams","")])},[catalog,period]);
 return h("div",{className:"page"},
  h(PageTitle,{eyebrow:"COMMUNITY INTELLIGENCE",title:"Estadísticas globales",description:"Una lectura transparente de la actividad pública de la comunidad ARMY."}),
  loading&&!data?h(Empty,null,"Cargando estadísticas verificadas…"):null,error?h(Empty,null,error):null,
  data?h(React.Fragment,null,
   h("div",{className:"metric-grid four"},h(Metric,{label:"Streams públicos",value:summary.public_profile_streams,note:"Suma de perfiles con consentimiento"}),h(Metric,{label:"Streams Musicat",value:cs.total_streams,note:"Catálogo disponible"}),h(Metric,{label:"Perfiles públicos",value:summary.public_profiles}),h(Metric,{label:"Países representados",value:summary.countries_represented})),
   h("div",{className:"content-tabs"},[["overview","Resumen"],["tracks","Canciones"],["albums","Álbumes"],["countries","Países"],["argentina","🇦🇷 Spotify Argentina"]].map(([k,v])=>h("button",{key:k,className:tab===k?"active":"",onClick:()=>{setTab(k);setQuery("")}},v))),
   tab==="overview"?h("div",{className:"dashboard-grid"},h("section",{className:"surface"},h("div",{className:"surface-head"},h("h2",null,"Canciones recientes"),h("span",null,"Muestra de actividad")),(data.recent_tracks_sample||[]).slice(0,8).map((r,i)=>h("div",{className:"list-row",key:i},h("span",{className:"list-rank"},String(i+1).padStart(2,"0")),h("span",{className:"list-main"},h("b",null,r.track),h("small",null,r.artist)),h("b",{className:"list-count"},fmt(r.recent_plays_sampled))))),h("section",{className:"surface"},h("div",{className:"surface-head"},h("h2",null,"ARMY por país"),h("span",null,"Streams públicos")),(data.top_countries||[]).slice(0,8).map((r,i)=>h("div",{className:"list-row",key:r.country_code},h("span",{className:"list-rank"},String(i+1).padStart(2,"0")),h("span",{className:"list-main"},h("b",null,flag(r.country_code)+" "+(COUNTRIES[r.country_code]||r.country_code)),h("small",null,r.members+" perfiles")),h("b",{className:"list-count"},fmt(r.streams))))),h("section",{className:"surface wide"},h("div",{className:"surface-head"},h("h2",null,"Perfiles destacados"),h("span",null,"Participación pública")),(data.top_members||[]).slice(0,10).map((m,i)=>h("a",{className:"list-row member-list-row",href:"/profile.html?u="+encodeURIComponent(m.handle),key:m.handle},h("span",{className:"list-rank"},String(i+1).padStart(2,"0")),h("span",{className:"list-main"},h("b",null,flag(m.country_code)+" "+m.display_name),h("small",null,"@"+m.handle)),h("b",{className:"list-count"},fmt(m.total_streams)))))):null,
   tab==="tracks"||tab==="albums"?h(React.Fragment,null,h("div",{className:"toolbar"},h("div",{className:"period-switch"},[["today","Hoy"],["week","7 días"],["month","Mes"],["total","Total"]].map(([k,v])=>h("button",{key:k,className:period===k?"active":"",onClick:()=>setPeriod(k)},v))),h("input",{className:"search-input",value:query,onChange:e=>setQuery(e.target.value),placeholder:"Buscar canción, artista o álbum…"})),h("section",{className:"surface"},(tab==="tracks"?tracks:albums.filter(a=>(a.name+" "+a.type).toLocaleLowerCase().includes(term))).slice(0,100).map((r,i)=>h("div",{className:"catalog-row",key:tab==="tracks"?(r.musicat_track_id||i):r.uri},h("span",{className:"list-rank"},String(i+1).padStart(2,"0")),h("img",{src:safeUrl(tab==="tracks"?r.album_image_url:r.image)||"/cover-fallback.svg",alt:"",loading:"lazy"}),h("span",{className:"list-main"},h("b",null,tab==="tracks"?r.track_name:r.name),h("small",null,tab==="tracks"?r.artist_name:(r.type||"Álbum")+" · "+r.count+" canciones")),h("b",{className:"list-count"},fmt(tab==="tracks"?r[key]:r[period])))))):null,
   tab==="argentina"?h(SpotifyArgentina,{refreshKey}):null,\n   tab==="countries"?h("section",{className:"surface"},(data.top_countries||[]).map((r,i)=>h("div",{className:"list-row",key:r.country_code},h("span",{className:"list-rank"},String(i+1).padStart(2,"0")),h("span",{className:"list-main"},h("b",null,flag(r.country_code)+" "+(COUNTRIES[r.country_code]||r.country_code)),h("small",null,r.members+" perfiles públicos")),h("b",{className:"list-count"},fmt(r.streams))))):null,
   tab!=="argentina"?h("p",{className:"data-note"},"Fuente pública: Musicat. Los rankings de canciones recientes son una muestra limitada del historial disponible, no un ranking histórico completo. Última consulta: "+when(data.generated_at)+"."):null
  ):null
 );
}

function SpotifyArgentina({refreshKey}){
 const[data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[onlyBts,setOnlyBts]=useState(true);
 useEffect(()=>{let live=true;setLoading(true);api("/api/spotify-argentina").then(d=>{if(live){setData(d);setError("")}}).catch(e=>live&&setError(e.message)).finally(()=>live&&setLoading(false));return()=>{live=false}},[refreshKey]);
 const rows=onlyBts?(data?.bts_tracks||[]):(data?.rows||[]);
 const n=v=>Number(v||0).toLocaleString("es-AR");
 const date=data?.chart_date?new Date(data.chart_date+"T12:00:00").toLocaleDateString("es-AR",{day:"2-digit",month:"long",year:"numeric"}):"—";
 return h("section",{className:"spotify-ar"},
  h("div",{className:"spotify-ar-head"},
   h("div",null,h("span",{className:"eyebrow"},"SPOTIFY CHARTS · DAILY TOP 200"),h("h2",null,"🇦🇷 Argentina"),h("p",null,"Seguimiento de BTS, movimientos diarios y distancia entre posiciones.")),
   h("button",{className:"button secondary small",onClick:()=>{setLoading(true);api("/api/spotify-argentina?refresh=1").then(setData).catch(e=>setError(e.message)).finally(()=>setLoading(false))}},"Actualizar")
  ),
  loading&&!data?h("div",{className:"empty-state"},"Consultando el chart de Argentina…"):null,
  error?h("div",{className:"empty-state"},h("b",null,"Chart pendiente de conexión"),h("p",null,error),h("small",null,"La clave se configura de forma privada en Vercel; nunca debe publicarse en el código.")):null,
  data?h(React.Fragment,null,
   h("div",{className:"spotify-ar-summary"},
    h("article",null,h("small",null,"Canciones BTS en el Top 200"),h("strong",null,String((data.bts_tracks||[]).length))),
    h("article",null,h("small",null,"Canción BTS mejor posicionada"),h("strong",null,data.bts_tracks?.length?"#"+data.bts_tracks[0].rank:"—")),
    h("article",null,h("small",null,"Puesto de entrada"),h("strong",null,"#200 · "+n(data.rows?.[199]?.streams)+" streams"))
   ),
   h("div",{className:"spotify-ar-controls"},
    h("div",{className:"period-switch"},h("button",{className:onlyBts?"active":"",onClick:()=>setOnlyBts(true)},"Solo BTS"),h("button",{className:!onlyBts?"active":"",onClick:()=>setOnlyBts(false)},"Top 200")),
    h("span",null,"Chart: "+date+(data.stale?" · dato anterior disponible":""))
   ),
   rows.length?h("div",{className:"spotify-ar-list"},rows.map(row=>h("article",{className:"spotify-ar-row",key:row.spotify_uri||row.rank},
    h("div",{className:"spotify-ar-rank"},"#"+row.rank,h("small",{className:row.movement>0?"trend-up":row.movement<0?"trend-down":""},row.movement>0?"▲ "+row.movement:row.movement<0?"▼ "+Math.abs(row.movement):"—")),
    row.image?h("img",{src:safeUrl(row.image),alt:"",loading:"lazy"}):h("span",{className:"spotify-ar-cover"},"♫"),
    h("div",{className:"spotify-ar-main"},h("b",null,row.track),h("small",null,row.artists.join(", ")),h("strong",null,n(row.streams)+" streams")),
    h("div",{className:"spotify-ar-gaps"},h("span",null,"Gap ↑ ",h("b",null,row.gap_to_above===null?"—":n(row.gap_to_above))),h("span",null,"Gap ↓ ",h("b",null,row.gap_to_below===null?"—":n(row.gap_to_below))),h("span",null,"Gap #200 ",h("b",null,n(row.gap_to_200)))),
    h("div",{className:"spotify-ar-outlook"},h("span",{className:"risk-pill "+(row.risk_label==="Riesgo alto"?"high":row.risk_label==="Vigilar"?"watch":"safe")},row.risk_label),h("b",null,row.up_probability+"% ↑"),h("small",null,"Prob. orientativa de subir"),h("small",null,row.down_risk+"% riesgo de bajar"))
   ))):h("div",{className:"empty-state"},"No hay canciones de BTS en este chart para la fecha recibida."),
   h("p",{className:"data-note"},"Gap ↑ = streams que faltan para alcanzar al puesto anterior. Gap ↓ = ventaja sobre el puesto siguiente. Gap #200 = ventaja sobre el umbral de salida. El índice de subida/bajada es orientativo: usa movimiento y diferencias de streams del mismo día, no es una probabilidad estadística ni garantiza el resultado."),
   h("p",{className:"data-note"},"Fuente: proveedor independiente de datos de Spotify Charts. El Top 200 no incluye streams de canciones fuera del ranking; por eso no se asignan probabilidades de entrada a canciones que no aparecen en él.")
  ):null
 );
}
\nfunction Catalog({kind,refreshKey}){
 const[payload,setPayload]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[period,setPeriod]=useState("total"),[query,setQuery]=useState(""),[selected,setSelected]=useState(null),[detail,setDetail]=useState(null),[detailLoading,setDetailLoading]=useState(false);
 useEffect(()=>{let live=true;setLoading(true);api("/api/catalog").then(d=>live&&setPayload(d)).catch(e=>live&&setError(e.message)).finally(()=>live&&setLoading(false));return()=>{live=false}},[refreshKey]);
 const rows=(payload?.rows||[]).filter(r=>r.match_status==="matched"),albums=useMemo(()=>{const map=new Map();rows.forEach(r=>{if(!r.album_uri||!r.album_name)return;let a=map.get(r.album_uri);if(!a){a={uri:r.album_uri,name:r.album_name,image:r.album_image_url,type:r.album_type,release:r.album_release_date,tracks:[],total:0,today:0,week:0,month:0};map.set(r.album_uri,a)}const id=r.musicat_track_id||r.track_name;if(!a.tracks.some(t=>(t.musicat_track_id||t.track_name)===id))a.tracks.push(r);a.total+=Number(r.total_streams)||0;a.today+=Number(r.today_streams)||0;a.week+=Number(r.week_streams)||0;a.month+=Number(r.month_streams)||0});return[...map.values()].sort((a,b)=>b.total-a.total)},[payload]);
 const [view,setView]=useState("list");
 const key=period==="today"?"today_streams":period==="week"?"week_streams":period==="month"?"month_streams":"total_streams";
 const tracks=rows.filter(r=>[r.track_name,r.artist_name,r.album_name].join(" ").toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a,b)=>(Number(b[key])||0)-(Number(a[key])||0));
 const albumRows=albums.filter(a=>a.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a,b)=>b[period]-a[period]);
 const choose=a=>{setSelected(a);setView("detail")};
 const back=()=>{setSelected(null);setView("list")};
 const selectedAlbum=selected?albums.find(a=>a.uri===selected.uri):null;
 return h("div",{className:"page"},
  h(PageTitle,{eyebrow:"MUSIC LIBRARY",title:kind==="tracks"?"Canciones":"Álbumes",description:kind==="tracks"?"Cada canción aparece una sola vez en el catálogo, con su portada y sus reproducciones verificadas.":"Cada álbum abre su propio espacio con el total y las canciones que lo componen.",actions:kind==="tracks"?h("a",{className:"button secondary",href:"/albums"},"Ver álbumes"):h("a",{className:"button secondary",href:"/tracks.html"},"Ver canciones")}),
  loading?h(Empty,null,"Cargando catálogo Musicat…"):error?h(Empty,null,error):null,
  payload?h(React.Fragment,null,
   h("div",{className:"catalog-toolbar"},h("div",{className:"period-switch"},[["today","Hoy"],["week","7 días"],["month","Mes"],["total","Total"]].map(([k,v])=>h("button",{key:k,className:period===k?"active":"",onClick:()=>setPeriod(k)},v))),h("input",{className:"search-input",value:query,onChange:e=>setQuery(e.target.value),placeholder:kind==="tracks"?"Buscar canción o artista…":"Buscar álbum…"})),
   kind==="tracks"?h("section",{className:"surface catalog-list"},tracks.slice(0,200).map((r,i)=>h("article",{className:"catalog-row",key:r.musicat_track_id||r.track_name+i},h("span",{className:"list-rank"},String(i+1).padStart(2,"0")),h("img",{src:safeUrl(r.album_image_url)||"/cover-fallback.svg",alt:"",loading:"lazy"}),h("span",{className:"list-main"},h("b",null,r.track_name),h("small",null,r.artist_name+(r.album_name?" · "+r.album_name:""))),h("b",{className:"list-count"},fmt(r[key]))))):
   view==="detail"&&selectedAlbum?h("section",{className:"album-detail"},h("button",{className:"text-button",onClick:back},"← Todos los álbumes"),h("div",{className:"album-detail-hero"},h("img",{src:safeUrl(selectedAlbum.image)||"/cover-fallback.svg",alt:""}),h("div",null,h(Eyebrow,null,selectedAlbum.type||"ÁLBUM"),h("h2",null,selectedAlbum.name),h("p",null,selectedAlbum.release||"Lanzamiento no disponible"),h("strong",null,fmt(selectedAlbum[period])+" streams"),h("small",null,selectedAlbum.tracks.length+" canciones identificadas"))),h("div",{className:"album-track-list"},selectedAlbum.tracks.sort((a,b)=>(Number(b[key])||0)-(Number(a[key])||0)).map((r,i)=>h("div",{className:"album-track-row",key:r.musicat_track_id||i},h("span",{className:"list-rank"},String(i+1).padStart(2,"0")),h("span",{className:"list-main"},h("b",null,r.track_name),h("small",null,r.artist_name)),h("b",{className:"list-count"},fmt(r[key])))))):
   h("section",{className:"album-grid"},albumRows.slice(0,100).map((a,i)=>h("button",{className:"album-card",key:a.uri,onClick:()=>choose(a)},h("img",{src:safeUrl(a.image)||"/cover-fallback.svg",alt:"",loading:"lazy"}),h("span",{className:"album-card-info"},h("b",null,a.name),h("small",null,(a.type||"Álbum")+" · "+a.tracks.length+" canciones")),h("strong",null,fmt(a[period])))))
  ):null
 );
}
function Profile({account,onAccount,onRefresh}){
 const params=new URLSearchParams(useLocation().search),publicHandle=params.get("u"),[loading,setLoading]=useState(true),[error,setError]=useState(""),[profile,setProfile]=useState(null),[participant,setParticipant]=useState(null),[stats,setStats]=useState(null),[events,setEvents]=useState([]),[spotify,setSpotify]=useState(null),[monthly,setMonthly]=useState(null),[spotifyError,setSpotifyError]=useState(""),[busy,setBusy]=useState(false),[editing,setEditing]=useState(false),[notice,setNotice]=useState("");
 const[handle,setHandle]=useState(""),[bio,setBio]=useState(""),[avatar,setAvatar]=useState(""),[banner,setBanner]=useState(""),[isPublic,setIsPublic]=useState(true);
 const privateView=!publicHandle;
 const setIdentity=d=>{setProfile(d);setHandle(d.handle||"");setBio(d.bio||"");setAvatar(d.avatar_url||"");setBanner(d.banner_url||"");setIsPublic(Boolean(d.is_public))};
 const load=async()=>{
  setLoading(true);setError("");try{
   if(publicHandle){const d=await sbRpc("get_public_profile",{p_handle:publicHandle});if(!d)throw Error("Este perfil no existe o es privado.");setIdentity(d);setStats(d);setEvents(d.recent_events||[])}
   else{
    const auth=await currentSession();if(!auth){window.location.href="/#access";return}
    const people=await api(SB_URL+"/rest/v1/participants?select=id,display_name,country_code,status,last_synced_at,last_error,created_at&auth_user_id=eq."+encodeURIComponent(auth.user.id)+"&limit=1",{headers:authHeaders(auth.session.access_token)});const person=people[0];if(!person)throw Error("No encontramos tu cuenta de participante.");setParticipant(person);onAccount(person);
    let profiles=await api(SB_URL+"/rest/v1/user_profiles?select=id,handle,bio,avatar_url,banner_url,is_public&auth_user_id=eq."+encodeURIComponent(auth.user.id)+"&limit=1",{headers:authHeaders(auth.session.access_token)});let mine=profiles[0];
    if(!mine){const created=await api(SB_URL+"/rest/v1/user_profiles",{method:"POST",headers:{...authHeaders(auth.session.access_token),Prefer:"return=representation"},body:JSON.stringify({auth_user_id:auth.user.id,participant_id:person.id,handle:"army_"+auth.user.id.replaceAll("-","").slice(0,8),bio:"",is_public:true})});mine=Array.isArray(created)?created[0]:created}
    setIdentity({...person,...mine});
    const [streamData,spotifyData,monthlyData]=await Promise.all([
      sbRpc("get_my_stream_profile",{},auth.session.access_token),
      fetch(SB_URL+"/functions/v1/spotify-oauth",{method:"POST",headers:authHeaders(auth.session.access_token),body:JSON.stringify({action:"status"})}).then(r=>r.json()).catch(()=>null),
      sbRpc("get_my_spotify_monthly_stats",{},auth.session.access_token).catch(()=>null)
    ]);
    setStats(streamData);setEvents(streamData.recent_events||[]);setSpotify(spotifyData);setMonthly(monthlyData);
   }
  }catch(e){setError(e.message||"No pudimos cargar el perfil.")}finally{setLoading(false)}
 };
 useEffect(()=>{load()},[publicHandle]);
 const copy=async()=>{const url=location.origin+"/profile.html?u="+encodeURIComponent(profile?.handle||"");try{await navigator.clipboard.writeText(url);setNotice("Enlace copiado.")}catch{setNotice(url)}};
 const save=async e=>{e.preventDefault();const auth=await currentSession();if(!auth)return;setBusy(true);try{await api(SB_URL+"/rest/v1/user_profiles?id=eq."+encodeURIComponent(profile.id),{method:"PATCH",headers:{...authHeaders(auth.session.access_token),Prefer:"return=minimal"},body:JSON.stringify({handle:handle.trim().toLowerCase().replace(/^@/,""),bio,avatar_url:avatar||null,banner_url:banner||null,is_public:isPublic})});setNotice("Perfil actualizado.");setEditing(false);await load()}catch(e){setNotice(e.message)}finally{setBusy(false)}};
 const connect=async()=>{const auth=await currentSession();if(!auth)return;setBusy(true);try{const d=await api(SB_URL+"/functions/v1/spotify-oauth",{method:"POST",headers:authHeaders(auth.session.access_token),body:JSON.stringify({action:"start"})});location.assign(d.authorization_url)}catch(e){setSpotifyError(e.message);setBusy(false)}};
 const disconnect=async()=>{const auth=await currentSession();if(!auth)return;setBusy(true);try{await api(SB_URL+"/functions/v1/spotify-oauth",{method:"POST",headers:authHeaders(auth.session.access_token),body:JSON.stringify({action:"disconnect"})});setSpotify({connected:false});setMonthly(null)}catch(e){setSpotifyError(e.message)}finally{setBusy(false)}};
 const logout=async()=>{const s=sessionRead();if(s?.access_token)fetch(SB_URL+"/auth/v1/logout",{method:"POST",headers:authHeaders(s.access_token)}).catch(()=>{});localStorage.removeItem(SESSION_KEY);onAccount(null);location.href="/"};
 const month=monthly?.months?.[0];
 return h("div",{className:"page profile-page"},
  h(PageTitle,{eyebrow:"ARMY PROFILE",title:privateView?"Mi perfil":"Perfil de ARMY",description:privateView?"Tu espacio personal y tus estadísticas privadas.":"Un perfil compartido voluntariamente con la comunidad.",actions:!privateView?h(Button,{variant:"secondary",onClick:copy},"Copiar enlace"):null}),
  loading?h(Empty,null,"Cargando perfil…"):error?h(Empty,null,error):profile?h(React.Fragment,null,
   h("section",{className:"profile-cover-card"},h("div",{className:"profile-banner",style:safeUrl(profile.banner_url)?{backgroundImage:"linear-gradient(90deg,#21152b66,#21152b11),url("+JSON.stringify(safeUrl(profile.banner_url))+")"}:{} }),h("div",{className:"profile-info"},h("div",{className:"profile-avatar-large"},safeUrl(profile.avatar_url)?h("img",{src:safeUrl(profile.avatar_url),alt:""}):flag(profile.country_code)),h("div",{className:"profile-name"},h("h2",null,profile.display_name||"ARMY"),h("span",null,"@"+profile.handle),h("small",null,flag(profile.country_code)+" "+(COUNTRIES[profile.country_code]||profile.country_code)),h("p",null,profile.bio||"Un espacio musical en GLOBAL STREAMVERSE.")),privateView?h("div",{className:"profile-tools"},h(Button,{variant:"secondary",onClick:()=>setEditing(x=>!x)},editing?"Cerrar edición":"Editar perfil"),h(Button,{variant:"ghost",onClick:logout},"Salir")):null)),
   editing?h("form",{className:"surface edit-form",onSubmit:save},h("div",{className:"surface-head"},h("h2",null,"Editar perfil")),h("label",null,"Usuario público",h("input",{value:handle,onChange:e=>setHandle(e.target.value),required:true,minLength:3,maxLength:24})),h("label",null,"Biografía",h("textarea",{value:bio,onChange:e=>setBio(e.target.value),maxLength:180,rows:3})),h("label",null,"URL de foto de perfil",h("input",{type:"url",value:avatar,onChange:e=>setAvatar(e.target.value),placeholder:"https://…"})),h("label",null,"URL de portada",h("input",{type:"url",value:banner,onChange:e=>setBanner(e.target.value),placeholder:"https://…"})),h("label",{className:"consent-line"},h("input",{type:"checkbox",checked:isPublic,onChange:e=>setIsPublic(e.target.checked)}),"Mostrar mi perfil en el directorio público"),h(Button,{type:"submit",disabled:busy},busy?"Guardando…":"Guardar cambios")):null,
   h("div",{className:"metric-grid three"},h(Metric,{label:"Streams registrados",value:stats?.total_streams}),h(Metric,{label:"Streams de hoy · UTC",value:stats?.today_streams}),h(Metric,{label:"Canciones diferentes",value:stats?.unique_tracks})),
   privateView?h("section",{className:"surface sync-status-card"},h("div",{className:"surface-head"},h("div",null,h("h2",null,"Sincronización Musicat"),h("p",null,"Estado de la conexión de tu perfil público.")),h("span",{className:"status-tag"},participant?.status==="approved"?"ACTIVO":participant?.status==="pending"?"EN REVISIÓN":String(participant?.status||"SIN ESTADO").toUpperCase())),h("div",{className:"sync-status-meta"},h("div",null,h("small",null,"Última revisión"),h("b",null,when(participant?.last_synced_at))),h("div",null,h("small",null,"Fuente de datos"),h("b",null,"Musicat público"))),participant?.last_error?h("p",{className:"form-message error"},participant.last_error):h("p",{className:"data-note"},"La sincronización se ejecuta automáticamente cada diez minutos. Si no hay escuchas nuevas en Musicat, el contador puede permanecer igual sin que exista un fallo.")):null,
   privateView?h("section",{className:"surface spotify-panel"},h("div",{className:"surface-head"},h("div",null,h("h2",null,"Spotify personal"),h("p",null,"Solo tú puedes ver este historial. No se mezcla con las estadísticas públicas.")),h("span",{className:"status-tag"},spotify?.connected?"CONECTADO":"PRIVADO")),spotify?.connected?h(React.Fragment,null,h("div",{className:"metric-grid three"},h(Metric,{label:"Streams del mes",value:month?.total_scrobbles}),h(Metric,{label:"Canciones",value:month?.unique_tracks}),h(Metric,{label:"Artistas",value:month?.unique_artist_credits})),h("div",{className:"spotify-list"},(monthly?.top_tracks||[]).slice(0,8).map((t,i)=>h("div",{className:"list-row",key:i},h("span",{className:"list-rank"},String(i+1).padStart(2,"0")),h("span",{className:"list-main"},h("b",null,t.track),h("small",null,t.artist)),h("b",{className:"list-count"},fmt(t.play_count))))),h("small",{className:"data-note"},"Última sincronización: "+when(spotify.last_synced_at))):h("p",{className:"data-note"},"Conecta Spotify si quieres conservar un resumen privado de tu historial personal."),h("div",{className:"profile-actions"},spotify?.connected?h(Button,{variant:"secondary",disabled:busy,onClick:disconnect},"Desconectar Spotify"):h(Button,{disabled:busy,onClick:connect},"Conectar Spotify")),spotifyError?h("p",{className:"form-message error"},spotifyError):null):null,
   h("section",{className:"surface history-panel"},h("div",{className:"surface-head"},h("h2",null,"Historial reciente"),h("span",null,"Musicat · últimas 50 escuchas")),events.length?events.map((e,i)=>h("div",{className:"history-row",key:(e.played_at||"")+i},h("div",null,h("b",null,e.track),h("small",null,e.artist+(e.album?" · "+e.album:""))),h("time",null,when(e.played_at||e.recorded_at)))):h(Empty,null,"Todavía no hay reproducciones disponibles.")),
   notice?h("p",{className:"data-note"},notice):null,
   privateView?h("p",{className:"data-note"},"Estado de Musicat: "+(participant?.status||"—")+" · Última sincronización: "+when(participant?.last_synced_at)):null
  ):null
 );
}
createRoot(document.getElementById("root")).render(h(BrowserRouter,null,h(App)));
