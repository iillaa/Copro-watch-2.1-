const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/web-CzsE_XMG.js","assets/index-BYM9CpjD.js"])))=>i.map(i=>d[i]);
import { _ as p, __tla as __tla_0 } from "./index-pThjosO1.js";
import { registerPlugin as r } from "./index-BYM9CpjD.js";
let _;
let __tla = Promise.all([
    (()=>{
        try {
            return __tla_0;
        } catch  {}
    })()
]).then(async ()=>{
    _ = r("App", {
        web: ()=>p(()=>import("./web-CzsE_XMG.js"), __vite__mapDeps([0,1])).then((e)=>new e.AppWeb)
    });
});
export { _ as App, __tla };
