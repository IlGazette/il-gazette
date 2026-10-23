(function(){
"use strict";

const KEY = "gazette-lavoro-v2";
const $app = document.getElementById("app");
const CFG_VUOTA = {meta:{titolo:"Il Gazette",sottotitolo:"Il giornalino della nostra scuola",scuola:""},sezioni:[]};

/* stato in memoria: cfg = data/config.json, indice = data/indice.json, ed = { idEdizione: {articoli:[]} } */
const S = { cfg: null, indice: [], ed: {}, offline: false, draft: false };
let renderSeq = 0;
let PREVIEW = false;
function rota(id){ return (PREVIEW ? "#/redazione/anteprima/" : "#/ed/") + id; }

/* ---------- utilità ---------- */
function uid(){ return Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(-4); }
function el(tag, props, ...kids){
  const n = document.createElement(tag);
  for(const [k,v] of Object.entries(props || {})){
    if(v === null || v === undefined || v === false) continue;
    if(k === "class") n.className = v;
    else if(k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if(k === "value" || k === "checked" || k === "disabled") n[k] = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for(const c of kids.flat(Infinity)){
    if(c === null || c === undefined || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}
function mount(...items){
  const nodes = items.flat(Infinity)
    .filter(x => x !== null && x !== undefined && x !== false)
    .map(x => x instanceof Node ? x : document.createTextNode(String(x)));
  $app.append(...nodes);
}
function toast(msg, err){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast" + (err ? " err" : "");
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 3800);
}
function fmtDate(iso){
  if(!iso) return "";
  const d = new Date(iso + "T12:00:00");
  return isNaN(d) ? iso : d.toLocaleDateString("it-IT", {day:"numeric", month:"long", year:"numeric"});
}
function paragraphs(text){
  return String(text || "").split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
}
function parts(){ return location.hash.replace(/^#\/?/, "").split("/").filter(Boolean); }
function go(hash){ location.hash = hash; }
function secName(id){ const s = S.cfg.sezioni.find(x => x.id === id); return s ? s.nome : ""; }
function isRubrica(id){ const s = S.cfg.sezioni.find(x => x.id === id); return !!(s && s.rubrica); }
function metaOf(id){ return S.indice.find(e => e.id === id); }
function pubEditions(){ return S.indice.filter(e => e.stato === "pubblicata").sort((a,b) => b.numero - a.numero); }
function sortedEditions(){ return S.indice.slice().sort((a,b) => b.numero - a.numero); }

/* ---------- caricamento e salvataggio locale ---------- */
async function getJSON(path){
  const r = await fetch(path, {cache: "no-store"});
  if(!r.ok) throw new Error(path);
  return r.json();
}
function saveDraft(){
  try{
    localStorage.setItem(KEY, JSON.stringify({cfg: S.cfg, indice: S.indice, ed: S.ed}));
    S.draft = true;
  }catch(e){
    toast("Spazio del browser pieno: esporta i file per non perdere il lavoro", true);
  }
}
function changed(msg){ saveDraft(); if(msg) toast(msg); }
let saveTimer = null;
function saveSoon(){ clearTimeout(saveTimer); saveTimer = setTimeout(() => saveDraft(), 400); }

async function init(){
  let draft = null;
  try{ draft = JSON.parse(localStorage.getItem(KEY) || "null"); }catch(e){}
  try{
    const [cfg, idx] = await Promise.all([getJSON("data/config.json"), getJSON("data/indice.json")]);
    S.cfg = cfg; S.indice = idx.edizioni || [];
  }catch(e){
    S.offline = true;
    S.cfg = JSON.parse(JSON.stringify(CFG_VUOTA));
    S.cfg.sezioni = [{id:"attualita",nome:"Attualità",rubrica:false},{id:"meteo",nome:"Il meteo di classe",rubrica:true}];
    S.indice = [];
  }
  if(draft && draft.cfg){
    S.cfg = draft.cfg; S.indice = draft.indice || []; S.ed = draft.ed || {}; S.draft = true;
  }
}
async function edition(id){
  if(!S.ed[id]){
    try{ S.ed[id] = await getJSON("data/edizioni/" + id + ".json"); }
    catch(e){ S.ed[id] = {articoli: []}; }
    if(!Array.isArray(S.ed[id].articoli)) S.ed[id].articoli = [];
  }
  return S.ed[id];
}

/* ---------- testata e menu ---------- */
function masthead(meta){
  const m = S.cfg.meta;
  return el("header", {class:"masthead"},
    el("div", {class:"top"},
      el("span", null, meta ? ("N. " + meta.numero + " · " + fmtDate(meta.data)) : "Il giornale"),
      el("span", null, m.scuola || "")),
    el("div", {class:"name"}, el("a", {href:"#/"}, m.titolo)),
    el("p", {class:"tag"}, meta && meta.titolo ? meta.titolo : m.sottotitolo),
    el("hr", {class:"dbl"}));
}
function sectionNav(ed, active){
  const pubSecs = new Set();
  if(ed) ed.articoli.forEach(a => { if(a.stato === "pubblicato") pubSecs.add(a.sezione); });
  const links = [el("a", {href: "#/", "aria-current": active === "home" ? "page" : null}, "Prima pagina")];
  if(ed) S.cfg.sezioni.forEach(s => {
    if(pubSecs.has(s.id)) links.push(el("a", {href: rota(ed.meta.id) + "/s/" + s.id, "aria-current": active === s.id ? "page" : null}, s.nome));
  });
  links.push(el("a", {href: "#/archivio", "aria-current": active === "archivio" ? "page" : null}, "Archivio"));
  return el("nav", {class:"sections", "aria-label":"Sezioni"}, links);
}
function cardFor(meta, a){
  return el("article", {class:"card"},
    el("p", {class:"kicker"}, secName(a.sezione)),
    el("h3", null, el("a", {href:rota(meta.id) + "/a/" + a.id}, a.titolo || "Senza titolo")),
    a.sommario ? el("p", null, a.sommario) : null,
    el("p", {class:"muted"}, a.autori || ""));
}

/* ---------- vista lettore ---------- */
function articleView(meta, ed, a){
  const figs = (a.foto || []).map(f => el("figure", null,
    el("img", {src: f.src, alt: f.didascalia || a.titolo || "Foto", loading: "lazy"}),
    f.didascalia ? el("figcaption", null, f.didascalia) : null));
  const paras = paragraphs(a.corpo).map((p, i) => el("p", {class: i === 0 ? "first" : null}, p));
  return el("article", {class:"piece"},
    el("a", {class:"back", href:rota(meta.id)}, "← Torna alla prima pagina"),
    el("p", {class:"kicker"}, secName(a.sezione)),
    el("h1", null, a.titolo || "Senza titolo"),
    a.sommario ? el("p", {class:"deck"}, a.sommario) : null,
    el("p", {class:"muted"}, a.autori ? "di " + a.autori : ""),
    el("hr", {class:"hair"}),
    figs[0] || null,
    el("div", {class:"body"}, paras),
    figs.slice(1));
}
function editionView(meta, ed, section){
  const arts = ed.articoli.filter(a => a.stato === "pubblicato" && (!section || a.sezione === section));
  if(!arts.length) return el("p", {class:"empty"}, "Nessun articolo pubblicato qui.");
  if(section) return [el("h2", null, secName(section)), el("section", {class:"cards"}, arts.map(a => cardFor(meta, a)))];
  const [lead, ...rest] = arts;
  const rub = rest.filter(a => isRubrica(a.sezione));
  const normali = rest.filter(a => !isRubrica(a.sezione));
  return [
    el("section", {class:"lead"},
      el("p", {class:"kicker"}, secName(lead.sezione)),
      el("h2", null, el("a", {href:rota(meta.id) + "/a/" + lead.id}, lead.titolo || "Senza titolo")),
      lead.sommario ? el("p", {class:"sommario"}, lead.sommario) : null,
      el("p", {class:"muted"}, lead.autori || "")),
    normali.length ? el("section", {class:"cards"}, normali.map(a => cardFor(meta, a))) : null,
    rub.length ? [el("hr", {class:"hair"}), el("h2", null, "Rubriche"), el("section", {class:"cards"}, rub.map(a => cardFor(meta, a)))] : null
  ];
}
async function readerView(p){
  const pubs = pubEditions();
  if(p[0] === "archivio"){
    return [masthead(null), sectionNav(null, "archivio"), el("h2", null, "Archivio delle edizioni"),
      pubs.length ? el("ul", {class:"archive"}, pubs.map(e => el("li", null,
        el("a", {href:"#/ed/" + e.id}, "N. " + e.numero + " · " + (e.titolo || "")),
        el("div", {class:"muted"}, fmtDate(e.data))))) : el("p", {class:"empty"}, "Nessuna edizione pubblicata.")];
  }
  let meta = null;
  if(p[0] === "ed" && p[1]) meta = metaOf(p[1]);
  else meta = pubs[0] || null;
  if(!meta || meta.stato !== "pubblicata"){
    return [masthead(null), el("p", {class:"empty"}, "Non c'è ancora nessuna edizione pubblicata. Torna presto!")];
  }
  const ed = await edition(meta.id);
  const edx = {meta, articoli: ed.articoli};
  if(p[2] === "a"){
    const a = ed.articoli.find(x => x.id === p[3]);
    if(a && a.stato === "pubblicato")
      return [masthead(meta), sectionNav(edx, "articolo"), articleView(meta, ed, a)];
  }
  const section = (p[2] === "s") ? p[3] : null;
  return [masthead(meta), sectionNav(edx, section || "home"), editionView(meta, ed, section),
    meta.id !== pubs[0].id ? el("p", {class:"muted", style:"margin-top:20px"}, "Stai leggendo un'edizione passata. ", el("a", {href:"#/"}, "Vai all'ultima edizione")) : null];
}

/* ---------- anteprima (solo redazione) ---------- */
async function previewView(p){
  const meta = metaOf(p[0]);
  if(!meta) return [el("p", {class:"empty"}, "Numero non trovato."), el("a", {href:"#/redazione"}, "Torna alla dashboard")];
  const ed = await edition(meta.id);
  // copia solo per la visualizzazione: mostra anche le bozze, senza modificare i dati
  const all = {meta, articoli: ed.articoli.map(a => Object.assign({}, a, {stato: "pubblicato"}))};
  const banner = el("p", {class:"notice"},
    el("strong", null, "ANTEPRIMA. "),
    "Stai vedendo il numero come lo vedrebbero i lettori, comprese le bozze. Il sito pubblico non cambia finché non esporti e carichi i file su GitHub. ",
    el("a", {href:"#/redazione/ed/" + meta.id}, "Torna alla redazione"));
  if(p[1] === "a"){
    const a = all.articoli.find(x => x.id === p[2]);
    if(a) return [banner, masthead(meta), sectionNav(all, "articolo"), articleView(meta, all, a)];
  }
  const section = p[1] === "s" ? p[2] : null;
  return [banner, masthead(meta), sectionNav(all, section || "home"), editionView(meta, all, section)];
}

/* ---------- redazione ---------- */
function field(label, input, hint){
  return el("div", null, el("label", null, label), input, hint ? el("p", {class:"field-hint"}, hint) : null);
}
function textIn(value, on, props){
  const i = el("input", Object.assign({type:"text", value: value || ""}, props || {}));
  i.addEventListener("input", () => { on(i.value); saveSoon(); });
  return i;
}
function selectIn(options, value, on){
  const s = el("select", null, options.map(o => el("option", {value: o.v}, o.t)));
  s.value = value;
  s.addEventListener("change", () => on(s.value));
  return s;
}
function adminBar(){
  return el("div", {class:"adminbar"}, el("div", {class:"wrap"},
    el("div", {class:"row"},
      el("a", {class:"btn sec", href:"#/"}, "Vedi il giornale"),
      el("a", {class:"btn sec", href:"#/redazione"}, "Dashboard")),
    el("div", {class:"row"},
      el("button", {class:"btn sec", onclick: exportSezioni}, "Esporta sezioni"),
      el("label", {class:"btn sec", style:"margin:0;cursor:pointer"}, "Importa file .json",
        el("input", {type:"file", accept:".json,application/json", multiple:true, class:"sr-only", onchange: importFiles})),
      el("button", {class:"btn danger small", onclick: resetDraft}, "Ricarica dal sito"))));
}
function publishNote(){
  return el("p", {class:"notice"},
    "Come si pubblica: crea o modifica il numero, poi premi «Esporta questo numero». Verranno scaricati due file: il numero (es. ed-xxxx.json) e indice.json. Caricali su GitHub nella cartella data/edizioni/ e nella cartella data/ sostituendo i file con lo stesso nome. Se hai cambiato le sezioni, carica anche config.json.");
}

async function adminView(p){
  if(p[1] === "ed" && p[2]){
    const meta = metaOf(p[2]);
    if(!meta) return [el("p", {class:"empty"}, "Numero non trovato."), el("a", {href:"#/redazione"}, "Torna alla dashboard")];
    const ed = await edition(meta.id);
    if(p[3] === "art" && p[4]){
      const a = ed.articoli.find(x => x.id === p[4]);
      if(a) return articleEditor(meta, ed, a);
    }
    return editionEditor(meta, ed);
  }
  return dashboard();
}

function dashboard(){
  const newBtn = el("button", {class:"btn", onclick: () => {
    const numero = S.indice.length ? Math.max(...S.indice.map(e => e.numero)) + 1 : 1;
    const meta = {id: "ed-" + uid(), numero, titolo: "", data: new Date().toISOString().slice(0,10), stato: "bozza"};
    S.indice.push(meta); S.ed[meta.id] = {articoli: []};
    changed("Nuovo numero creato");
    go("#/redazione/ed/" + meta.id);
  }}, "Crea nuovo numero");
  const rows = sortedEditions().map(e => el("div", {class:"listrow"},
    el("div", null,
      el("span", {class:"t"}, "N. " + e.numero + (e.titolo ? " · " + e.titolo : "")),
      el("div", {class:"muted"}, fmtDate(e.data))),
    el("div", {class:"row"},
      el("span", {class:"badge " + (e.stato === "pubblicata" ? "pub" : "draft")}, e.stato === "pubblicata" ? "Pubblicato" : "Bozza"),
      el("a", {class:"btn sec small", href:"#/redazione/ed/" + e.id}, "Apri"))));

  const secRows = S.cfg.sezioni.map((s, i) => {
    const nome = textIn(s.nome, v => { s.nome = v.trim() || s.nome; saveSoon(); }, {"aria-label":"Nome sezione"});
    const rub = el("input", {type:"checkbox", checked: !!s.rubrica, "aria-label":"È una rubrica"});
    rub.addEventListener("change", () => { s.rubrica = rub.checked; changed("Sezione aggiornata"); });
    const del = el("button", {class:"btn danger small", onclick: () => {
      const used = Object.values(S.ed).some(ed => ed.articoli.some(a => a.sezione === s.id));
      if(used){ toast("Questa sezione è usata da alcuni articoli: spostali prima", true); return; }
      S.cfg.sezioni.splice(i, 1); changed("Sezione eliminata"); render();
    }}, "Elimina");
    return el("div", {class:"listrow"},
      el("div", {class:"row", style:"flex:1"}, nome,
        el("label", {style:"margin:0;font-weight:500;display:flex;gap:6px;align-items:center"}, rub, "Rubrica")),
      del);
  });
  const addSec = el("button", {class:"btn sec", onclick: () => {
    const nome = prompt("Nome della nuova sezione (es. Cucina, Lettere):");
    if(!nome || !nome.trim()) return;
    const base = nome.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sezione";
    S.cfg.sezioni.push({id: base + "-" + uid().slice(0,3), nome: nome.trim(), rubrica: false});
    changed("Sezione aggiunta"); render();
  }}, "+ Aggiungi sezione");

  return [adminBar(), el("h1", null, "Redazione"), publishNote(),
    el("div", {class:"row", style:"margin:8px 0 6px"}, newBtn),
    el("h2", {style:"margin-top:26px"}, "Numeri"),
    rows.length ? rows : el("p", {class:"empty"}, "Nessun numero ancora. Creane uno per iniziare."),
    el("hr", {class:"hair"}),
    el("h2", null, "Sezioni e rubriche"),
    el("p", {class:"field-hint"}, "Le rubriche sono sezioni fisse (es. Il meteo di classe) mostrate in fondo alla prima pagina."),
    secRows, el("div", {style:"margin-top:12px"}, addSec)];
}

function editionEditor(meta, ed){
  const num = el("input", {type:"number", min:"1", value: meta.numero});
  num.addEventListener("input", () => { meta.numero = parseInt(num.value, 10) || meta.numero; saveSoon(); });
  const dat = el("input", {type:"date", value: meta.data || ""});
  dat.addEventListener("input", () => { meta.data = dat.value; saveSoon(); });
  const tit = textIn(meta.titolo, v => { meta.titolo = v; }, {placeholder:"Es. «Speciale Natale» (facoltativo)"});
  const sta = selectIn([{v:"bozza", t:"Bozza (non visibile)"}, {v:"pubblicata", t:"Pubblicata (visibile sul sito)"}], meta.stato,
    v => { meta.stato = v; changed("Stato del numero aggiornato"); render(); });

  const arts = ed.articoli.map((a, i) => el("div", {class:"listrow"},
    el("div", null,
      el("span", {class:"t"}, a.titolo || "Senza titolo"),
      el("div", {class:"muted"}, secName(a.sezione) + (a.autori ? " · " + a.autori : ""))),
    el("div", {class:"row"},
      el("span", {class:"badge " + (a.stato === "pubblicato" ? "pub" : "draft")}, a.stato === "pubblicato" ? "Pubblicato" : "Bozza"),
      el("button", {class:"btn sec small", disabled: i === 0, "aria-label":"Sposta su", onclick: () => { [ed.articoli[i-1], ed.articoli[i]] = [ed.articoli[i], ed.articoli[i-1]]; changed("Ordine aggiornato"); render(); }}, "↑"),
      el("button", {class:"btn sec small", disabled: i === ed.articoli.length - 1, "aria-label":"Sposta giù", onclick: () => { [ed.articoli[i+1], ed.articoli[i]] = [ed.articoli[i], ed.articoli[i+1]]; changed("Ordine aggiornato"); render(); }}, "↓"),
      el("a", {class:"btn sec small", href:"#/redazione/ed/" + meta.id + "/art/" + a.id}, "Modifica"))));

  const newArt = el("button", {class:"btn", onclick: () => {
    const a = {id: uid(), titolo:"", sommario:"", autori:"", sezione: S.cfg.sezioni[0] ? S.cfg.sezioni[0].id : "", stato:"bozza", corpo:"", foto:[]};
    ed.articoli.push(a); changed("Articolo creato");
    go("#/redazione/ed/" + meta.id + "/art/" + a.id);
  }}, "Nuovo articolo");
  const exp = el("button", {class:"btn", onclick: () => exportNumero(meta, ed)}, "Esporta questo numero");
  const prevNum = el("a", {class:"btn sec", href:"#/redazione/anteprima/" + meta.id}, "Anteprima del numero");
  const del = el("button", {class:"btn danger small", onclick: () => {
    if(!confirm("Eliminare questo numero e i suoi articoli?")) return;
    S.indice = S.indice.filter(e => e.id !== meta.id); delete S.ed[meta.id];
    changed("Numero eliminato: ricorda di cancellare anche data/edizioni/" + meta.id + ".json su GitHub");
    go("#/redazione");
  }}, "Elimina numero");

  return [adminBar(),
    el("a", {class:"back", href:"#/redazione"}, "← Dashboard"),
    el("h1", null, "Numero " + meta.numero),
    el("div", {class:"grid2"},
      field("Numero", num), field("Data di uscita", dat),
      field("Titolo del numero", tit, "Lascia vuoto se non serve."),
      field("Stato", sta, "Solo i numeri pubblicati sono visibili sul sito.")),
    el("hr", {class:"hair"}),
    el("div", {class:"row", style:"justify-content:space-between"}, el("h2", null, "Articoli"), newArt),
    el("div", {style:"margin-top:10px"}, arts.length ? arts : el("p", {class:"empty"}, "Nessun articolo. Usa «Nuovo articolo».")),
    el("hr", {class:"hair"}),
    el("div", {class:"row"}, exp, prevNum, el("span", {style:"flex:1"}), del)];
}

function articleEditor(meta, ed, a){
  const sel = selectIn(S.cfg.sezioni.map(s => ({v: s.id, t: s.nome + (s.rubrica ? " (rubrica)" : "")})), a.sezione,
    v => { a.sezione = v; changed("Sezione aggiornata"); });
  const sta = selectIn([{v:"bozza", t:"Bozza (non visibile)"}, {v:"pubblicato", t:"Pubblicato (visibile)"}], a.stato,
    v => { a.stato = v; changed("Stato dell'articolo aggiornato"); render(); });
  const corpo = el("textarea", {id:"corpo", "aria-label":"Testo dell'articolo"});
  corpo.value = a.corpo || "";
  corpo.addEventListener("input", () => { a.corpo = corpo.value; saveSoon(); });

  const fileIn = el("input", {type:"file", accept:"image/*", multiple:true, class:"sr-only"});
  fileIn.addEventListener("change", async () => {
    for(const f of Array.from(fileIn.files || [])){
      try{ a.foto = a.foto || []; a.foto.push({src: await compressImage(f), didascalia: ""}); }
      catch(e){ toast("Foto non leggibile: " + f.name, true); }
    }
    changed("Foto aggiunte"); render();
  });
  const n = (a.foto || []).length;
  const photos = (a.foto || []).map((f, i) => el("div", {class:"photo-tile"},
    el("img", {src: f.src, alt: "Foto " + (i+1)}),
    el("div", null,
      textIn(f.didascalia, v => { f.didascalia = v; }, {placeholder:"Didascalia (es. La squadra in palestra)", "aria-label":"Didascalia"}),
      el("div", {class:"acts"},
        el("button", {class:"btn sec small", disabled: i === 0, onclick: () => { [a.foto[i-1], a.foto[i]] = [a.foto[i], a.foto[i-1]]; changed(); render(); }}, "Sposta su"),
        el("button", {class:"btn sec small", disabled: i === n - 1, onclick: () => { [a.foto[i+1], a.foto[i]] = [a.foto[i], a.foto[i+1]]; changed(); render(); }}, "Sposta giù"),
        el("button", {class:"btn danger small", onclick: () => { if(confirm("Rimuovere questa foto?")){ a.foto.splice(i, 1); changed("Foto rimossa"); render(); } }}, "Rimuovi")))));

  const save = el("button", {class:"btn sec", onclick: () => changed("Bozza salvata")}, "Salva bozza");
  const publish = el("button", {class:"btn", onclick: () => {
    if(!a.titolo || !a.corpo){ toast("Per pubblicare servono almeno titolo e testo", true); return; }
    a.stato = "pubblicato"; changed("Articolo pubblicato: ora esporta il numero"); render();
  }}, "Pubblica articolo");
  const del = el("button", {class:"btn danger small", onclick: () => {
    if(!confirm("Eliminare questo articolo?")) return;
    ed.articoli = ed.articoli.filter(x => x.id !== a.id); changed("Articolo eliminato");
    go("#/redazione/ed/" + meta.id);
  }}, "Elimina articolo");

  const titolo = textIn(a.titolo, v => { a.titolo = v; }, {placeholder:"Il titolo dell'articolo"});
  const autori = textIn(a.autori, v => { a.autori = v; }, {placeholder:"Es. Sofia e Marco, classe 5B"});
  const sommario = textIn(a.sommario, v => { a.sommario = v; }, {placeholder:"Facoltativo"});

  return [adminBar(),
    el("a", {class:"back", href:"#/redazione/ed/" + meta.id}, "← Numero " + meta.numero),
    el("h1", null, a.titolo || "Nuovo articolo"),
    el("div", {class:"grid2"}, field("Titolo", titolo), field("Autori", autori)),
    field("Sommario (una riga che introduce l'articolo)", sommario),
    el("div", {class:"grid2"}, field("Sezione o rubrica", sel), field("Stato", sta)),
    el("label", {for:"corpo"}, "Testo"),
    corpo,
    el("p", {class:"field-hint"}, "Separa i paragrafi con una riga vuota. Il primo paragrafo avrà la lettera iniziale decorata."),
    el("hr", {class:"hair"}),
    el("div", {class:"row", style:"justify-content:space-between"}, el("h2", {style:"margin:0"}, "Foto"),
      el("label", {class:"btn sec small", style:"margin:0;cursor:pointer"}, "Aggiungi foto", fileIn)),
    el("p", {class:"field-hint"}, "Le foto vengono ridotte automaticamente per restare leggere."),
    photos.length ? photos : el("p", {class:"empty", style:"padding:14px 0"}, "Nessuna foto."),
    el("hr", {class:"hair"}),
    el("div", {class:"row"}, publish, save,
      el("a", {class:"btn sec", href:"#/redazione/anteprima/" + meta.id + "/a/" + a.id}, "Anteprima articolo"),
      el("span", {style:"flex:1"}), del)];
}

function compressImage(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const s = Math.min(1, 800 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.75));
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

/* ---------- esportazione / importazione ---------- */
function download(name, text){
  const url = URL.createObjectURL(new Blob([text], {type: "application/json"}));
  const a = el("a", {href: url, download: name});
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function exportNumero(meta, ed){
  download(meta.id + ".json", JSON.stringify({articoli: ed.articoli}, null, 2));
  await sleep(500);
  download("indice.json", JSON.stringify({edizioni: S.indice}, null, 2));
  toast("Scaricati 2 file. Caricali su GitHub in data/edizioni/ e in data/ (sostituisci i file con lo stesso nome).");
}
function exportSezioni(){
  download("config.json", JSON.stringify(S.cfg, null, 2));
  toast("Scaricato config.json: caricalo su GitHub in data/");
}
async function importFiles(ev){
  const files = Array.from(ev.target.files || []);
  let ok = 0;
  for(const f of files){
    try{
      const d = JSON.parse(await f.text());
      if(f.name === "indice.json" && Array.isArray(d.edizioni)){ S.indice = d.edizioni; ok++; }
      else if(f.name === "config.json" && d.sezioni){ S.cfg = d; ok++; }
      else if(Array.isArray(d.articoli)){ S.ed[f.name.replace(/\.json$/, "")] = {articoli: d.articoli}; ok++; }
    }catch(e){ toast("File non valido: " + f.name, true); }
  }
  ev.target.value = "";
  if(ok){ changed("Importati " + ok + " file"); render(); }
}
async function resetDraft(){
  if(!confirm("Scartare le modifiche locali e tornare alla versione pubblicata sul sito?")) return;
  try{ localStorage.removeItem(KEY); }catch(e){}
  S.ed = {}; S.draft = false;
  await init(); render(); toast("Ricaricato dal sito");
}

/* ---------- router ---------- */
async function render(){
  const seq = ++renderSeq;
  const p = parts();
  const nodes = [];
  if(S.offline && !S.draft){
    nodes.push(el("p", {class:"notice"}, "Per vedere i numeri il sito deve essere aperto da un server, per esempio GitHub Pages. Aprendo il file direttamente dal computer le edizioni non si caricano."));
  }
  PREVIEW = (p[0] === "redazione" && p[1] === "anteprima");
  if(PREVIEW){ nodes.push(...(await previewView(p.slice(2))).flat()); }
  else if(p[0] === "redazione"){ nodes.push(...(await adminView(p)).flat()); }
  else { nodes.push(...(await readerView(p)).flat()); }
  if(seq !== renderSeq) return;
  $app.innerHTML = "";
  mount(nodes);
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", render);
init().then(render);
})();
