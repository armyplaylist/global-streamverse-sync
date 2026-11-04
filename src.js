import React,{useEffect,useState}from"react";
import{createRoot}from"react-dom/client";
import{BrowserRouter,NavLink,useLocation}from"react-router-dom";
const h=React.createElement;
const LEGACY="/legacy";
const fmt=v=>new Intl.NumberFormat("es-MX").format(Number(v||0));
function Analytics(){
 const[data,setData]=useState(null),[catalog,setCatalog]=useState(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[reload,setReload]=useState(0);
 useEffect(()=>{let live=true;setLoading(true);setError("");Promise.all([
  fetch("/api/analytics").then(async r=>{if(!r.ok)throw Error("No se pudieron cargar las estadísticas comunitarias.");return r.json()}),
  fetch("/api/catalog").then(async r=>{if(!r.ok)throw Error("No se pudo cargar el ranking de canciones y álbumes.");return r.json()})
 ]).then(([a,c])=>{if(live){setData(a);setCatalog(c)}}).catch(e=>{if(live)setError(e.message||"Error de conexión")}).finally(()=>{if(live)setLoading(false)});
 return()=>{live=false}},[reload]);
 const s=data?.summary||{},cs=catalog?.python_analytics?.summary||{},ca=catalog?.python_analytics||{};
 const row=(name,sub,value,i)=>h("div",{className:"item",key:name+"-"+i},h("b",{className:"position"},i+1),h("div",{className:"item-main"},h("strong",null,name),h("small",null,sub||"")),h("b",{className:"value"},value==="—"?"—":fmt(value)));
 return h("main",{className:"analytics"},
  h("section",{className:"hero"},h("div",{className:"eyebrow"},"GLOBAL STREAMVERSE · REACT + PYTHON"),h("h1",null,"Community insights"),h("p",null,"Rankings comunitarios, canciones y álbumes con datos de GLOBAL STREAMVERSE."),h("button",{className:"refresh",onClick:()=>setReload(x=>x+1),disabled:loading},loading?"Actualizando…":"↻ Actualizar datos")),
  loading&&!data?h("div",{className:"notice"},"Conectando con Supabase…"):null,
  error?h("div",{className:"notice error"},error):null,
  data&&catalog?h(React.Fragment,null,
   h("div",{className:"section-label"},"COMUNIDAD · PERFILES PÚBLICOS"),
   h("section",{className:"metrics"},[["Perfiles públicos",s.public_profiles],["Streams de perfiles públicos",s.public_profile_streams],["Streams de hoy · UTC",s.public_profile_streams_today_utc],["Países representados",s.countries_represented]].map(([label,value])=>h("article",{className:"metric",key:label},h("span",null,label),h("strong",null,fmt(value))))),
   h("div",{className:"section-label"},"CATÁLOGO GLOBAL · MUSICAT"),
   h("section",{className:"metrics"},[["Streams registrados",cs.total_streams],["Canciones",cs.tracks],["Versiones identificadas",cs.matched_tracks],["Álbumes confirmados",cs.confirmed_albums]].map(([label,value])=>h("article",{className:"metric",key:label},h("span",null,label),h("strong",null,fmt(value))))),
   h("section",{className:"columns"},
    h("article",{className:"panel"},h("div",{className:"panel-head"},h("h2",null,"Top ARMY"),h("span",null,"Streams por perfil público")),h("div",{className:"rows"},(data.top_members||[]).map((m,i)=>row(m.display_name+" · @"+m.handle,m.country_code,m.total_streams,i)))),
    h("article",{className:"panel"},h("div",{className:"panel-head"},h("h2",null,"Por país"),h("span",null,"Streams de perfiles públicos")),h("div",{className:"rows"},(data.top_countries||[]).map((c,i)=>row(c.country_code,fmt(c.members)+" perfiles",c.streams,i))))
   ),
   h("section",{className:"columns"},
    h("article",{className:"panel"},h("div",{className:"panel-head"},h("h2",null,"Top canciones"),h("span",null,"Streams Musicat · catálogo global")),h("div",{className:"rows"},(ca.top_tracks||[]).map((t,i)=>row(t.track_name,t.artist_name,t.total_streams,i)))),
    h("article",{className:"panel"},h("div",{className:"panel-head"},h("h2",null,"Top álbumes"),h("span",null,"Sólo versiones identificadas")),h("div",{className:"rows"},(ca.top_albums||[]).map((a,i)=>row(a.album_name,a.album_type,a.total_streams,i))))
   ),
   h("section",{className:"panel"},h("div",{className:"panel-head"},h("h2",null,"Versiones por confirmar"),h("span",null,"No reciben streams atribuidos")),h("div",{className:"rows"},(ca.candidate_albums||[]).map((a,i)=>row(a.album_name,(a.album_type||"Lanzamiento")+" · pendiente","—",i))),h("p",{className:"method"},ca.methodology)),
   h("section",{className:"panel"},h("div",{className:"panel-head"},h("h2",null,"Escuchas recientes"),h("span",null,"Muestra de perfiles públicos · no histórico")),h("div",{className:"rows"},(data.recent_tracks_sample||[]).map((t,i)=>row(t.track,t.artist,t.recent_plays_sampled,i)))),
   h("p",{className:"method"},data.methodology?.stream_totals+" "+data.methodology?.track_chart),
   h("p",{className:"updated"},"Actualizado: "+new Date(catalog.python_analytics.generated_at).toLocaleString("es-MX",{dateStyle:"medium",timeStyle:"short"})+" · catálogo; "+new Date(data.generated_at).toLocaleString("es-MX",{dateStyle:"medium",timeStyle:"short"})+" · perfiles UTC")
  ):null
 );
}
function App(){
 const location=useLocation(),isAnalytics=location.pathname==="/analytics";
 const target=location.pathname==="/tracks"||location.pathname==="/tracks.html"?LEGACY+"/tracks.html"+location.search:location.pathname==="/profile"||location.pathname==="/profile.html"?LEGACY+"/profile.html"+location.search:LEGACY+"/index.html"+location.search;
 return h("div",{className:"shell"},
  h("header",{className:"topbar"},h("a",{className:"brand",href:"/"},"GLOBAL ",h("span",null,"STREAMVERSE")),h("nav",{className:"nav","aria-label":"Navegación principal"},
   h(NavLink,{to:"/",end:true,className:({isActive})=>isActive?"active":""},"Inicio"),
   h(NavLink,{to:"/tracks.html",className:({isActive})=>isActive?"active":""},"Canciones y álbumes"),
   h(NavLink,{to:"/analytics",className:({isActive})=>isActive?"active":""},"Estadísticas"),
   h(NavLink,{to:"/profile.html",className:({isActive})=>isActive?"active":""},"Perfil")
  )),
  isAnalytics?h(Analytics):h("main",{className:"content"},h("iframe",{className:"legacy",title:"GLOBAL STREAMVERSE",src:target,allow:"clipboard-read; clipboard-write"}))
 );
}
const css=document.createElement("style");
css.textContent=`.analytics{width:min(1120px,calc(100% - 32px));margin:auto;padding:35px 0 65px}.analytics .hero{padding:8px 0 20px}.eyebrow{font-size:10px;font-weight:900;letter-spacing:.16em;color:#7952c7}.analytics h1{font-size:clamp(32px,6vw,48px);letter-spacing:-.05em;margin:8px 0;color:#302342}.analytics .hero p{color:#81778f;margin:0 0 15px}.refresh{border:1px solid #d9cbed;background:#f0eafa;color:#513c78;padding:10px 14px;border-radius:11px;font-weight:800;cursor:pointer}.refresh:disabled{opacity:.6}.section-label{font-size:10px;font-weight:900;letter-spacing:.15em;color:#7952c7;margin:22px 0 8px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin:12px 0}.metric,.panel{background:#fff;border:1px solid #e5def1;border-radius:17px;box-shadow:0 8px 24px #39265d08}.metric{padding:15px}.metric span{display:block;color:#81778f;font-size:11px;font-weight:750}.metric strong{display:block;font-size:clamp(21px,4vw,29px);color:#302342;margin-top:7px}.columns{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin:13px 0}.panel{padding:17px;margin:13px 0}.columns .panel{margin:0}.panel-head{display:flex;justify-content:space-between;gap:8px;align-items:baseline;flex-wrap:wrap;margin-bottom:12px}.panel-head h2{font-size:16px;margin:0;color:#302342}.panel-head span,.method,.updated{font-size:10px;color:#91889e}.rows{display:grid}.item{display:grid;grid-template-columns:26px minmax(0,1fr) auto;gap:9px;align-items:center;padding:10px 2px;border-bottom:1px solid #f0ebf5}.item:last-child{border:0}.position{font-size:12px;color:#988da8}.item-main{min-width:0}.item-main strong{display:block;color:#342a43;font-size:13px;overflow-wrap:anywhere}.item-main small{display:block;color:#8a8298;font-size:10px}.value{font-size:13px;color:#5c4780;font-variant-numeric:tabular-nums}.notice{padding:18px;background:white;border:1px solid #e5def1;border-radius:14px;color:#716a80}.notice.error{color:#a23f5a}.method,.updated{line-height:1.5}.shell{background:#f7f5fc;min-height:100vh}@media(max-width:700px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.columns{grid-template-columns:1fr}.analytics{padding-top:23px}.metric{padding:12px}.topbar{height:auto;min-height:62px;padding:9px 12px;align-items:flex-start;flex-direction:column;gap:5px}.nav{width:100%;overflow:auto}.nav a{padding:8px 10px;white-space:nowrap}}`;
document.head.appendChild(css);
createRoot(document.getElementById("root")).render(h(React.StrictMode,null,h(BrowserRouter,null,h(App))));
