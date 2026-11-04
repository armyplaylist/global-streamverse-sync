import React,{useEffect,useMemo,useState}from"react";
import{createRoot}from"react-dom/client";
import{BrowserRouter,NavLink,useLocation}from"react-router-dom";
const h=React.createElement;
const LEGACY="/legacy";
const fmt=v=>new Intl.NumberFormat("es-MX").format(Number(v||0));
const safeUrl=v=>{try{const u=new URL(v);return u.protocol==="https:"?u.href:""}catch{return""}};
const releaseType=v=>v==="album"?"Álbum":v==="single"?"Single":v==="compilation"?"Compilación":v||"Lanzamiento";
const duration=v=>{const ms=Number(v);if(!Number.isFinite(ms)||ms<=0)return"";const s=Math.floor(ms/1000);return Math.floor(s/60)+":"+String(s%60).padStart(2,"0")};
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
function Tracks(){
 const[payload,setPayload]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[reload,setReload]=useState(0),[view,setView]=useState("tracks"),[period,setPeriod]=useState("total"),[query,setQuery]=useState(""),[selected,setSelected]=useState(null);
 useEffect(()=>{let live=true;setLoading(true);setError("");fetch("/api/catalog").then(async r=>{if(!r.ok)throw Error("No se pudo cargar el catálogo global.");return r.json()}).then(d=>{if(live)setPayload(d)}).catch(e=>{if(live)setError(e.message||"Error de conexión")}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[reload]);
 const rows=payload?.rows||[];
 const albumGroups=useMemo(()=>{
  const known=new Map(),possible=new Map();
  for(const row of rows){
   if(row.match_status==="matched"&&row.album_name&&row.album_uri){
    const key=row.album_uri;
    if(!known.has(key))known.set(key,{key,name:row.album_name,image:row.album_image_url,type:row.album_type,date:row.album_release_date,rows:[],total:0,candidate:false});
    const a=known.get(key),id=String(row.musicat_track_id||row.track_id||row.track_name+"|"+row.artist_name);
    if(!a.rows.some(x=>String(x.musicat_track_id||x.track_id||x.track_name+"|"+x.artist_name)===id)){a.rows.push(row);a.total+=Number(row.total_streams)||0}
   }
   if(row.match_status==="ambiguous"&&Array.isArray(row.spotify_candidates)){
    for(const c of row.spotify_candidates){
     if(!c.album_uri||!c.album_name)continue;
     if(!possible.has(c.album_uri))possible.set(c.album_uri,{key:c.album_uri,name:c.album_name,image:c.album_image_url,type:c.album_type,date:c.album_release_date,rows:[],total:null,candidate:true});
     const a=possible.get(c.album_uri);
     if(!a.rows.some(x=>x.musicat_track_id===row.musicat_track_id))a.rows.push(row);
    }
   }
  }
  return {known:[...known.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name)),possible:[...possible.values()].filter(a=>!known.has(a.key)).sort((a,b)=>a.name.localeCompare(b.name))};
 },[rows]);
 const term=query.trim().toLocaleLowerCase();
 const visibleRows=rows.filter(r=>([r.track_name,r.artist_name,r.album_name,...(r.used_albums||[])].join(" ").toLocaleLowerCase().includes(term))).sort((a,b)=>{
  const key=period==="today"?"today_streams":period==="week"?"week_streams":period==="month"?"month_streams":"total_streams";
  return (Number(b[key])||0)-(Number(a[key])||0);
 });
 const visibleAlbums=albumGroups.known.filter(a=>(a.name+" "+a.rows.map(r=>r.track_name).join(" ")).toLocaleLowerCase().includes(term));
 const visibleCandidates=albumGroups.possible.filter(a=>(a.name+" "+a.rows.map(r=>r.track_name).join(" ")).toLocaleLowerCase().includes(term));
 const selectedAlbum=[...albumGroups.known,...albumGroups.possible].find(a=>a.key===selected);
 const summary=payload?.python_analytics?.summary||{};
 const countFor=r=>Number(r[period==="today"?"today_streams":period==="week"?"week_streams":period==="month"?"month_streams":"total_streams"])||0;
 const card=(a)=>h("button",{className:"album-card"+(a.candidate?" candidate":""),key:a.key,onClick:()=>setSelected(a.key)},a.image&&safeUrl(a.image)?h("img",{className:"album-cover",src:safeUrl(a.image),alt:"Portada "+a.name,loading:"lazy"}):h("div",{className:"album-cover placeholder"},"♫"),h("span",{className:"album-info"},h("strong",null,a.name),h("small",null,releaseType(a.type)+(a.date?" · "+a.date:"")),a.candidate?h("em",null,"Versión por confirmar"):h("em",null,"En catálogo")),h("span",{className:"album-playcount"},a.candidate?"—":fmt(a.total),h("small",null,a.candidate?"Sin atribución":"reproducciones")),h("span",{className:"album-arrow"},"›"));
 const spotifyMark=h("span",{className:"spotify-mark"},"●");
 return h("main",{className:"tracks-page"},
  h("section",{className:"tracks-hero"},h("div",{className:"eyebrow"},"GLOBAL SONG CHARTS"),h("h1",null,"TRACKS ",h("span",null,"VERSE")),h("p",null,"Canciones, lanzamientos y reproducciones registradas por la comunidad.")),
  h("section",{className:"metrics"},[["Reproducciones",summary.total_streams],["Canciones",summary.tracks],["Identificadas",summary.matched_tracks]].map(([label,value])=>h("article",{className:"metric",key:label},h("span",null,label),h("strong",null,fmt(value))))),
  h("div",{className:"tabs"},h("button",{className:view==="tracks"?"active":"",onClick:()=>{setView("tracks");setSelected(null)}},"Canciones"),h("button",{className:view==="albums"?"active":"",onClick:()=>{setView("albums");setSelected(null)}},"Álbumes")),
  h("section",{className:"toolbar"},view==="tracks"?h("div",{className:"periods"},[["total","Total"],["today","Hoy"],["week","7 días"],["month","Mes"]].map(([k,label])=>h("button",{key:k,className:period===k?"active":"",onClick:()=>setPeriod(k)},label))):null,
   h("input",{className:"search",value:query,onChange:e=>setQuery(e.target.value),placeholder:"Buscar canción, artista o álbum…","aria-label":"Buscar canción, artista o álbum"}),
   h("button",{className:"refresh",onClick:()=>setReload(x=>x+1),disabled:loading},loading?"Actualizando…":"↻ Actualizar")),
  loading&&!payload?h("div",{className:"empty"},"Preparando el catálogo…"):null,
  error?h("div",{className:"empty error"} ,error):null,
  selectedAlbum?h("section",{className:"album-detail"},
   h("button",{className:"back",onClick:()=>setSelected(null)},"← Volver a álbumes"),
   selectedAlbum.image&&safeUrl(selectedAlbum.image)?h("img",{className:"detail-cover",src:safeUrl(selectedAlbum.image),alt:"Portada "+selectedAlbum.name}):null,
   h("div",{className:"detail-count"},selectedAlbum.candidate?"—":fmt(selectedAlbum.total),h("small",null,selectedAlbum.candidate?"Sin atribución":"reproducciones del álbum")),
   h("h2",null,selectedAlbum.name),h("p",null,releaseType(selectedAlbum.type)+(selectedAlbum.date?" · "+selectedAlbum.date:"")+" · "+selectedAlbum.rows.length+" canciones"),
   h("p",{className:"method"},selectedAlbum.candidate?"Esta es una versión candidata. No se atribuyen streams hasta confirmar la edición correcta.":"Total calculado sumando las canciones con coincidencia única asociadas a este lanzamiento."),
   h("div",{className:"track-list"},[...selectedAlbum.rows].sort((a,b)=>(Number(a.disc_number)||1)-(Number(b.disc_number)||1)||(Number(a.track_number)||999)-(Number(b.track_number)||999)).map((r,i)=>h("div",{className:"album-track",key:r.musicat_track_id||r.track_name},h("span",{className:"position"},i+1),h("div",null,h("strong",null,r.track_name),h("small",null,r.artist_name)),h("b",null,selectedAlbum.candidate?"—":fmt(r.total_streams)))))
  ):view==="tracks"?h("section",{className:"track-list"},visibleRows.length?visibleRows.map((r,i)=>{
   const observed=(r.used_album_covers||[]).map(safeUrl).filter(Boolean);
   const cover=observed[0]||(r.match_status==="matched"?safeUrl(r.album_image_url):"");
   const albumText=(r.used_albums||[]).length?"Ediciones identificadas: "+r.used_albums.join(" · "):r.match_status==="matched"?"Referencia: "+(r.album_name||"álbum no indicado"):"Edición aún no confirmada";
   const status=r.match_status==="matched"?"Spotify verificado":r.match_status==="ambiguous"?"Versión por confirmar":"Catálogo pendiente";
   const url=r.match_status==="matched"?safeUrl(r.spotify_track_url):"";
   return h("article",{className:"track-card",key:r.musicat_track_id||r.track_name},cover?h("img",{className:"track-cover",src:cover,alt:"Portada de "+r.track_name,loading:"lazy"}):h("div",{className:"track-cover placeholder"},"♫"),
    h("div",{className:"track-main"},h("span",{className:"rank"},"#"+(i+1)),h("strong",null,r.track_name),h("small",null,r.artist_name),h("p",null,albumText),h("em",{className:"tag"} ,status),url?h("a",{className:"spotify-link",href:url,target:"_blank",rel:"noopener"},spotifyMark," Abrir en Spotify"):null),
    h("div",{className:"track-count"},fmt(countFor(r)),h("small",null,"reproducciones"))
   );
  }):h("div",{className:"empty"},"No hay canciones para esta búsqueda o periodo.")
  ):h("section",{className:"album-section"},
   h("div",null,h("h2",null,"Álbumes del catálogo"),h("div",{className:"album-grid"},visibleAlbums.length?visibleAlbums.map(card):h("div",{className:"empty"},"Todavía no hay álbumes confirmados para esta búsqueda."))),
   h("div",null,h("h2",null,"Versiones por confirmar"),h("p",null,"Se muestran por separado y no reciben streams atribuidos."),h("div",{className:"album-grid"},visibleCandidates.length?visibleCandidates.map(card):h("div",{className:"empty"},"No hay versiones candidatas pendientes.")))
  ),
  h("p",{className:"updated"},"Spotify: portadas y metadatos · Musicat: reproducciones. "+(payload?.generated_at?"Actualizado "+new Date(payload.generated_at).toLocaleString("es-MX",{dateStyle:"medium",timeStyle:"short"}):""))
 );
}
function App(){
 const location=useLocation(),isAnalytics=location.pathname==="/analytics",isTracks=location.pathname==="/tracks.html"||location.pathname==="/tracks";
 const target=location.pathname==="/profile"||location.pathname==="/profile.html"?LEGACY+"/profile.html"+location.search:LEGACY+"/index.html"+location.search;
 return h("div",{className:"shell"},
  h("header",{className:"topbar"},h("a",{className:"brand",href:"/"},"GLOBAL ",h("span",null,"STREAMVERSE")),h("nav",{className:"nav","aria-label":"Navegación principal"},
   h(NavLink,{to:"/",end:true,className:({isActive})=>isActive?"active":""},"Inicio"),
   h(NavLink,{to:"/tracks.html",className:({isActive})=>isActive?"active":""},"Canciones y álbumes"),
   h(NavLink,{to:"/analytics",className:({isActive})=>isActive?"active":""},"Estadísticas"),
   h(NavLink,{to:"/profile.html",className:({isActive})=>isActive?"active":""},"Perfil")
  )),
  isAnalytics?h(Analytics):isTracks?h(Tracks):h("main",{className:"content"},h("iframe",{className:"legacy",title:"GLOBAL STREAMVERSE",src:target,allow:"clipboard-read; clipboard-write"}))
 );
}
const css=document.createElement("style");
css.textContent=`.analytics,.tracks-page{width:min(1120px,calc(100% - 32px));margin:auto;padding:35px 0 65px}.analytics .hero,.tracks-hero{padding:8px 0 20px}.eyebrow{font-size:10px;font-weight:900;letter-spacing:.16em;color:#7952c7}.analytics h1,.tracks-hero h1{font-size:clamp(32px,6vw,48px);letter-spacing:-.05em;margin:8px 0;color:#302342}.analytics .hero p,.tracks-hero p{color:#81778f;margin:0 0 15px}.refresh{border:1px solid #d9cbed;background:#f0eafa;color:#513c78;padding:10px 14px;border-radius:11px;font-weight:800;cursor:pointer}.refresh:disabled{opacity:.6}.section-label{font-size:10px;font-weight:900;letter-spacing:.15em;color:#7952c7;margin:22px 0 8px}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px;margin:12px 0}.metric,.panel{background:#fff;border:1px solid #e5def1;border-radius:17px;box-shadow:0 8px 24px #39265d08}.metric{padding:15px}.metric span{display:block;color:#81778f;font-size:11px;font-weight:750}.metric strong{display:block;font-size:clamp(21px,4vw,29px);color:#302342;margin-top:7px}.columns{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin:13px 0}.panel{padding:17px;margin:13px 0}.columns .panel{margin:0}.panel-head{display:flex;justify-content:space-between;gap:8px;align-items:baseline;flex-wrap:wrap;margin-bottom:12px}.panel-head h2{font-size:16px;margin:0;color:#302342}.panel-head span,.method,.updated{font-size:10px;color:#91889e}.rows{display:grid}.item{display:grid;grid-template-columns:26px minmax(0,1fr) auto;gap:9px;align-items:center;padding:10px 2px;border-bottom:1px solid #f0ebf5}.item:last-child{border:0}.position,.rank{font-size:12px;color:#988da8}.item-main{min-width:0}.item-main strong{display:block;color:#342a43;font-size:13px;overflow-wrap:anywhere}.item-main small{display:block;color:#8a8298;font-size:10px}.value{font-size:13px;color:#5c4780;font-variant-numeric:tabular-nums}.notice,.empty{padding:22px;background:#fff;border:1px solid #e5def1;border-radius:14px;color:#716a80;text-align:center}.notice.error,.empty.error{color:#a23f5a}.method,.updated{line-height:1.5}.shell{background:#f7f5fc;min-height:100vh}.tracks-hero h1{font-size:clamp(36px,7vw,54px)}.tracks-hero h1 span{color:#7952c7}.tabs{display:flex;gap:8px;margin:18px 0 12px}.tabs button,.periods button,.back{border:1px solid #ded5ea;background:#fff;color:#5c526d;border-radius:10px;padding:10px 15px;font-weight:850;cursor:pointer}.tabs button.active,.periods button.active{background:#e9defb;border-color:#a98bdb;color:#4e347c}.toolbar{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:14px;background:#fff;border:1px solid #e5def1;border-radius:16px;margin:16px 0}.periods{display:flex;gap:6px;flex-wrap:wrap}.periods button{padding:8px 11px;font-size:11px}.search{flex:1;min-width:180px;max-width:360px;padding:10px 12px;border:1px solid #d8d0e3;border-radius:10px;font:inherit;color:#292238;background:#fff}.track-list{display:grid;gap:9px}.track-card{padding:12px;background:#fff;border:1px solid #e5def1;border-radius:15px;display:grid;grid-template-columns:70px minmax(0,1fr) auto;gap:13px;align-items:center}.track-cover{width:70px;height:70px;border-radius:10px;object-fit:cover;background:#f1edf6}.placeholder{display:grid;place-items:center;color:#9b8ab8;font-size:24px}.track-main{min-width:0}.track-main>strong{display:block;font-size:14px;color:#302342}.track-main>small{display:block;color:#716a80;font-size:11px}.track-main p{font-size:10px;color:#8a8298;margin:5px 0}.tag{display:inline-block;font-style:normal;font-size:9px;font-weight:800;background:#f2edf9;color:#6e5597;padding:4px 7px;border-radius:7px}.spotify-link{display:inline-block;color:#247347;font-size:10px;font-weight:800;text-decoration:none;margin-left:8px}.spotify-mark{color:#1db954}.track-count{text-align:right;font-size:18px;font-weight:900;white-space:nowrap;color:#302342}.track-count small{display:block;font-size:9px;color:#8a8298;font-weight:600}.album-section{display:grid;gap:22px}.album-section h2{font-size:18px;margin:4px 0 8px;color:#302342}.album-section>div>p{font-size:11px;color:#81778f}.album-grid{display:grid;grid-template-columns:1fr;gap:0}.album-card{width:100%;text-align:left;color:inherit;font:inherit;background:#fff;border:1px solid #e5def1;border-bottom:0;padding:11px 13px;display:grid;grid-template-columns:60px minmax(0,1fr) auto 18px;gap:12px;align-items:center;cursor:pointer}.album-card:first-child{border-radius:14px 14px 0 0}.album-card:last-child{border-bottom:1px solid #e5def1;border-radius:0 0 14px 14px}.album-card.candidate{border-left:3px dashed #b9a4d8;background:#fdfcff}.album-cover{width:60px;height:60px;border-radius:9px;object-fit:cover;background:#f1edf6}.album-info{min-width:0}.album-info strong,.album-info small,.album-info em{display:block}.album-info strong{font-size:13px;color:#302342}.album-info small{font-size:10px;color:#81778f;margin-top:3px}.album-info em{font-size:9px;font-style:normal;color:#6e5597;margin-top:5px;font-weight:800}.album-playcount{text-align:right;font-size:13px;font-weight:900;white-space:nowrap;color:#302342}.album-playcount small{display:block;font-size:9px;color:#81778f;font-weight:600}.album-arrow{font-size:20px;color:#8b7a9f}.album-detail{background:#fff;border:1px solid #e5def1;border-radius:16px;padding:17px;text-align:center}.album-detail .back{display:block;margin-bottom:18px}.detail-cover{width:150px;height:150px;object-fit:cover;border-radius:13px;margin:0 auto 12px;display:block}.detail-count{font-size:27px;font-weight:950;color:#302342}.detail-count small{display:block;font-size:10px;color:#81778f;font-weight:700}.album-detail h2{font-size:20px;margin:8px 0}.album-detail>p{font-size:11px;color:#81778f}.album-detail .method{max-width:600px;margin:8px auto 16px}.album-track{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;text-align:left;align-items:center;padding:11px 5px;border-top:1px solid #f0ebf5}.album-track strong,.album-track small{display:block}.album-track strong{font-size:12px}.album-track small{font-size:10px;color:#81778f}.album-track>b{font-size:12px}.updated{margin-top:18px}.content{flex:1;min-height:0;display:flex}.legacy{border:0;width:100%;height:calc(100vh - 66px);min-height:650px;background:#f7f5fc}@media(max-width:700px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.columns{grid-template-columns:1fr}.analytics,.tracks-page{padding-top:23px}.metric{padding:12px}.topbar{height:auto;min-height:62px;padding:9px 12px;align-items:flex-start;flex-direction:column;gap:5px}.nav{width:100%;overflow:auto}.nav a{padding:8px 10px;white-space:nowrap}.track-card{grid-template-columns:60px minmax(0,1fr) auto;gap:9px;padding:9px}.track-cover{width:60px;height:60px}.track-count{font-size:15px}.album-card{grid-template-columns:52px minmax(0,1fr) auto 12px;gap:9px;padding:10px 8px}.album-cover{width:52px;height:52px}.search{max-width:none;width:100%}.toolbar{align-items:stretch}}`;
document.head.appendChild(css);
createRoot(document.getElementById("root")).render(h(React.StrictMode,null,h(BrowserRouter,null,h(App))));
