import crypto from 'crypto';
import pg from 'pg';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?.includes('localhost')?false:{rejectUnauthorized:false}});
let init;
async function ready(){if(!init)init=pool.query('CREATE TABLE IF NOT EXISTS saved_studio_work(id text PRIMARY KEY,wallet_id text NOT NULL REFERENCES wallets(id),name text NOT NULL,project jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now())');await init}
export function validateProject(p){
 if(p?.format!=='idprom-studio'||p.version!==1||p.width!==900||p.height!==1200||!Array.isArray(p.layers)||!p.layers.length||p.layers.length>20)throw Error('invalid_project');
 const heads=p.layers.filter(l=>l.kind==='head'||l.name==='หัว · คอ · ผม');if(!heads.length||heads.some(l=>typeof l.jobId!=='string'||!l.jobId))throw Error('paid_image_required');
 for(const l of p.layers){if(typeof l.name!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(l.source)||![l.x,l.y,l.scale,l.rotation,l.opacity].every(Number.isFinite)||l.scale<.1||l.scale>5||l.opacity<0||l.opacity>1)throw Error('invalid_layer');for(const field of ['mask','warpSource','warpBaseMask'])if(l[field]&&!/^data:image\/(png|jpeg|webp);base64,/.test(l[field]))throw Error('invalid_layer')}
 if(p.compareSource&&!/^data:image\/(png|jpeg|webp);base64,/.test(p.compareSource))throw Error('invalid_original');
 if(p.placement&&(!['W','H','uX','uY','uW','uH'].every(k=>Number.isFinite(p.placement[k]))||p.placement.W<=0||p.placement.H<=0))throw Error('invalid_placement');
 return [...new Set(heads.map(l=>l.jobId))];
}
export async function saveWork(walletId,id,project){await ready();validateProject(project);const name='รูป IDพร้อม';if(id){const r=await pool.query('UPDATE saved_studio_work SET project=$3,updated_at=now() WHERE id=$1 AND wallet_id=$2 RETURNING id,name,updated_at',[id,walletId,project]);return r.rows[0]||null}const r=await pool.query('INSERT INTO saved_studio_work(id,wallet_id,name,project) VALUES($1,$2,$3,$4) RETURNING id,name,updated_at',['work_'+crypto.randomBytes(18).toString('hex'),walletId,name,project]);return r.rows[0]}
export async function listWorks(walletId){await ready();const r=await pool.query('SELECT id,name,updated_at FROM saved_studio_work WHERE wallet_id=$1 ORDER BY updated_at DESC LIMIT 100',[walletId]);return r.rows}
export async function getWork(walletId,id){await ready();const r=await pool.query('SELECT id,name,project,updated_at FROM saved_studio_work WHERE id=$1 AND wallet_id=$2',[id,walletId]);return r.rows[0]||null}
