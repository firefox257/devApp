/* ============================================================
 * kittentts.js — KittenTTS engine library
 * Misaki-aligned phoneme pipeline (espeak.py reference)
 * ============================================================ */

// Node.js / CommonJS compatibility layer
// Allows requiring dependencies locally instead of using native fetch/CDN
let nodeOrt = null;
let nodePhonemizer = null;
if (typeof window === 'undefined' && typeof require !== 'undefined') {
  try { nodeOrt = require('onnxruntime-web'); } catch (e) { /* ignore */ }
  try { nodePhonemizer = require('phonemizer'); } catch (e) { /* ignore */ }
}

const DEFAULTS = {
  modelPath: 'kitten_tts_2_nano_en.onnx',
  voicesPath: 'voices_en.npz',
  goldPath: 'us_gold.json',
  speed: 1, volume: 0.85, muted: false, voice: 0,
  gap: 120, fade: 12, normalizePeaks: true, strictIntegrity: true,
  phonEngine: 'espeak', tokenMode: 'phonemes',
  misakiStress: true,   // true = keep ˈ ˌ like Misaki; false = strip them
  misakiVersion: '1.0', // '1.0' = ɾ→T, ʔ→t; '2.0' = leave them alone
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
//const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
const nextFrame = () => new Promise(r => (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(r) : setTimeout(r, 0)));


const STOPS='p b t d k g ɡ ʔ ɾ ʈ ɖ c ɟ q ʡ', FRICS='f v θ ð s z ʃ ʒ ʂ ʐ ɕ ʑ ç x ɣ χ h ɦ ɸ β ʁ ħ ʕ ʝ ɧ ʢ',
      NASALS='m n ŋ ɳ ɲ ɴ ɱ', LATS='l ɫ ɬ ɮ ʎ ʟ ɺ', RHOT='ɹ r ɻ ɽ', GLIDES='j w ɥ ɰ ʍ';
const AFFR={'ʧ':1,'ʤ':1,'ʦ':1,'ʣ':1,'ʨ':1,'ʥ':1,'ʈʂ':1}, RHV={'ɚ':1,'ɝ':1,'ɜ˞':1,'ɐ˞':1};
function classOf(ch){
  if(AFFR[ch])return 'TF'; if(RHV[ch])return 'R';
  if(STOPS.includes(ch)&&ch!==' ')return 'T'; if(FRICS.includes(ch)&&ch!==' ')return 'F';
  if(NASALS.includes(ch)&&ch!==' ')return 'N'; if(LATS.includes(ch)&&ch!==' ')return 'L';
  if(RHOT.includes(ch)&&ch!==' ')return 'R'; if(GLIDES.includes(ch)&&ch!==' ')return 'G';
  return '';
}
const signature = s => Array.from(String(s||'')).map(classOf).join('');
const IPA_RE = /[əɪʊæɹˈˌɛɑɔɜŋθðʃʒɡɾʔːɐɒβɕçɖɟɥɨʝɯɰɳɲɴøɸœɻʁɽʂʈʋʌɣɤχʎʤʧʣʥʦʨɚɝ]/;

/* ============================================================
 * Misaki E2M rules — tie bar optional so it works whether the
 * JS phonemizer emits '^' ties or not.
 * Order matters: longer patterns first, 'e'→'A' last.
 * ============================================================ */
const MISAKI_E2M = [
  [/ʔˌn\u0329/g, 'ʔn'], [/ʔn\u0329/g, 'ʔn'],     // MUST run before any stress strip
  [/a\^?ɪ/g, 'I'], [/a\^?ʊ/g, 'W'],
  [/d\^?ʒ/g, 'ʤ'], [/e\^?ɪ/g, 'A'],
  [/t\^?ʃ/g, 'ʧ'], [/ɔ\^?ɪ/g, 'Y'],
  [/o\^?ʊ/g, 'O'],                                  // en-us GOAT branch
  [/ə\^l/g, 'ᵊl'],                                  // tie REQUIRED (Python only converts tied)
  [/ʲo/g, 'jo'], [/ʲə/g, 'jə'],
  [/ʲ/g, ''], [/ɚ/g, 'əɹ'], [/r/g, 'ɹ'],
  [/x/g, 'k'], [/ç/g, 'k'], [/ɐ/g, 'ə'],
  [/ɬ/g, 'l'], [/\u0303/g, ''],
  [/e/g, 'A'],                                      // 1-char group MUST be last
];

// Symbols that should NEVER reach the model — if they do, a rule is missing
const MISAKI_LEAK = /[ːʲɚrxçɐoɾʔ\u0303\u0329^]/;

/* ============================================================
 * Vocab fallback — object keyed by character, values are token IDs.
 * PUA gap entries (\ueXXX) removed: object keys don't shift indices.
 * ============================================================ */
const IPA_FALLBACK = {
  "$": 0, ";": 1, ":": 2, ",": 3, ".": 4, "!": 5, "?": 6,
  "—": 9, "…": 10, "\"": 11, "(": 12, ")": 13,
  "“": 14, "”": 15, " ": 16, "̃": 17, "ʣ": 18, "ʥ": 19, "ʦ": 20, "ʨ": 21,
  "ᵝ": 22, "ꭧ": 23, "A": 24, "I": 25, "O": 31,
  "Q": 33, "S": 35, "T": 36, "W": 39, "Y": 41, "ᵊ": 42,
  "a": 43, "b": 44, "c": 45, "d": 46, "e": 47, "f": 48,
  "h": 50, "i": 51, "j": 52, "k": 53, "l": 54, "m": 55, "n": 56,
  "o": 57, "p": 58, "q": 59, "r": 60, "s": 61, "t": 62, "u": 63,
  "v": 64, "w": 65, "x": 66, "y": 67, "z": 68,
  "ɑ": 69, "ɐ": 70, "ɒ": 71, "æ": 72,
  "β": 75, "ɔ": 76, "ɕ": 77, "ç": 78,
  "ɖ": 80, "ð": 81, "ʤ": 82, "ə": 83, "ɚ": 85, "ɛ": 86, "ɜ": 87,
  "ɟ": 90, "ɡ": 92, "ɥ": 99, "ɨ": 101, "ɪ": 102, "ʝ": 103,
  "ɯ": 110, "ɰ": 111, "ŋ": 112, "ɳ": 113, "ɲ": 114, "ɴ": 115, "ø": 116,
  "ɸ": 118, "θ": 119, "œ": 120, "ɹ": 123, "ɾ": 125, "ɻ": 126,
  "ʁ": 128, "ɽ": 129, "ʂ": 130, "ʃ": 131, "ʈ": 132, "ʧ": 133,
  "ʊ": 135, "ʋ": 136, "ʌ": 138, "ɣ": 139, "ɤ": 140, "χ": 142, "ʎ": 143,
  "ʒ": 147, "ʔ": 148,
  "ˈ": 156, "ˌ": 157, "ː": 158, "ʰ": 162, "ʲ": 164,
  "↓": 169, "→": 171, "↗": 172, "↘": 173, "ᵻ": 177
};

async function fetchLocal(path, onProgress){
  const res = await fetch(path,{cache:'no-cache'});
  if(!res.ok) throw new Error(path+' → HTTP '+res.status);
  const total = Number(res.headers.get('content-length'))||0;
  if(res.body && res.body.getReader){
    const rd=res.body.getReader(); let parts=[],got=0;
    for(;;){ const r=await rd.read(); if(r.done)break; parts.push(r.value); got+=r.value.length; if(onProgress)onProgress(total?got/total:0); }
    const bytes=new Uint8Array(got); let o=0; parts.forEach(p=>{bytes.set(p,o);o+=p.length;});
    if(onProgress)onProgress(1); return bytes;
  }
  const buf=new Uint8Array(await res.arrayBuffer()); if(onProgress)onProgress(1); return buf;
}

function readNpy(u8){
  if(u8[0]!==0x93 || String.fromCharCode.apply(null,u8.subarray(1,6))!=='NUMPY') throw new Error('not a .npy array');
  const major=u8[6]; let hlen,off;
  if(major===1){hlen=u8[8]|(u8[9]<<8);off=10;} else {hlen=(u8[8]|(u8[9]<<8)|(u8[10]<<16)|(u8[11]<<24))>>>0;off=12;}
  const head=new TextDecoder().decode(u8.subarray(off,off+hlen));
  const dm=/['"]descr['"]\s*:\s*['"]([^'"]+)['"]/.exec(head), sm=/['"]shape['"]\s*:\s*\(([^)]*)\)/.exec(head);
  const descr=dm?dm[1]:'<f4', shape=sm?sm[1].split(',').map(s=>s.trim()).filter(Boolean).map(Number):[];
  const body=u8.slice(off+hlen); let data;
  if(/f4/.test(descr)) data=new Float32Array(body.buffer,body.byteOffset,Math.floor(body.length/4));
  else if(/f8/.test(descr)){data=Float32Array.from(new Float64Array(body.buffer,body.byteOffset,Math.floor(body.length/8)));}
  else if(/i4/.test(descr)){data=Float32Array.from(new Int32Array(body.buffer,body.byteOffset,Math.floor(body.length/4)));}
  else throw new Error('unsupported array type '+descr);
  return {data, shape: shape.length?shape:[data.length]};
}

async function unzipNPZ(u8){
  const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength); let eocd=-1;
  for(let i=u8.length-22;i>=Math.max(0,u8.length-66000);i--){ if(dv.getUint32(i,true)===0x06054b50){eocd=i;break;} }
  if(eocd<0) throw new Error('not a readable npz');
  const count=dv.getUint16(eocd+10,true); let p=dv.getUint32(eocd+16,true); const out={};
  for(let n=0;n<count;n++){
    if(dv.getUint32(p,true)!==0x02014b50) break;
    const method=dv.getUint16(p+10,true), csize=dv.getUint32(p+20,true);
    const nlen=dv.getUint16(p+28,true), elen=dv.getUint16(p+30,true), clen=dv.getUint16(p+32,true), lho=dv.getUint32(p+42,true);
    const name=new TextDecoder().decode(u8.subarray(p+46,p+46+nlen));
    const start=lho+30+dv.getUint16(lho+26,true)+dv.getUint16(lho+28,true);
    const raw=u8.subarray(start,start+csize);
    if(method===0) out[name]=raw.slice();
    else if(method===8){
      if(typeof DecompressionStream==='undefined') throw new Error('cannot unpack compressed npz');
      const st=new Blob([raw.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      out[name]=new Uint8Array(await new Response(st).arrayBuffer());
    }
    p+=46+nlen+elen+clen;
  }
  return out;
}

function pbWalk(u8,cb){
  let p=0;
  function vi(){let r=0,s=0;for(;;){if(p>=u8.length)throw new Error('eof');const b=u8[p++];r+=(b&0x7f)*Math.pow(2,s);if(!(b&0x80))break;s+=7;if(s>42)throw new Error('varint');}return r;}
  while(p<u8.length){
    const key=vi(), f=Math.floor(key/8), w=key%8;
    if(w===0){const v=vi();cb(f,0,null,0,v);}
    else if(w===2){const l=vi(); if(p+l>u8.length)break; cb(f,2,u8.subarray(p,p+l),l,0); p+=l;}
    else if(w===5){cb(f,5,u8.subarray(p,p+4),4,0);p+=4;}
    else if(w===1){cb(f,1,u8.subarray(p,p+8),8,0);p+=8;}
    else break;
  }
}

function inspectOnnx(buf){
  const u8=new Uint8Array(buf), dec=new TextDecoder(), meta={}, inits=[], inputs=[];
  try{
    pbWalk(u8,(f,w,pay)=>{
      if(w!==2)return;
      if(f===14){let k='',v='';try{pbWalk(pay,(a,b,c)=>{if(b===2){if(a===1)k=dec.decode(c);else if(a===2)v=dec.decode(c);}});}catch(e){}if(k)meta[k]=v;}
      else if(f===7){try{pbWalk(pay,(gf,gw,gp)=>{
        if(gw!==2)return;
        if(gf===5){let nm='',strs=[];try{pbWalk(gp,(a,b,c)=>{if(b===2){if(a===8)nm=dec.decode(c);else if(a===6)strs.push(dec.decode(c));}});}catch(e){}if(strs.length>=4)inits.push({name:nm,symbols:strs});}
        else if(gf===11){let nm2='',elem=0;try{pbWalk(gp,(a,b,c)=>{if(a===1&&b===2)nm2=dec.decode(c);else if(a===2&&b===2){pbWalk(c,(x,y,z)=>{if(x===1&&y===2){try{pbWalk(z,(m,n,o,p2,q)=>{if(m===1&&n===0)elem=q;});}catch(e){}}});}});}catch(e){}inputs.push({name:nm2,elem});}
      });}catch(e){}}
    });
  }catch(e){}
  return {meta,inits,inputs};
}

function decodeKey(k){return k.replace(/\\u([0-9a-fA-F]{4})/g,(_,h)=>String.fromCharCode(parseInt(h,16))).replace(/\\x([0-9a-fA-F]{2})/g,(_,h)=>String.fromCharCode(parseInt(h,16))).replace(/\\n/g,'\n').replace(/\\t/g,'\t').replace(/\\"/g,'"').replace(/\\'/g,"'").replace(/\\\\/g,'\\');}

function normalizeVocab(raw){
  if(raw==null)return null;
  if(Array.isArray(raw)){const out={};let n=0;raw.forEach((s,i)=>{if(typeof s==='string'){out[s]=i;n++;}else if(s&&typeof s==='object'&&typeof s.token==='string'){out[s.token]=i;n++;}});return n>=4?out:null;}
  if(typeof raw==='object'){
    const a=normalizeVocab(raw.vocab); if(a)return a;
    if(raw.model&&raw.model.vocab){const b=normalizeVocab(raw.model.vocab);if(b)return b;}
    const s1={},s2={};let n1=0,n2=0;
    Object.keys(raw).forEach(k=>{const v=raw[k];if(typeof v==='number'&&isFinite(v)){s1[k]=v;n1++;}else if(/^\d+$/.test(k)&&typeof v==='string'){s2[v]=+k;n2++;}});
    if(n1>=4&&n1>=n2)return s1; if(n2>=4)return s2;
  }
  return null;
}
function vocabFromDictText(text){
  const blocks=String(text).match(/\{[\s\S]*?\}/g); if(!blocks)return null;
  let best=null,bestN=0;
  for(const blk of blocks){
    let m,re=/["']((?:\\.|[^"'\\])+)["']\s*:\s*(\d+)/g,o={},n=0;
    while((m=re.exec(blk))){o[decodeKey(m[1])]=+m[2];n++;}
    if(n>bestN&&n>=4){best=o;bestN=n;}
    let re2=/(\d+)\s*:\s*["']((?:\\.|[^"'\\])+)["']/g,o2={},n2=0;
    while((m=re2.exec(blk))){o2[decodeKey(m[2])]=+m[1];n2++;}
    if(n2>bestN&&n2>=4){best=o2;bestN=n2;}
  }
  return best;
}
function tryParseVocab(val){
  if(val==null)return null;
  if(typeof val==='object')return normalizeVocab(val);
  if(typeof val!=='string')return null;
  const s=val.trim();
  if(s.charAt(0)==='{'||s.charAt(0)==='['){try{const r=normalizeVocab(JSON.parse(s));if(r)return r;}catch(e){}}
  const d=vocabFromDictText(s); if(d)return d;
  if(s.length>=4&&s.length<=512&&/^[\x20-\x7e]+$/.test(s)&&new Set(s).size===s.length){const o={};Array.from(s).forEach((c,i)=>{o[c]=i;});return o;}
  return null;
}
function detectVocabType(v){
  const keys=Object.keys(v).filter(k=>!/^<.*>$/.test(k)); let ipa=0,ascii=0;
  keys.forEach(k=>{if(IPA_RE.test(k))ipa++; if(/^[\x20-\x7e]$/.test(k))ascii++;});
  if(ipa>=3)return 'phonemes'; if(keys.length&&ascii>=keys.length*0.7)return 'chars'; return 'phonemes';
}
function findPadId(v){const c=['<pad>','<PAD>','pad','<blank>','<BLANK>','_','<eps>'];for(const x of c)if(v[x]!=null)return v[x];return 0;}

function chunkText(text,max){
  const out=[]; let curStart=0,len=0;
  const flush=end=>{const p=text.slice(curStart,end);if(p.trim())out.push(p);curStart=end;len=0;};
  for(let i=0;i<text.length;i++){
    len++;
    const brk=/[.!?…\n]/.test(text[i])&&(/\s/.test(text[i+1]||' ')||i===text.length-1);
    if(brk&&text.slice(curStart,i+1).trim().length>10){flush(i+1);continue;}
    if(len>=max){
      const win=text.slice(curStart,i+1); let m,re=/[,;:]\s|\s/g,last=-1;
      while((m=re.exec(win)))last=m.index;
      const cut=last>max*.4?curStart+last+1:i+1; flush(cut); i=cut-1;
    }
  }
  if(curStart<text.length)flush(text.length);
  if(!out.length&&text.trim())out.push(text);
  return out;
}

function makePeaks(s,n){
  const out=new Float32Array(n*2), step=s.length/n;
  for(let i=0;i<n;i++){
    const a=Math.floor(i*step), b=Math.min(s.length,Math.floor((i+1)*step)); let mn=0,mx=0;
    for(let j=a;j<b;j++){const v=s[j];if(v<mn)mn=v;if(v>mx)mx=v;}
    out[i*2]=mn; out[i*2+1]=mx;
  }
  return out;
}

class KittenTTS {
  constructor(opts={}){
    this.opts={...DEFAULTS,...opts};
    this.sampleRate=this.opts.sampleRate||24000;
    this.session=null;this.ort=null;this.inputs=[];this.inputTypes={};
    this.textMode=false;this.outDims=null;this.styles={};this.keys=[];
    this.vocab=null;this.vocabSource='';this.vocabVerified=false;this.vocabType='phonemes';this.padId=0;this.hasUpper=false;
    this.phon=null;this._goldDict=null;this._lastPhonWasGold=false;
    this.ready=false;this.loading=false;
    this._chunks=[];this._master=null;this._peaks=null;this._buffer=null;
    this._speaking=false;this._pos=0;this._startedAt=0;this._startedPos=0;
    this._listeners={};this._AC=null;this._GAIN=null;this._SRC=null;
    this._lastText = null;
  }

  on(ev,cb){(this._listeners[ev]=this._listeners[ev]||[]).push(cb);return this;}
  off(ev,cb){if(this._listeners[ev])this._listeners[ev]=this._listeners[ev].filter(f=>f!==cb);return this;}
  emit(ev,data){(this._listeners[ev]||[]).forEach(cb=>{try{cb(data);}catch(e){console.error('KittenTTS listener',e);}});}

  _actx(){
    if(!this._AC){
      const C=window.AudioContext||window.webkitAudioContext; if(!C)return null;
      this._AC=new C();
      this._GAIN=this._AC.createGain();
      this._GAIN.connect(this._AC.destination);
      this._applyVol();
    }
    if(this._AC.state==='suspended')this._AC.resume().catch(()=>{});
    return this._AC;
  }
  _applyVol(){if(this._GAIN)this._GAIN.gain.value=this.opts.muted?0:this.opts.volume;}
  setVolume(v){this.opts.volume=clamp(v,0,1);this._applyVol();}
  setMuted(b){this.opts.muted=!!b;this._applyVol();}
  get duration(){return this._master?this._master.length/this.sampleRate:0;}
  get position(){if(!this._speaking||!this._AC)return this._pos;return clamp(this._startedPos+(this._AC.currentTime-this._startedAt),0,this.duration);}

  async load(onProgress){
    if(this.loading)return; this.loading=true; this.ready=false;
    this.emit('status','Fetching model and voices…');
    const prog={m:0,v:0};
    const push=()=>{const f=0.02+0.9*(prog.m*0.88+prog.v*0.12); if(onProgress)onProgress(f); this.emit('progress',f);};
    try{
      const [modelBytes,voiceBytes]=await Promise.all([
        fetchLocal(this.opts.modelPath,f=>{prog.m=f;push();}),
        fetchLocal(this.opts.voicesPath,f=>{prog.v=f;push();})
      ]);
      this._ingestStyles(await unzipNPZ(voiceBytes));
      const info=inspectOnnx(modelBytes.buffer);
      Object.keys(info.meta).forEach(k=>{if(/sample_?rate/i.test(k)){const n=parseInt(info.meta[k],10);if(n>=8000&&n<=96000)this.sampleRate=n;}});
      this.emit('status','Starting WASM runtime…');
      const ort=await this._loadOrt();
      this.session=await ort.InferenceSession.create(modelBytes,{executionProviders:['wasm'],graphOptimizationLevel:'all',logSeverityLevel:3});
      this.inputs=Array.from(this.session.inputNames||[]); this.inputTypes={};
      try{const md=this.session.inputMetadata;
        if(md){if(Array.isArray(md))md.forEach(x=>{if(x&&x.name)this.inputTypes[x.name]=String(x.type||'');});
          else Object.keys(md).forEach(k=>{this.inputTypes[k]=String((md[k]&&md[k].type)||md[k]||'');});}
      }catch(e){}
      info.inputs.forEach(x=>{if(x.name&&x.elem===8&&!this.inputTypes[x.name])this.inputTypes[x.name]='string';});
      this.textMode=this.inputs.some(n=>/string/i.test(this.inputTypes[n]||'')||/^(text|raw_text|input_text|sentence|strings)$/i.test(n));
      if(!this.textMode){
        this.emit('status','Resolving symbols…');
        const vr=await this._resolveVocab(info);
        this.vocab=vr.v; this.vocabSource=vr.src; this.vocabVerified=vr.verified;
        this.vocabType=detectVocabType(this.vocab); this.padId=findPadId(this.vocab);
        this.hasUpper=Object.keys(this.vocab).some(k=>/[A-Z]/.test(k));
      }
      if(!this.phon){this.emit('status','Loading phonemizer…'); await this.initPhonemizer();}
      if(onProgress)onProgress(1); this.emit('progress',1);
      this.loading=false; this.ready=true; this.emit('ready',{voices:this.voices});
    }catch(err){
      this.loading=false; this.emit('error',err); throw err;
    }
  }

  async _loadOrt(){
    if(this.ort) return this.ort;

    const configure = (o) => {
      try{
        const base = typeof document !== 'undefined' ? document.baseURI
          : (typeof self !== 'undefined' && self.location ? self.location.href : null);
        o.env.wasm.wasmPaths = base ? new URL('./vendor/onnxruntime-web/', base).href : './vendor/onnxruntime-web/';
        o.env.wasm.numThreads = 1;
        o.env.wasm.proxy = false;
        o.env.logLevel = 'error';
      }catch(e){}
      this.ort = o; return o;
    };

    // Node
    if(nodeOrt) return configure(nodeOrt);

    // Worker (or page) where the host already loaded ORT:
    if(globalThis.ort && globalThis.ort.InferenceSession) return configure(globalThis.ort);

    // Worker without a preloaded ORT: dynamic import — never touch `document` here.
    if(typeof document === 'undefined'){
      const urls = ['./vendor/onnxruntime-web/ort.min.mjs','./vendor/onnxruntime-web/ort.mjs','./vendor/onnxruntime-web/ort.min.js'];
      for(const u of urls){
        try{
          const m = await import(u);
          const o = (m && m.InferenceSession) ? m
            : (m && m.default && m.default.InferenceSession) ? m.default : globalThis.ort;
          if(o && o.InferenceSession) return configure(o);
        }catch(e){}
      }
      throw new Error('ONNX runtime could not be loaded in worker (vendor .mjs/.js all failed)');
    }

    // Main thread: classic script tag.
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = './vendor/onnxruntime-web/ort.min.js';
      s.onload = res;
      s.onerror = () => rej(new Error('Failed to load ./vendor/onnxruntime-web/ort.min.js'));
      document.head.appendChild(s);
      setTimeout(() => rej(new Error('ort.min.js load timeout')), 22000);
    });
    if(window.ort && window.ort.InferenceSession) return configure(window.ort);
    throw new Error('ONNX runtime could not be loaded');
  }

  _ingestStyles(entries){
    let styles={},keys=[];
    Object.keys(entries).forEach(full=>{
      const nm=String(full).split('/').pop().replace(/\.npy$/i,''); if(!nm)return;
      try{const arr=readNpy(entries[full]);if(arr.data.length){styles[nm]=arr;keys.push(nm);}}catch(e){}
    });
    if(!keys.length)throw new Error('no style arrays');
    if(keys.length===1){
      const only=styles[keys[0]],sh=only.shape;
      if(sh.length>=2&&sh[0]>=2&&sh[0]<=32){
        const rows=sh[0],dim=Math.floor(only.data.length/rows),flat={};
        for(let r=0;r<rows;r++)flat['voice-'+(r+1)]={data:only.data.slice(r*dim,(r+1)*dim),shape:[dim]};
        styles=flat;keys=Object.keys(flat);
      }
    }
    keys.sort((a,b)=>{const na=/(\d+)/.exec(a),nb=/(\d+)/.exec(b);if(na&&nb&&+na[1]!==+nb[1])return +na[1]-+nb[1];return a.localeCompare(b);});
    this.keys=keys.slice(0,8); this.styles={}; this.keys.forEach(k=>{this.styles[k]=styles[k];});
    if(this.opts.voice>=this.keys.length)this.opts.voice=0;
  }

  get voices(){return this.keys.map((k,i)=>({index:i,name:k.replace(/\.npy$/i,'').replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}));}

  async _resolveVocab(info){
    let best=null,score=-1,key='';
    Object.keys(info.meta).forEach(k=>{const v=tryParseVocab(info.meta[k]);if(v){let sc=Object.keys(v).length;if(/vocab|symbol|token|phoneme|char|letter|g2p|dict/i.test(k))sc+=10000;if(sc>score){best=v;score=sc;key=k;}}});
    if(best)return {v:best,src:'metadata:'+key,verified:true};
    for(const it of info.inits){const o={};it.symbols.forEach((s,idx)=>{o[s]=idx;});if(it.symbols.length>=4)return {v:o,src:'tensor:'+it.name,verified:true};}
    const side=['vocab.json','tokenizer.json','config.json','symbols.json','phonemes.json','vocab.txt','tokens.txt','metadata.json'];
    for(const s of side){try{const r=await fetch(s,{cache:'no-cache'});if(!r.ok)continue;const vv=tryParseVocab(await r.text());if(vv)return {v:vv,src:s,verified:true};}catch(e){}}
    return {v:IPA_FALLBACK,src:'built-in guess',verified:false};
  }

  async initPhonemizer(){
    // 1. Load gold dictionary first
    console.log('Loading gold dictionary:', this.opts.goldPath);
    try {
      const res = await fetch(this.opts.goldPath, { cache: 'no-cache' });
      if (res.ok) {
        const dict = await res.json();
        this._goldDict = {};
        Object.keys(dict).forEach(word => {
          this._goldDict[word.toLowerCase()] = dict[word];
        });
        console.log(`✅ Gold dictionary loaded: ${Object.keys(this._goldDict).length} words`);
      } else {
        console.warn(`${this.opts.goldPath} not found, will use espeak-ng only`);
        this._goldDict = {};
      }
    } catch (e) {
      console.warn('Failed to load gold dictionary:', e.message);
      this._goldDict = {};
    }

    // 2. Node.js environment: use required module
    if (nodePhonemizer) {
      const phonemizeFn = nodePhonemizer.phonemize || (nodePhonemizer.default && nodePhonemizer.default.phonemize) || (typeof nodePhonemizer.default === 'function' ? nodePhonemizer.default : null);
      if (typeof phonemizeFn === 'function') {
        this.phon = async (text) => {
          // Updated regex: explicitly keeps words with internal apostrophes/hyphens as a single token
          const tokens = text.match(/[A-Za-z]+(?:['\-][A-Za-z]+)*|[^\sA-Za-z]+|\s+/g) || [];
          const parts = [];
          let allGold = true;
          for (const tk of tokens) {
            if (!/[A-Za-z]/.test(tk)) { parts.push(tk); continue; }
            const g = this._goldDict && this._goldDict[tk.toLowerCase()];
            if (g) {
              parts.push(typeof g === 'string' ? g : (g.DEFAULT || g.phones || g.ipa || ''));
            } else {
              allGold = false;
              try {
                parts.push(this._normPh(await phonemizeFn(tk, 'en-us', { keepPunctuation: true })));
              } catch (e) {
                parts.push(tk);
              }
            }
          }
          this._lastPhonWasGold = allGold;
          return this._normPh(parts.join(''));
        };
        console.log('✅ phonemizer loaded via require()');
        return true;
      }
    }

    // 3. Browser environment: use local vendor files
    const urls = ['./vendor/phonemizer/phonemizer.esm.js', './vendor/phonemizer/phonemizer.esm.sh.js'];
    const probe = 'water car dance better browser';
    for (const url of urls) {
      let mod;
      try {
        mod = await Promise.race([
          import(url),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 18000))
        ]);
      } catch (e) {
        continue;
      }
      const fn = mod.phonemize || (mod.default && mod.default.phonemize) || (typeof mod.default === 'function' ? mod.default : null);
      if (typeof fn !== 'function') continue;

      const forms = [
        t => fn(t, 'en-us', { keepPunctuation: true }),
        t => fn(t, 'en-us'),
        t => fn(t, { language: 'en-us', keepPunctuation: true }),
        t => fn(t, { language: 'en-us' })
      ];

      for (const form of forms) {
        let us = '';
        try { us = this._normPh(await form(probe)); } catch (e) { us = ''; }
        if (us && IPA_RE.test(us)) {
          this.phon = async (text) => {
            // Updated regex: explicitly keeps words with internal apostrophes/hyphens as a single token
            const tokens = text.match(/[A-Za-z]+(?:['\-][A-Za-z]+)*|[^\sA-Za-z]+|\s+/g) || [];
            const parts = [];
            let allGold = true;
            for (const tk of tokens) {
              if (!/[A-Za-z]/.test(tk)) { parts.push(tk); continue; }
              const g = this._goldDict && this._goldDict[tk.toLowerCase()];
              if (g) {
                parts.push(typeof g === 'string' ? g : (g.DEFAULT || g.phones || g.ipa || ''));
              } else {
                allGold = false;
                try {
                  parts.push(this._normPh(await form(tk)));
                } catch (e) {
                  parts.push(tk);
                }
              }
            }
            this._lastPhonWasGold = allGold;
            return this._normPh(parts.join(''));
          };
          console.log('✅ espeak-ng loaded from local vendor');
          return true;
        }
      }
    }
    throw new Error('No phonemizer could be loaded');
  }

  _normPh(r){const s=Array.isArray(r)?r.join(' '):String(r==null?'':r);return s.replace(/[ \t]+/g,' ').trim();}

  /* ============================================================
   * Misaki-style normalization — matches espeak.py EspeakFallback
   * ============================================================ */
  _misaki(ps){
    let s = String(ps || '');
    // Apply E2M rules (stress NOT stripped yet — needed for ʔˌn̩)
    for (const [re, to] of MISAKI_E2M) s = s.replace(re, to);
    // Syllabic consonants: (\S)\u0329 -> ᵊ\1
    s = s.replace(/(\S)\u0329/g, 'ᵊ$1').replace(/\u0329/g, '');
    // en-us post-processing (Python order)
    s = s.replace(/ɜːɹ/g, 'ɜɹ')
         .replace(/ɜː/g, 'ɜɹ')
         .replace(/ɪə/g, 'iə')
         .replace(/ː/g, '')
         .replace(/o/g, 'ɔ');
    // Version-dependent rules
    if (this.opts.misakiVersion !== '2.0') {
      s = s.replace(/ɾ/g, 'T').replace(/ʔ/g, 't');
    }
    // Remove tie characters
    s = s.replace(/\^/g, '');
    // Optional stress strip
    if (this.opts.misakiStress === false) s = s.replace(/[ˈˌ]/g, '');
    return s;
  }

  mapPhonemes(str, alreadyMisaki = false){
    const V=this.vocab||{},pad=this.padId||0;
    const ids=[],out=[],issues=[];

    // Gold dict entries are already Misaki-normalized — skip E2M
    const clean = alreadyMisaki
      ? String(str || '').replace(/\^/g, '')
      : this._misaki(str);

    // Sanity check: warn if a symbol that should have been rewritten leaked through
    if (MISAKI_LEAK.test(clean)) {
      console.warn('[misaki] un-normalized symbol leaked:', clean,
                   [...clean].filter(c => MISAKI_LEAK.test(c)));
    }

    Array.from(clean).forEach(c=>{
      if(c in V){ids.push(V[c]);out.push(c);}
      else if(/\s/.test(c)){if(' ' in V){ids.push(V[' ']);out.push(' ');}else{ids.push(pad);out.push('∅');}}
      else{issues.push({from:c,to:null,q:'lost'});out.push('∅');}
    });

    const srcSig=signature(clean),outSig=signature(out.join(''));
    return {ids:[pad].concat(ids,[pad]),out:out.join(''),issues,srcSig,outSig,ok:srcSig===outSig};
  }

  effectiveMode(){if(this.textMode)return 'text';if(this.opts.tokenMode!=='auto')return this.opts.tokenMode;return this.vocabType||'phonemes';}

  async prepareInput(text){
    const pad=this.padId||0;
    if(this.textMode)return {ids:[pad,pad],out:text,issues:[],ok:true,srcSig:'',outSig:''};
    if(this.effectiveMode()==='chars'){
      const t=this.hasUpper?text:text.toLowerCase(),V=this.vocab,ids=[],out=[];
      Array.from(t).forEach(c=>{if(V[c]!=null){ids.push(V[c]);out.push(c);}});
      return {ids:[pad].concat(ids,[pad]),out:out.join(''),issues:[],ok:true,srcSig:'',outSig:''};
    }
    if(!this.phon)throw new Error('phonemizer not loaded');
    const ph=await this.phon(text);
    return this.mapPhonemes(ph, !!this._lastPhonWasGold);
  }

  _styleFor(len,i){
    const key=this.keys[i],v=key?this.styles[key]:null;
    if(!v)throw new Error('no style vector');
    const d=v.data,sh=v.shape||[];
    if(sh.length<=1)return Float32Array.from(d);
    const rows=sh[0],dim=Math.floor(d.length/rows); if(!dim)return Float32Array.from(d);
    const idx=rows<=4?0:clamp(len,0,rows-1);
    return Float32Array.from(d.subarray(idx*dim,(idx+1)*dim));
  }

  async runModel(ids,style,speed,raw){
    const ort=this.ort,sess=this.session,feeds={};
    sess.inputNames.forEach(name=>{
      const n=name.toLowerCase(),typ=this.inputTypes[name]||'';
      if(/speed|length_scale|duration/.test(n)){const val=/length_scale|duration/.test(n)?1/speed:speed;feeds[name]=new ort.Tensor('float32',new Float32Array([val]),[1]);}
      else if(/style|speaker|embed|voice|ref/.test(n)){feeds[name]=new ort.Tensor('float32',style,[1,style.length]);}
      else if(/mask/.test(n)){feeds[name]=new ort.Tensor('int64',BigInt64Array.from({length:ids.length},()=>1n),[1,ids.length]);}
      else if(/lang|accent/.test(n)&&/string/i.test(typ)){feeds[name]=new ort.Tensor('string',['en-us'],[1]);}
      else if(/lang/.test(n)){feeds[name]=new ort.Tensor('int64',BigInt64Array.from([0n]),[1]);}
      else if(/string/i.test(typ)||(/text|sentence|raw/.test(n)&&!/id|token/.test(n))){feeds[name]=new ort.Tensor('string',[raw],[1]);}
      else{feeds[name]=new ort.Tensor('int64',BigInt64Array.from(ids.map(x=>BigInt(x))),[1,ids.length]);}
    });
    const out=await sess.run(feeds); let best=null;
    Object.keys(out).forEach(k=>{const t=out[k];if(t&&t.data&&t.data.length&&(!best||t.data.length>best.data.length))best=t;});
    if(!best)throw new Error('no tensor returned');
    const dims=Array.from(best.dims||[]); this.outDims=dims.length?dims:[best.data.length];
    const d=best.data;
    if(d instanceof Float32Array)return d;
    if(d instanceof Int16Array)return Float32Array.from(d,x=>x/32768);
    return Float32Array.from(d,x=>Number(x));
  }

  _verifySpeech(x,sr){
    const n=x.length; if(n<sr*0.1)return {ok:false,why:'too short'};
    let peak=0; for(let i=0;i<n;i++){const v=x[i];if(!isFinite(v))return {ok:false,why:'invalid'};const a=Math.abs(v);if(a>peak)peak=a;}
    if(peak<1e-4)return {ok:false,why:'silent'};
    return {ok:true,why:''};
  }

  async synthesize(text,onStatus){
    if(!this.ready)await this.load();
    const pieces=(this.textMode||this.effectiveMode()==='chars')?[text]:chunkText(text,200);
    const chunks=[],ipa=[],broken=[];
    for(let i=0;i<pieces.length;i++){
      if(onStatus)onStatus('Synthesizing '+(i+1)+'/'+pieces.length);
      this.emit('status','Synthesizing '+(i+1)+'/'+pieces.length);
      const prep=await this.prepareInput(pieces[i]);
      if(this.effectiveMode()==='phonemes')ipa.push(prep.out);
      if(!prep.ok)broken.push({sig:prep.srcSig+'≠'+prep.outSig,text:pieces[i].slice(0,40)});
      if(!this.textMode&&prep.ids.length<6)throw new Error('no usable ids');
      await nextFrame();
      const samples=await this.runModel(prep.ids,this._styleFor(prep.ids.length,this.opts.voice),this.opts.speed,pieces[i]);
      chunks.push({text:pieces[i],samples});
    }
    if(this.opts.strictIntegrity&&broken.length){const e=new Error('Strict integrity blocked: '+broken[0].text);e.strict=true;throw e;}
    let total=0;chunks.forEach(c=>total+=c.samples.length);
    const probe=new Float32Array(total);let o=0;chunks.forEach(c=>{probe.set(c.samples,o);o+=c.samples.length;});
    const check=this._verifySpeech(probe,this.sampleRate);
    if(!check.ok){const er=new Error(check.why);er.gate=check;throw er;}
    this._chunks=chunks; this._assemble();
    return {samples:this._master,sampleRate:this.sampleRate,duration:this.duration,chunks,ipa:ipa.join(' '),integrity:{ok:!broken.length,broken}};
  }

  _assemble(){
    if(!this._chunks.length){this._master=null;this._peaks=null;this._buffer=null;return;}
    const sr=this.sampleRate,gap=Math.round(this.opts.gap/1000*sr),fade=Math.round(this.opts.fade/1000*sr);
    let total=0;this._chunks.forEach((c,i)=>{total+=c.samples.length+(i<this._chunks.length-1?gap:0);});
    const out=new Float32Array(total);let o=0;
    this._chunks.forEach((c,i)=>{
      const s=c.samples,n=s.length,f=Math.min(fade,n>>1);
      for(let j=0;j<n;j++){let v=s[j];if(f>0){if(j<f)v*=.5-.5*Math.cos(Math.PI*j/f);else if(j>n-f)v*=.5-.5*Math.cos(Math.PI*(n-j)/f);}out[o+j]=v;}
      o+=n+(i<this._chunks.length-1?gap:0);
    });
    if(this.opts.normalizePeaks){let peak=0;for(let i=0;i<out.length;i++){const a=Math.abs(out[i]);if(a>peak)peak=a;}if(peak>1e-5){const g=.97/peak;for(let k=0;k<out.length;k++)out[k]*=g;}}
    else{for(let k=0;k<out.length;k++)out[k]=clamp(out[k],-1,1);}
    this._master=out;this._buffer=null;this._peaks=makePeaks(out,900);this._pos=clamp(this._pos,0,this.duration);
  }

  _killNode(){if(this._SRC){try{this._SRC.onended=null;this._SRC.stop();}catch(e){}try{this._SRC.disconnect();}catch(e){}this._SRC=null;}}
  _playBuffer(from){
    if(!this._master)return false;
    const c=this._actx(); if(!c)return false;
    if(!this._buffer||this._buffer.length!==this._master.length){this._buffer=c.createBuffer(1,this._master.length,this.sampleRate);this._buffer.copyToChannel(this._master,0);}
    this._killNode();
    const p=clamp(from==null?this._pos:from,0,Math.max(0,this.duration-0.02));
    this._SRC=c.createBufferSource();this._SRC.buffer=this._buffer;this._SRC.connect(this._GAIN);
    this._SRC.onended=()=>{if(!this._speaking)return;this._speaking=false;this._pos=0;this._killNode();this.emit('stop');};
    this._SRC.start(0,p);
    this._speaking=true;this._startedAt=c.currentTime;this._startedPos=p;this._pos=p;
    this.emit('play');return true;
  }
  stop(){this._killNode();this._speaking=false;this._pos=0;this.emit('stop');}
  pause(){if(this._speaking){this._pos=this.position;this._killNode();this._speaking=false;this.emit('stop');}}
  resume(){if(this._master&&!this._speaking)return this._playBuffer(this._pos);}
  seek(sec){if(!this._master)return;this._pos=clamp(sec,0,this.duration);if(this._speaking)this._playBuffer(this._pos);}
  async play(text,from){
    if(text!=null && text!==this._lastText){await this.synthesize(text);this._lastText=text;}
    else if(!this._master && this._lastText!=null){await this.synthesize(this._lastText);}
    return this._playBuffer(from);
  }

  getPeaks(n=900){return this._peaks?makePeaks(this._master,n):null;}
  exportWavBlob(){
    if(!this._master)throw new Error('nothing synthesized');
    const f=this._master,sr=this.sampleRate,n=f.length,buf=new ArrayBuffer(44+n*2),dv=new DataView(buf);
    const str=(o,s)=>{for(let i=0;i<s.length;i++)dv.setUint8(o+i,s.charCodeAt(i));};
    str(0,'RIFF');dv.setUint32(4,36+n*2,true);str(8,'WAVE');str(12,'fmt ');
    dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);
    dv.setUint32(24,sr,true);dv.setUint32(28,sr*2,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);
    str(36,'data');dv.setUint32(40,n*2,true);
    let o=44;for(let i=0;i<n;i++){const v=clamp(f[i],-1,1);dv.setInt16(o,v<0?v*0x8000:v*0x7fff,true);o+=2;}
    return new Blob([buf],{type:'audio/wav'});
  }
  async integrityOf(text){
    if(!this.phon||!this.vocab||this.effectiveMode()!=='phonemes')return [];
    const seen={},list=[];
    // Updated regex: explicitly keeps words with internal apostrophes/hyphens as a single token for gold dict validation
    (text.match(/[A-Za-z]+(?:['\-][A-Za-z]+)*/g)||[]).forEach(w=>{const k=w.toLowerCase();if(!seen[k]){seen[k]=1;list.push(w);}});
    const cap=list.slice(0,200),rows=[];
    for(const w of cap){let ip='';try{ip=await this.phon(w);}catch(e){}
      const m=ip?this.mapPhonemes(ip, !!this._lastPhonWasGold):{out:'',issues:[{from:w,q:'lost'}],srcSig:'',outSig:'',ok:false};
      rows.push({word:w,ipa:ip,mapped:m.out,ok:m.ok,srcSig:m.srcSig,outSig:m.outSig,issues:m.issues});}
    return rows;
  }
}

export default KittenTTS;
export { KittenTTS };