import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
class Cdp {
    constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); this.handlers = []; }
    open() {
        return new Promise((resolve, reject) => {
            this.ws.onopen = resolve; this.ws.onerror = reject;
            this.ws.onmessage = (e) => {
                const m = JSON.parse(e.data);
                if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
                else if (m.method) this.handlers.forEach(h => h(m));
            };
        });
    }
    send(method, params = {}, timeout = 15000) {
        const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve, reject) => {
            const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`délai dépassé : ${method}`)); }, timeout);
            this.pending.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject: e => { clearTimeout(t); reject(e); } });
        });
    }
    on(h) { this.handlers.push(h); }
    close() { this.ws.close(); }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const base = process.env.OCR_TEST_URL || 'http://localhost:8094';
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw Error('Démo locale uniquement');
const temp = await mkdtemp(path.join(tmpdir(), 'clinicsoft-ocr-browser-'));
const port = Number(process.env.OCR_CHROME_PORT || 9351);
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + path.join(temp,'profile'), '--no-first-run', '--no-default-browser-check', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let c;
const requests = [], errors = [], apiResponses = [];
try {
    let tabs;
    for (let i=0;i<60;i++) { try { tabs=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json(); break; } catch { await sleep(250); } }
    if (!tabs?.length) throw Error('Chrome indisponible');
    c = new Cdp(tabs[0].webSocketDebuggerUrl); await c.open();
    c.on(m => {
        if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
        if (m.method === 'Network.responseReceived' && m.params.response.url.includes('/api/')) apiResponses.push({url:m.params.response.url,status:m.params.response.status});
        if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    });
    await c.send('Page.enable'); await c.send('Runtime.enable'); await c.send('Network.enable');
    // Aucun fournisseur OCR externe accessible pendant le test.
    await c.send('Network.setBlockedURLs', { urls: ['*cdn.jsdelivr.net*','*projectnaptha.com*','*anthropic.com*'] });
    const login = await (await fetch(base+'/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:'secretaire@demo.test',password:process.env.OCR_TEST_PASSWORD || 'DemoClinic2026!'}) })).json();
    assert.ok(login.token, 'Connexion du compte de démo');
    const store=JSON.stringify({state:{token:login.token,user:login.user,isAuthenticated:true},version:0});
    await c.send('Page.addScriptToEvaluateOnNewDocument', {source:'if(location.origin==='+JSON.stringify(base)+')localStorage.setItem("clinicsoft-auth",'+JSON.stringify(store)+');'});
    await c.send('Page.addScriptToEvaluateOnNewDocument', {source: 'window._ocrEvents=[]; const NativeWorker=window.Worker;window.Worker=class extends NativeWorker {constructor(...args){super(...args);window._ocrEvents.push({url:args[0]});this.addEventListener("message",e=>window._ocrEvents.push({action:e.data.action,status:e.data.status,stage:e.data.data?.status,error:e.data.status==="reject"?e.data.data:undefined}));this.addEventListener("error",e=>window._ocrEvents.push({error:e.message}));}postMessage(...args){window._ocrEvents.push({sent:args[0].action,job:args[0].jobId});return super.postMessage(...args)}};'});
    await c.send('Page.navigate',{url:base+'/patients/create'});
    const evaluate = async expression => { const r=await c.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},180000); if(r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
    const wait = async (expression, timeout=20000) => { const end=Date.now()+timeout; while(Date.now()<end){if(await evaluate(expression))return;await sleep(300)}throw Error('Condition non atteinte : '+expression+' / '+await evaluate('document.body.innerText.slice(-2500) + JSON.stringify(window._ocrEvents)')); };
    await wait('!!document.querySelector("input[placeholder=BK456789]")');
    const cin='ZT'+String(Date.now()%1000000).padStart(6,'0');
    await evaluate('(()=>{const e=document.querySelector("input[placeholder=BK456789]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,'+JSON.stringify(cin)+');e.dispatchEvent(new Event("input",{bubbles:true}));})()');
    await wait('Array.from(document.querySelectorAll("button")).some(b=>b.textContent.includes("Continuer la création"))');
    await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes("Continuer la création")).click()');
    await wait('!!document.querySelector("input[type=file]")');
    const image=await evaluate('(()=>{const c=document.createElement("canvas");c.width=2000;c.height=1300;const x=c.getContext("2d");x.fillStyle="white";x.fillRect(0,0,2000,1300);x.fillStyle="black";x.font="56px Arial";["ROYAUME DU MAROC","CARTE NATIONALE D IDENTITE","Nom : EL FICTIF","Prénom : AMINA","Née le 21.04.1990 à CASABLANCA","Sexe : F","Valable jusqu’au 31.12.2035",'+JSON.stringify(cin)+'].forEach((t,i)=>x.fillText(t,100,100+i*135));return c.toDataURL("image/png").split(",")[1]})()');
    const imagePath=path.join(temp,'cin-fictive.png');await writeFile(imagePath,Buffer.from(image,'base64'));
    const doc=await c.send('DOM.getDocument');const input=await c.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[type=file]'});await c.send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[imagePath]});
    await wait('Array.from(document.querySelectorAll("button")).some(b=>b.textContent.includes("Extraire les informations"))');
    await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes("Extraire les informations")).click()');
    await wait('document.body.innerText.includes("Données extraites de la carte")',25000);
    const text=await evaluate('document.body.innerText');
    assert.ok(text.includes('EL FICTIF'),text);assert.ok(text.includes('AMINA'),text);assert.ok(text.includes('1990-04-21'),text);assert.ok(text.includes('2035-12-31'),text);
    const button=await evaluate('(()=>{const b=Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes("Confirmer et pré-remplir"));return {disabled:b.disabled}})()');assert.equal(button.disabled,false);
    await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes("Continuer vers les informations préremplies")).click()');
    await wait('Array.from(document.querySelectorAll("input")).some(e=>e.value==="EL FICTIF")');
    assert.ok(!requests.some(u=>u.includes('/ai/ocr-cin')),'Aucun appel API OCR');
    assert.ok(requests.some(u=>u.includes('/ocr/runtime/tesseract.esm.min.js')),'Moteur navigateur local chargé');
    assert.ok(await evaluate('window._ocrEvents.some(e=>e.url?.startsWith("blob:"+location.origin)) && window._ocrEvents.some(e=>e.sent==="recognize")'),'Worker local et reconnaissance exécutés');
    const externalOcr = requests.filter(u=>/^https?:/.test(u)&&!u.startsWith(base)&&!['fonts.googleapis.com','fonts.gstatic.com'].includes(new URL(u).hostname));
    assert.deepEqual(externalOcr, [], 'Aucun service OCR externe (polices de l’application exclues)');
    assert.equal(errors.length,0,errors.join('\n'));
    assert.ok(apiResponses.some(r=>r.url.includes('/upload-scan') && r.status===200),'Scan archivé sans erreur');
    const token=login.token;
    const retired=await fetch(base+'/api/ai/ocr-cin',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});assert.equal(retired.status,410);
    const risk=await fetch(base+'/api/ai/noshowrisk',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});assert.equal(risk.status,404);
    console.log(JSON.stringify({ok:true,engine:'Tesseract.js',identity:'Données fictives',extraction:true,formPrefilled:true,noExternalOcrRequest:true,oldOcrStatus:retired.status,predictionStatus:risk.status,temp},null,2));
} finally { c?.close(); chrome.kill(); }
