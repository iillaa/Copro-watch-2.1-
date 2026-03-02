const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./web-CzsE_XMG.js","./index-BYM9CpjD.js"])))=>i.map(i=>d[i]);
import { _ as e, __tla as __tla_0 } from "./index-B_BteyLG.js";
import { registerPlugin as p } from "./index-BYM9CpjD.js";
let i;
let __tla = Promise.all([
    (()=>{
        try {
            return __tla_0;
        } catch  {}
    })()
]).then(async ()=>{
    i = p("App", {
        web: ()=>e(()=>import("./web-CzsE_XMG.js"), __vite__mapDeps([0,1]), import.meta.url).then((r)=>new r.AppWeb)
    });
});
export { i as App, __tla };
