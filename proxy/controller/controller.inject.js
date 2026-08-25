var $scramjetController;(()=>{var e={286(e,t,o){o.d(t,{I:()=>r});let r=Symbol.for("controller frame handle")},805(e,t,o){o.d(t,{C:()=>r});class r{methods;id;sendRaw;counter=0;promiseCallbacks=new Map;constructor(e,t,o){this.methods=e,this.id=t,this.sendRaw=o}recieve(e){if(null==e||"object"!=typeof e)return;let t=e[this.id];if(null==t||"object"!=typeof t)return;let o=t.$type;if("response"===o){let e=t.$token,o=t.$data,r=t.$error,i=this.promiseCallbacks.get(e);if(!i)return;this.promiseCallbacks.delete(e),void 0!==r?i.reject(Error(r)):i.resolve(o)}else if("request"===o){let e=t.$method,o=t.$args;this.methods[e](o).then(e=>{this.sendRaw({[this.id]:{$type:"response",$token:t.$token,$data:e?.[0]}},e?.[1])}).catch(e=>{console.error(e),this.sendRaw({[this.id]:{$type:"response",$token:t.$token,$error:e?.toString()||"Unknown error"}},[])})}}call(e,t,o=[]){let r=this.counter++;return new Promise((i,s)=>{this.promiseCallbacks.set(r,{resolve:i,reject:s}),this.sendRaw({[this.id]:{$type:"request",$method:e,$args:t,$token:r}},o)})}}},423(e,t,o){o.d(t,{Cx:()=>f,bw:()=>l,cP:()=>i,ht:()=>N,pX:()=>a});let{BareResponse:r,CookieJar:i,IncrementalHtmlRewriter:s,Plugin:n,SCRAMJETCLIENT:a,SCRAMJETCLIENTNAME:c,ScramjetClient:l,ScramjetFetchHandler:h,ScramjetFetchTrackedClient:d,ScramjetHeaders:p,Tap:f,createLocationProxy:k,defaultConfig:g,defaultConfigDev:y,flagEnabled:m,getOwnPropertyDescriptorHandler:u,getRewriter:w,getScriptBlockTypeString:b,htmlRules:$,isArchiveMimeType:v,isAudioOrVideoMimeType:C,isFontMimeType:S,isHtmlMimeType:j,isImageMimeType:M,isInlineDisplayableMimeType:x,isJavascriptMimeType:P,isJavascriptMimeTypeEssenceMatch:A,isModuleScriptType:R,isScriptType:W,isScriptableMimeType:E,isXmlMimeType:J,isZipBasedMimeType:I,isdedicated:T,isshared:D,issw:O,iswindow:q,isworker:H,parseMimeType:X,rewriteBlob:U,rewriteCss:B,rewriteHtml:L,rewriteJs:_,rewriteJsInner:F,rewriteSrcset:G,rewriteUrl:z,rewriteWorkers:K,setWasm:N,unrewriteBlob:Q,unrewriteCss:V,unrewriteHtml:Y,unrewriteUrl:Z,versionInfo:ee}=globalThis.$scramjet}},t={};function o(r){var i=t[r];if(void 0!==i)return i.exports;var s=t[r]={exports:{}};return e[r](s,s.exports,o),s.exports}o.d=(e,t)=>{for(var r in t)o.o(t,r)&&!o.o(e,r)&&Object.defineProperty(e,r,{enumerable:!0,get:t[r]})},o.o=(e,t)=>Object.prototype.hasOwnProperty.call(e,t),o.r=e=>{"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})};var r={};(()=>{o.r(r),o.d(r,{load:()=>l});var e=o(805),t=o(286),i=o(423);let s=MessagePort.prototype.postMessage,n=(e,t,o)=>{s.call(e,t,o)};class a{port;readyResolve;readyPromise=new Promise(e=>{this.readyResolve=e});ready=!1;async init(){await this.readyPromise,this.ready=!0}rpc;constructor(t){this.port=t,this.rpc=new e.C({ready:async()=>{this.readyResolve()}},"transport",(e,o)=>{n(t,e,o)}),t.onmessageerror=e=>{console.error("onmessageerror (this should never happen!)",e)},t.onmessage=e=>{this.rpc.recieve(e.data)},t.start()}connect(e,t,o,r,i,s,a){let c=new MessageChannel,l=c.port1;return console.warn("connecting"),this.rpc.call("connect",{url:e.href,protocols:t,requestHeaders:o,port:c.port2},[c.port2]).then(e=>{console.log(e),"success"===e.result?r(e.protocol,e.extensions):a(e.error)}),l.onmessage=e=>{let t=e.data;"data"===t.type?i(t.data):"close"===t.type&&s(t.code,t.reason)},l.onmessageerror=e=>{console.error("onmessageerror (this should never happen!)",e),a("Message error in transport port")},[e=>{n(l,{type:"data",data:e},e instanceof ArrayBuffer?[e]:[])},e=>{n(l,{type:"close",code:e})}]}async request(e,t,o,r,i){return await this.rpc.call("request",{remote:e.href,method:t,body:o,headers:r})}async sendSetCookie(e,t={}){await this.rpc.call("sendSetCookie",{cookies:e.map(({url:e,cookie:t})=>({url:e.href,cookie:t})),options:t})}}let c=navigator.serviceWorker.controller;function l(e){if(i.pX in globalThis)return void globalThis[i.pX].syncDocumentInit({initHeaders:e.initHeaders,history:e.history,cookies:e.cookies});if(!("WASM"in self))throw Error("WASM not found in global scope!");let t=Uint8Array.from(atob(self.WASM),e=>e.charCodeAt(0));delete self.WASM,(0,i.ht)(t),new h(globalThis,e)}class h{global;init;client;cookieJar;transport;handleServiceWorkerCookieMessage;constructor(e,t){this.global=e,this.init=t;const o=new MessageChannel;this.transport=new a(o.port1),c?.postMessage({$sw$initRemoteTransport:{port:o.port2,prefix:this.init.prefix.href}},[o.port2]),this.cookieJar=new i.cP,this.cookieJar.load(this.init.cookies),this.handleServiceWorkerCookieMessage=e=>{if(!e.data?.$controller$setCookie||"object"!=typeof e.data.$controller$setCookie)return;let t=e.data.$controller$setCookie;if(t.options?.clear&&this.cookieJar.clear(),Array.isArray(t.cookies)){for(let e of t.cookies)if("string"==typeof e?.url&&"string"==typeof e.cookie)try{this.cookieJar.setCookies(e.cookie,new URL(e.url))}catch{console.error("Failed to set cookie",e)}}if("string"==typeof t.id){let e=navigator.serviceWorker?.controller??c;e?.postMessage({$sw$setCookieDone:{id:t.id}})}},navigator.serviceWorker?.addEventListener("message",this.handleServiceWorkerCookieMessage),this.injectScramjet()}injectScramjet(){let e=this.global.frameElement;e&&!e.name&&(window.name=e.name=`${Array(8).fill(0).map(()=>Math.floor(36*Math.random()).toString(36)).join("")}`);let o=e?.[t.I],r=!0;if(!o){r=!1;let e=this.global.window;for(;e.parent!==e;){let r=e[i.pX];if(!r){e=e.parent.window;continue}let s=r.descriptors.get("window.frameElement",e);if(s&&s[t.I]){o=s[t.I];break}e=e.parent.window}}let s={config:this.init.sjconfig,prefix:this.init.prefix,cookieJar:this.cookieJar,interface:{getInjectScripts:this.init.yieldGetInjectScripts(this.init.config,this.init.sjconfig,this.init.prefix,this.cookieJar,this.init.codecEncode,this.init.codecDecode),codecEncode:this.init.codecEncode,codecDecode:this.init.codecDecode}};this.client=new i.bw(this.global,{context:s,transport:this.transport,sendSetCookie:async(e,t)=>{await this.transport.sendSetCookie(e,t)},shouldBlockMessageEvent:e=>{let t=e?.data;if(!t||"object"!=typeof t)return!1;if(t.$scramjet$messagetype)return!1;for(let e of Object.keys(t))if(e.startsWith("$controller$")||e.startsWith("$sw$"))return!0;return!1},hookSubcontext:e=>new h(e,{...this.init,cookies:this.cookieJar.dump()}).client,initHeaders:this.init.initHeaders,history:this.init.history});let n={window:this.global.window,client:this.client,isTopLevel:r};o&&i.Cx.dispatch(o.hooks.init.pre,n,{}),this.client.hook(),o&&i.Cx.dispatch(o.hooks.init.post,n,{})}}})(),$scramjetController=r})();
//# sourceMappingURL=controller.inject.js.map
/* Nova Resilience R8.1 proxied-page compatibility guard. Runs only inside the
 * Scramjet controller injection, never in Nova's first-party shell. */
;(() => {
  "use strict";
  if (globalThis.__NOVA_R81_COMPAT_INSTALLED__) return;
  globalThis.__NOVA_R81_COMPAT_INSTALLED__ = true;

  const diag = globalThis.__NOVA_PROXY_PAGE_DIAGNOSTICS__ = globalThis.__NOVA_PROXY_PAGE_DIAGNOSTICS__ || {
    sriStripped: 0,
    sriPreserved: 0,
    sriMismatchPrevented: 0,
    quirksMode: document.compatMode !== "CSS1Compat",
    websocketReconnects: 0
  };

  const isSriElement = el => el && (el.tagName === "SCRIPT" || el.tagName === "LINK");
  const preserveAndStripIntegrity = (el, value) => {
    if (!isSriElement(el)) return false;
    const text = String(value ?? "");
    try {
      Element.prototype.removeAttribute.call(el, "integrity");
      Element.prototype.removeAttribute.call(el, "scramjet-attr-integrity");
      diag.sriStripped += 1;
      diag.sriMismatchPrevented += 1;
      return true;
    } catch (_) { return false; }
  };

  try {
    const nativeSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
      if (String(name).toLowerCase() === "integrity" && preserveAndStripIntegrity(this, value)) return;
      return nativeSetAttribute.call(this, name, value);
    };
  } catch (_) {}

  for (const Ctor of [globalThis.HTMLScriptElement, globalThis.HTMLLinkElement]) {
    if (!Ctor?.prototype) continue;
    try {
      const descriptor = Object.getOwnPropertyDescriptor(Ctor.prototype, "integrity");
      if (!descriptor?.set) continue;
      Object.defineProperty(Ctor.prototype, "integrity", {
        configurable: descriptor.configurable !== false,
        enumerable: descriptor.enumerable,
        get: descriptor.get ? function(){ return descriptor.get.call(this); } : function(){ return ""; },
        set(value) { preserveAndStripIntegrity(this, value); }
      });
    } catch (_) {}
  }

  const stripTree = root => {
    try {
      const nodes = [];
      if (isSriElement(root) && root.hasAttribute?.("integrity")) nodes.push(root);
      root.querySelectorAll?.("script[integrity],link[integrity]").forEach(node => nodes.push(node));
      for (const node of nodes) preserveAndStripIntegrity(node, node.getAttribute("integrity"));
    } catch (_) {}
  };
  stripTree(document);
  try {
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === "attributes" && record.attributeName === "integrity") {
          const node = record.target;
          preserveAndStripIntegrity(node, node.getAttribute("integrity"));
        }
        for (const node of record.addedNodes || []) if (node?.nodeType === 1) stripTree(node);
      }
    }).observe(document.documentElement || document, { subtree: true, childList: true, attributes: true, attributeFilter: ["integrity"] });
  } catch (_) {}
})();


/* R8.1 generic JavaScript callable/receiver semantics probe. This does not
 * alter site objects; it records whether the proxied realm preserves the
 * function behavior frameworks rely on. */
;(() => {
  "use strict";
  try {
    class NovaCallableProbe {
      constructor(value) { this.value = value; }
      method(delta) { return this.value + delta; }
      get callable() { return function(delta) { return this.value + delta; }; }
    }
    const instance = new NovaCallableProbe(40);
    const bound = instance.method.bind(instance);
    const getterFn = Object.getOwnPropertyDescriptor(NovaCallableProbe.prototype, "callable").get.call(instance);
    const proxied = new Proxy(instance, {
      get(target, prop, receiver) { return Reflect.get(target, prop, receiver); }
    });
    const Constructable = new Proxy(NovaCallableProbe, {
      construct(target, args, newTarget) { return Reflect.construct(target, args, newTarget); },
      apply(target, receiver, args) { return Reflect.apply(target, receiver, args); }
    });
    const results = {
      methodIsFunction: typeof proxied.method === "function",
      receiverPreserved: proxied.method(2) === 42,
      boundWorks: bound(2) === 42,
      getterCallableWorks: getterFn.call(instance, 2) === 42,
      constructorWorks: new Constructable(42).value === 42
    };
    const ok = Object.values(results).every(Boolean);
    const diag = globalThis.__NOVA_PROXY_PAGE_DIAGNOSTICS__ = globalThis.__NOVA_PROXY_PAGE_DIAGNOSTICS__ || {};
    diag.callableSemantics = { ok, ...results };
    if (!ok) console.warn("[Nova R8.1] callable semantics probe failed", results);
  } catch (error) {
    const diag = globalThis.__NOVA_PROXY_PAGE_DIAGNOSTICS__ = globalThis.__NOVA_PROXY_PAGE_DIAGNOSTICS__ || {};
    diag.callableSemantics = { ok: false, error: String(error?.message || error).slice(0, 160) };
  }
})();

/* Nova Resilience R8.2 route-state guard/diagnostics.
 * Generic only: a literal missing-route sentinel must never become an upstream
 * /undefined navigation. This runs in the proxied realm and stores metadata only. */
;(() => {
  "use strict";
  if (globalThis.__NOVA_R82_ROUTE_GUARD__) return;
  globalThis.__NOVA_R82_ROUTE_GUARD__ = true;
  try {
    const diag = globalThis.__NOVA_PROXY_PAGE_DIAGNOSTICS__ = globalThis.__NOVA_PROXY_PAGE_DIAGNOSTICS__ || {};
    const client = globalThis[Symbol.for("scramjet client global")];
    const safeSnapshot = () => {
      let logical = null;
      try { logical = client?.url ? new URL(client.url.href) : null; } catch (_) {}
      return {
        logicalOrigin: logical?.origin || "",
        logicalPathname: logical?.pathname || "",
        physicalPrefix: String(globalThis.location?.pathname || "").split("/").slice(0, 4).join("/"),
        compatMode: String(document.compatMode || "")
      };
    };
    diag.routeStateInitial = safeSnapshot();

    // Only repair the exact missing-route sentinel. Never remap a real 404 or
    // any site-specific route; this is the generic invariant requested by R8/R8.1.
    if (client?.url) {
      let logical;
      try { logical = new URL(client.url.href); } catch (_) { logical = null; }
      if (logical && /^\/undefined\/?$/i.test(logical.pathname)) {
        const fixed = new URL(logical.href);
        fixed.pathname = "/";
        fixed.search = "";
        diag.undefinedRoutePrevented = (diag.undefinedRoutePrevented || 0) + 1;
        diag.undefinedRouteFrom = logical.pathname;
        // replace() avoids adding the malformed route to upstream history.
        try { globalThis.location.replace(client.rewriteUrl(fixed.href, { navigateType: "location" })); }
        catch (_) { client.url = fixed.href; }
        return;
      }
    }

    const nativePush = History.prototype.pushState;
    const nativeReplace = History.prototype.replaceState;
    const sanitize = (url) => {
      if (url === undefined || url === null || url === "") return url;
      const text = String(url);
      if (!/^(?:\.?\/?undefined)(?:[?#].*)?$/i.test(text)) return url;
      diag.undefinedHistoryPrevented = (diag.undefinedHistoryPrevented || 0) + 1;
      return "/";
    };
    History.prototype.pushState = function(state, title, url) {
      return nativePush.call(this, state, title, sanitize(url));
    };
    History.prototype.replaceState = function(state, title, url) {
      return nativeReplace.call(this, state, title, sanitize(url));
    };
    queueMicrotask(() => { diag.routeStateAfterHook = safeSnapshot(); });
  } catch (_) {}
})();


/* Nova Resilience R8.11 synchronous SRI guard.
 * Chromium can begin fetching/checking a dynamically inserted <script>/<link>
 * before MutationObserver callbacks run. Scramjet already strips integrity in
 * its HTML rewriter, but this guard also sanitizes DOM insertion APIs and HTML
 * sinks synchronously so rewritten resources can never retain a stale hash. */
;(() => {
  "use strict";
  if (globalThis.__NOVA_R811_SYNC_SRI__) return;
  globalThis.__NOVA_R811_SYNC_SRI__ = true;

  const sriTag = el => el && el.nodeType === 1 && (el.tagName === "SCRIPT" || el.tagName === "LINK");
  const stripOne = el => {
    try {
      if (!sriTag(el) || !el.hasAttribute("integrity")) return;
      const value = Element.prototype.getAttribute.call(el, "integrity") || "";
      Element.prototype.removeAttribute.call(el, "integrity");
      Element.prototype.removeAttribute.call(el, "scramjet-attr-integrity");
      const d = globalThis.__NOVA_PROXY_PAGE_DIAGNOSTICS__;
      if (d) { d.sriStripped = (d.sriStripped || 0) + 1; d.sriMismatchPrevented = (d.sriMismatchPrevented || 0) + 1; }
    } catch (_) {}
  };
  const stripTreeSync = node => {
    try {
      if (!node) return node;
      stripOne(node);
      node.querySelectorAll?.("script[integrity],link[integrity]").forEach(stripOne);
    } catch (_) {}
    return node;
  };
  const stripHtml = value => String(value).replace(/<(script|link)\b([^>]*?)>/gi, (tag, name, attrs) => {
    if (!/\bintegrity\s*=\s*/i.test(attrs)) return tag;
    let original = "";
    let clean = attrs.replace(/\s+integrity\s*=\s*(?:([\"'])(.*?)\1|([^\s>]+))/i, (_m,_q,quoted,bare) => {
      original = quoted ?? bare ?? "";
      return "";
    });
    return `<${name}${clean}>`;
  });

  const wrapNodeInsertion = (proto, name, nodeIndexes) => {
    try {
      const native = proto?.[name];
      if (typeof native !== "function") return;
      Object.defineProperty(proto, name, { configurable: true, writable: true, value: function(...args) {
        for (const i of nodeIndexes(args)) stripTreeSync(args[i]);
        return Reflect.apply(native, this, args);
      }});
    } catch (_) {}
  };
  wrapNodeInsertion(Node.prototype, "appendChild", () => [0]);
  wrapNodeInsertion(Node.prototype, "insertBefore", () => [0]);
  wrapNodeInsertion(Node.prototype, "replaceChild", () => [0]);
  for (const name of ["append","prepend","before","after","replaceWith"]) {
    wrapNodeInsertion(Element.prototype, name, args => args.map((_,i)=>i));
    if (globalThis.DocumentFragment?.prototype) wrapNodeInsertion(DocumentFragment.prototype, name, args => args.map((_,i)=>i));
  }

  try {
    const nativeSetAttributeNS = Element.prototype.setAttributeNS;
    if (nativeSetAttributeNS) Element.prototype.setAttributeNS = function(ns, name, value) {
      if (String(name).toLowerCase() === "integrity" && sriTag(this)) {
        Element.prototype.removeAttribute.call(this, "integrity");
        Element.prototype.removeAttribute.call(this, "scramjet-attr-integrity");
        return;
      }
      return Reflect.apply(nativeSetAttributeNS, this, [ns, name, value]);
    };
  } catch (_) {}

  try {
    const nativeInsertAdjacentHTML = Element.prototype.insertAdjacentHTML;
    if (nativeInsertAdjacentHTML) Element.prototype.insertAdjacentHTML = function(position, text) {
      return Reflect.apply(nativeInsertAdjacentHTML, this, [position, stripHtml(text)]);
    };
  } catch (_) {}

  for (const proto of [Element.prototype, globalThis.ShadowRoot?.prototype].filter(Boolean)) {
    try {
      const desc = Object.getOwnPropertyDescriptor(proto, "innerHTML");
      if (!desc?.set) continue;
      Object.defineProperty(proto, "innerHTML", {
        configurable: desc.configurable !== false,
        enumerable: desc.enumerable,
        get: desc.get ? function(){ return desc.get.call(this); } : undefined,
        set(value){ return desc.set.call(this, stripHtml(value)); }
      });
    } catch (_) {}
  }
})();
