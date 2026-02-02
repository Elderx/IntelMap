import{s as a,O as f}from"./index-Xm99pLBR.js";let i={main:null,left:null,right:null};function p(t){return t===null?"-":`${Math.round(t*3.28084).toLocaleString()} ft`}function g(t){return t===null?"-":`${Math.round(t*1.94384)} kts`}function m(t){const n=document.createElement("div");n.className="aircraft-popup";const l=t[0],o=t[1]||"N/A",r=t[2]||"Unknown",e=p(t[7]),u=g(t[9]),c=t[10],d=t[8];return n.innerHTML=`
    <div class="aircraft-popup-content">
      <h3>✈️ ${o}</h3>
      <table>
        <tr><td>Transponder</td><td><code>${l}</code></td></tr>
        <tr><td>Country</td><td>${r}</td></tr>
        <tr><td>Altitude</td><td>${e}</td></tr>
        <tr><td>Speed</td><td>${u}</td></tr>
        <tr><td>Heading</td><td>${c!==null?c+"°":"-"}</td></tr>
        <tr><td>Status</td><td>${d?"🛬 Grounded":"✈️ In flight"}</td></tr>
      </table>
    </div>
  `,n}function s(t,n,l,o=!1){const r=n==="main"?a.map:n==="left"?a.leftMap:a.rightMap;if(!r)return;i[n]&&r.removeOverlay(i[n]);const e=t.get("openskyState"),u=m(e),c=new f({element:u,position:l,positioning:"bottom-center",stopEvent:!1,autoPan:{margin:50}});c.set("pinned",o),c.set("aircraftFeature",t),r.addOverlay(c),i[n]=c;const d=u.querySelector(".popup-close-button");d&&d.addEventListener("click",()=>{r.removeOverlay(c),i[n]=null})}function v(){["main","left","right"].forEach(t=>{const n=t==="main"?a.map:t==="left"?a.leftMap:a.rightMap;if(!n)return;let l=null;n.on("pointermove",o=>{const r=n.forEachFeatureAtPixel(o.pixel,e=>e);if(r&&r.get("isAircraft")){const e=i[t];(!e||!e.get("aircraftFeature")||e.get("aircraftFeature")!==r||!e.get("pinned"))&&s(r,t,o.coordinate,!1),l=r}else if(l&&(!r||!r.get("isAircraft"))){const e=i[t];e&&!e.get("pinned")&&(n.removeOverlay(e),i[t]=null),l=null}}),n.getViewport().addEventListener("pointerleave",()=>{const o=i[t];o&&!o.get("pinned")&&(n.removeOverlay(o),i[t]=null),l=null}),n.on("click",o=>{const r=n.forEachFeatureAtPixel(o.pixel,e=>e);if(r&&r.get("isAircraft"))s(r,t,o.coordinate,!0),o.stopPropagation();else{const e=i[t];e&&e.get("pinned")&&(n.removeOverlay(e),i[t]=null)}})}),console.log("[Aircraft] Hover and click handlers installed")}function A(){["main","left","right"].forEach(t=>{const n=t==="main"?a.map:t==="left"?a.leftMap:a.rightMap;n&&i[t]&&(n.removeOverlay(i[t]),i[t]=null)})}export{A as cleanupAircraftInteractions,v as setupAircraftClickHandlers};
