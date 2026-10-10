import crypto from 'crypto';
import pg from 'pg';
const {Pool}=pg;
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for auth storage');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:undefined});
let init;
async function ready(){if(!init)init=(async()=>{await pool.query(`CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY,email text UNIQUE NOT NULL,password_hash text NOT NULL,wallet_id text UNIQUE NOT NULL REFERENCES wallets(id),created_at timestamptz NOT NULL DEFAULT now())`);await pool.query(`CREATE TABLE IF NOT EXISTS user_sessions (token_hash text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL)`);})();return init}
function normEmail(v){return String(v||'').trim().toLowerCase()}
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){const hash=crypto.scryptSync(String(password),salt,64).toString('hex');return `${salt}:${hash}`}
function verifyPassword(password,stored){try{const [salt,expected]=String(stored).split(':');const actual=crypto.scryptSync(String(password),salt,64);return crypto.timingSafeEqual(actual,Buffer.from(expected,'hex'))}catch{return false}}
async function sessionFor(userId){const token=crypto.randomBytes(32).toString('hex'),tokenHash=crypto.createHash('sha256').update(token).digest('hex');await pool.query(`INSERT INTO user_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')`,[tokenHash,userId]);return token}
export async function registerUser(email,password,walletId){await ready();email=normEmail(email);if(!/^\S+@\S+\.\S+$/.test(email))return {ok:false,error:'invalid_email'};if(String(password||'').length<8)return {ok:false,error:'weak_password'};const existing=await pool.query('SELECT id FROM users WHERE email=$1',[email]);if(existing.rowCount)return {ok:false,error:'email_exists'};const walletUsed=await pool.query('SELECT id FROM users WHERE wallet_id=$1',[walletId]);if(walletUsed.rowCount)return {ok:false,error:'wallet_in_use'};const id='usr_'+crypto.randomBytes(18).toString('hex');await pool.query('INSERT INTO users(id,email,password_hash,wallet_id) VALUES($1,$2,$3,$4)',[id,email,hashPassword(password),walletId]);return {ok:true,token:await sessionFor(id),email,walletId}}
export async function loginUser(email,password){await ready();email=normEmail(email);const r=await pool.query('SELECT id,email,password_hash,wallet_id FROM users WHERE email=$1',[email]);const u=r.rows[0];if(!u||!verifyPassword(password,u.password_hash))return {ok:false,error:'invalid_login'};return {ok:true,token:await sessionFor(u.id),email:u.email,walletId:u.wallet_id}}
export async function authUser(req){await ready();const m=/^Bearer\s+(.+)$/i.exec(String(req.get('authorization')||''));if(!m)return null;const tokenHash=crypto.createHash('sha256').update(m[1]).digest('hex');const r=await pool.query(`SELECT u.id,u.email,u.wallet_id FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[tokenHash]);return r.rows[0]||null}

export async function walletHasAccount(walletId){await ready();const r=await pool.query('SELECT id FROM users WHERE wallet_id=$1',[walletId]);return r.rowCount>0}

async function readyPasswordReset(){await ready();await pool.query(`CREATE TABLE IF NOT EXISTS password_resets(token_hash text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,used_at timestamptz)`)}
export async function createPasswordReset(email){
 await readyPasswordReset();const c=await pool.connect();
 try{await c.query('BEGIN');const {rows}=await c.query('SELECT id,email FROM users WHERE email=$1 FOR UPDATE',[normEmail(email)]);const user=rows[0];if(!user){await c.query('COMMIT');return null}
 const recent=await c.query("SELECT 1 FROM password_resets WHERE user_id=$1 AND created_at>now()-interval '1 minute' LIMIT 1",[user.id]);if(recent.rowCount){await c.query('COMMIT');return null}
 const token=crypto.randomBytes(32).toString('hex');await c.query("INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",[crypto.createHash('sha256').update(token).digest('hex'),user.id]);await c.query('COMMIT');return {email:user.email,token}
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export async function resetPassword(token,password){
 if(!/^[a-f0-9]{64}$/.test(String(token||'')))return {ok:false,error:'invalid_reset'};
 if(typeof password!=='string'||password.length<8||password.length>128)return {ok:false,error:'weak_password'};
 await readyPasswordReset();const c=await pool.connect();
 try{await c.query('BEGIN');const hash=crypto.createHash('sha256').update(token).digest('hex');
 const lookup=await c.query('SELECT user_id FROM password_resets WHERE token_hash=$1',[hash]);const userId=lookup.rows[0]?.user_id;if(!userId){await c.query('ROLLBACK');return {ok:false,error:'invalid_reset'}}
 // Lock the user first: concurrent reset links cannot both remain valid.
 await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
 const valid=await c.query('SELECT token_hash FROM password_resets WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE',[hash]);if(!valid.rowCount){await c.query('ROLLBACK');return {ok:false,error:'invalid_reset'}}
 await c.query('UPDATE users SET password_hash=$2 WHERE id=$1',[userId,hashPassword(password)]);
 await c.query('UPDATE password_resets SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',[userId]);
 await c.query('DELETE FROM user_sessions WHERE user_id=$1',[userId]);
 await c.query('COMMIT');return {ok:true}
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
