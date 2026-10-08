import crypto from 'crypto';
import pg from 'pg';
const COOKIE='idprom_private_trial';
// Identity comes only from the server-verified login middleware.
const OWNER_EMAIL='treeradech009@gmail.com';
function isPrivateOwner(req,wallet){const user=req.accountUser;return Boolean(user&&wallet&&user.wallet_id===wallet&&String(user.email||'').trim().toLowerCase()===OWNER_EMAIL)}
let pool,readyPromise;
const key=()=>String(process.env.IDPROM_PRIVATE_TRIAL_KEY||'');
const cookieSecret=()=>process.env.TRIAL_DEVICE_SECRET||process.env.STRIPE_WEBHOOK_SECRET||process.env.STRIPE_SECRET_KEY||'';
function equal(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function signature(device,wallet){return crypto.createHmac('sha256',cookieSecret()).update('private-trial-v1:'+key()+':'+device+':'+wallet).digest('hex')}
function cookieDevice(req,wallet){
 if(key().length<48||!cookieSecret()||!wallet)return null;
 const cookie=String(req.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='));
 const match=/^([a-f0-9]{64})\.([a-f0-9]{64})$/.exec(cookie?cookie.slice(COOKIE.length+1):'');
 return match&&equal(signature(match[1],wallet),match[2])?match[1]:null;
}
export function hasPrivateTrial(req,wallet){return isPrivateOwner(req,wallet)||Boolean(cookieDevice(req,wallet))}
async function ready(){
 if(!readyPromise)readyPromise=(async()=>{
  pool=pool||new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='disable'||String(process.env.DATABASE_URL).includes('localhost')?false:{rejectUnauthorized:false}});
  await pool.query('CREATE TABLE IF NOT EXISTS private_trial_access (key_hash text PRIMARY KEY,wallet_id text NOT NULL,device_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now())');
 })().catch(e=>{readyPromise=null;throw e});
 return readyPromise;
}
export function registerPrivateTrial(app,{walletId,getWallet,appUrl}){
 app.get('/api/private-trial',(req,res)=>res.set('Cache-Control','no-store').json({active:hasPrivateTrial(req,walletId(req))}));
 app.post('/api/private-trial',async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{
   const secret=key(),token=String(req.body?.key||''),wallet=walletId(req);
   if(token==='owner'){
    if(!req.accountUser)return res.status(401).json({message:'กรุณาเข้าสู่ระบบด้วยบัญชีส่วนตัวก่อน แล้วเปิดลิงก์นี้อีกครั้ง'});
    if(!isPrivateOwner(req,wallet))return res.status(403).json({message:'ลิงก์นี้ใช้ได้เฉพาะบัญชีเจ้าของที่กำหนดไว้'});
    if(!await getWallet(wallet))return res.status(400).json({message:'กรุณารีเฟรชหน้าแล้วเปิดลิงก์อีกครั้ง'});
    return res.json({active:true});
   }
   if(secret.length<48||!cookieSecret()||!equal(secret,token))return res.status(403).json({message:'ลิงก์ทดสอบไม่ถูกต้องหรือยังไม่ได้เปิดใช้งาน'});
   if(!wallet||!await getWallet(wallet))return res.status(400).json({message:'กรุณารีเฟรชหน้าแล้วเปิดลิงก์อีกครั้ง'});
   await ready();
   const device=cookieDevice(req,wallet)||crypto.randomBytes(32).toString('hex');
   const keyHash=crypto.createHash('sha256').update(secret).digest('hex');
   // Atomic first-device claim; a copied link cannot activate another browser.
   const claim=await pool.query(`INSERT INTO private_trial_access(key_hash,wallet_id,device_id) VALUES($1,$2,$3)
    ON CONFLICT(key_hash) DO UPDATE SET key_hash=EXCLUDED.key_hash
    WHERE private_trial_access.wallet_id=EXCLUDED.wallet_id AND private_trial_access.device_id=EXCLUDED.device_id RETURNING key_hash`,[keyHash,wallet,device]);
   if(!claim.rowCount)return res.status(403).json({message:'ลิงก์นี้เปิดใช้บนเครื่องอื่นแล้ว กรุณาใช้เบราว์เซอร์เดิม'});
   res.cookie(COOKIE,device+'.'+signature(device,wallet),{httpOnly:true,sameSite:'strict',secure:req.secure||appUrl.startsWith('https://'),path:'/',maxAge:365*24*60*60*1000});
   res.json({active:true});
  }catch(e){console.error('Private trial activation failed');res.status(503).json({message:'เปิดโหมดทดสอบไม่สำเร็จ กรุณาลองใหม่'})}
 });
}
