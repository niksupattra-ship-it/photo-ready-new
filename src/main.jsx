import React,{useState} from "react";import{createRoot}from"react-dom/client";import"./style.css";
function App(){
 const[file,setFile]=useState(null),[before,setBefore]=useState(""),[after,setAfter]=useState(""),[busy,setBusy]=useState(false),[err,setErr]=useState("");
 const choose=e=>{const f=e.target.files?.[0];if(!f)return;setFile(f);setBefore(URL.createObjectURL(f));setAfter("");setErr("")};
 async function remove(){if(!file)return;setBusy(true);setErr("");try{const fd=new FormData();fd.append("image",file);const r=await fetch("/api/remove-background",{method:"POST",body:fd});if(!r.ok)throw new Error(await r.text());const b=await r.blob();setAfter(URL.createObjectURL(b))}catch(e){setErr(e.message||"ลบพื้นหลังไม่สำเร็จ")}finally{setBusy(false)}}
 return <main><section className="hero"><span className="tag">BACKGROUND REMOVER</span><h1>ลบพื้นหลังรูปบุคคล</h1><p>คงพิกเซลของบุคคลจากภาพต้นฉบับ และเปลี่ยนเฉพาะพื้นหลังเป็นโปร่งใส</p></section>
 <section className="card"><label className="drop"><input type="file" accept="image/*" onChange={choose}/>{before?<img src={before}/>:<><b>เพิ่มรูปภาพ</b><span>JPG / PNG / WEBP</span></>}</label>
 <button disabled={!file||busy} onClick={remove}>{busy?"กำลังแยกบุคคล…":"ลบพื้นหลัง"}</button>{err&&<p className="error">{err}</p>}
 {after&&<div className="result"><div><h3>ต้นฉบับ</h3><img src={before}/></div><div><h3>พื้นหลังโปร่งใส</h3><div className="checker"><img src={after}/></div></div></div>}
 {after&&<a className="download" href={after} download="background-removed.png">ดาวน์โหลด PNG</a>}</section>
 <p className="note">ระบบนี้ไม่ใช้ Generative AI วาดใบหน้าใหม่</p></main>}
createRoot(document.getElementById("root")).render(<App/>);