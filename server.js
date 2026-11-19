// Moka table-ordering system: zero-dependency Node server (Node >= 22.13) + SQLite.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const{DatabaseSync}=require('node:sqlite');
const PORT=process.env.PORT||3000,PUB=path.join(__dirname,'public'),DATA=path.join(__dirname,'data');
fs.mkdirSync(DATA,{recursive:true});fs.mkdirSync(path.join(PUB,'uploads'),{recursive:true});
const SF=path.join(DATA,'.secret');if(!fs.existsSync(SF))fs.writeFileSync(SF,crypto.randomBytes(32).toString('hex'));
const SECRET=fs.readFileSync(SF,'utf8');
const db=new DatabaseSync(path.join(DATA,'moka.db'));
db.exec(`create table if not exists users(id integer primary key,username text unique,pass text,role text);
create table if not exists items(id integer primary key,cat text,name text,price real,descr text,img text,active integer default 1,sort integer default 0);
create table if not exists orders(id text primary key,tbl text,name text,phone text,email text,items text,total real,pay text,note text,status text default 'new',at integer);`);
const all=(s,...a)=>db.prepare(s).all(...a),one=(s,...a)=>db.prepare(s).get(...a),run=(s,...a)=>db.prepare(s).run(...a);
const hp=(p,s=crypto.randomBytes(8).toString('hex'))=>s+':'+crypto.scryptSync(p,s,32).toString('hex');
const hv=(p,h)=>{const[s,x]=h.split(':');return crypto.timingSafeEqual(Buffer.from(hp(p,s).split(':')[1]),Buffer.from(x))};
const mac=b=>crypto.createHmac('sha256',SECRET).update(b).digest('base64url');
const sign=o=>{const b=Buffer.from(JSON.stringify(o)).toString('base64url');return b+'.'+mac(b)};
const auth=(req,roles)=>{try{const[b,s]=(req.headers.authorization||'').slice(7).split('.');if(s!==mac(b))return null;const u=JSON.parse(Buffer.from(b,'base64url'));return u.exp>Date.now()&&(!roles.length||roles.includes(u.role))?u:null}catch{return null}};
if(!one('select 1 x from items'))JSON.parse(fs.readFileSync(path.join(__dirname,'seed.json'))).forEach((i,n)=>run('insert into items(cat,name,price,descr,img,sort) values(?,?,?,?,?,?)',i.cat,i.name,i.price,i.descr||'',i.img||'',n));
if(!one('select 1 x from users')){const p=process.env.ADMIN_PASSWORD||crypto.randomBytes(5).toString('hex');run('insert into users(username,pass,role) values(?,?,?)','admin',hp(p),'admin');console.log('FIRST RUN -> admin login: admin /',p)}
const body=req=>new Promise(ok=>{let b='';req.on('data',d=>{b+=d;if(b.length>5e6)req.destroy()});req.on('end',()=>{try{ok(b?JSON.parse(b):{})}catch{ok({})}})});
const tries={};const S=(v,n=200)=>String(v??'').trim().slice(0,n);
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const STATUS=['new','prep','ready','done','cancelled'],ROLES=['admin','cashier','kitchen'];
http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://x'),p=u.pathname,m=req.method;
 try{
  if(p.startsWith('/api/')){
   const J=(c,o)=>{res.writeHead(c,{'content-type':'application/json'});res.end(JSON.stringify(o))};
   const b=m==='GET'?{}:await body(req);let me,x;
   const need=(...r)=>(me=auth(req,r))?true:(J(401,{error:'Unauthorized'}),false);
   if(p==='/api/menu')return J(200,all('select id,cat,name,price,descr,img from items where active=1 order by sort,id'));
   if(p==='/api/login'&&m==='POST'){const ip=req.socket.remoteAddress,t=tries[ip]=(tries[ip]||[]).filter(z=>z>Date.now()-9e5);if(t.length>=10)return J(429,{error:'Too many attempts, try later'});
    const r=one('select * from users where username=?',S(b.username));if(!r||!hv(S(b.password,100),r.pass)){t.push(Date.now());return J(401,{error:'Wrong username or password'})}
    return J(200,{token:sign({id:r.id,u:r.username,role:r.role,exp:Date.now()+12*36e5}),role:r.role,username:r.username})}
   if(p==='/api/orders'&&m==='POST'){
    const tbl=S(b.tbl,10),name=S(b.name,60),phone=S(b.phone,20),email=S(b.email,80);
    if(!tbl||!name||!/^\+?[\d\s-]{8,}$/.test(phone)||!/^\S+@\S+\.\S+$/.test(email)||!['cash','card'].includes(b.pay)||!Array.isArray(b.items)||!b.items.length||b.items.length>60)return J(400,{error:'Please fill all fields correctly'});
    let total=0;const items=[];for(const i of b.items){const r=one('select * from items where id=? and active=1',+i.id),q=Math.floor(+i.q);if(!r||!(q>=1&&q<=50))return J(400,{error:'Invalid item'});total+=r.price*q;items.push({n:r.name,q,p:r.price})}
    const id=crypto.randomBytes(5).toString('hex');run('insert into orders(id,tbl,name,phone,email,items,total,pay,note,at) values(?,?,?,?,?,?,?,?,?,?)',id,tbl,name,phone,email,JSON.stringify(items),total,b.pay,S(b.note,300),Date.now());return J(200,{id,total})}
   if((x=p.match(/^\/api\/orders\/(\w+)$/))&&m==='GET'){const r=one('select status from orders where id=?',x[1]);return r?J(200,r):J(404,{})}
   if(p==='/api/staff/orders'&&m==='GET'){if(!need())return;const r=all("select * from orders where status in ('new','prep','ready') or at>? order by at desc limit 150",Date.now()-864e5);return J(200,r.map(o=>({...o,items:JSON.parse(o.items)})))}
   if((x=p.match(/^\/api\/staff\/orders\/(\w+)$/))&&m==='PATCH'){if(!need())return;if(!STATUS.includes(b.status))return J(400,{});run('update orders set status=? where id=?',b.status,x[1]);return J(200,{ok:1})}
   if(p==='/api/admin/items'&&m==='GET'){if(!need('admin'))return;return J(200,all('select * from items order by sort,id'))}
   if(p==='/api/admin/items'&&m==='POST'){if(!need('admin'))return;const s=one('select coalesce(max(sort),0)+1 n from items').n;const r=run('insert into items(cat,name,price,descr,img,active,sort) values(?,?,?,?,?,?,?)',S(b.cat,60),S(b.name,80),+b.price||0,S(b.descr,300),S(b.img,300),b.active===0?0:1,s);return J(200,{id:Number(r.lastInsertRowid)})}
   if((x=p.match(/^\/api\/admin\/items\/(\d+)$/))){if(!need('admin'))return;
    if(m==='PUT'){run('update items set cat=?,name=?,price=?,descr=?,img=?,active=? where id=?',S(b.cat,60),S(b.name,80),+b.price||0,S(b.descr,300),S(b.img,300),b.active?1:0,+x[1]);return J(200,{ok:1})}
    if(m==='DELETE'){run('delete from items where id=?',+x[1]);return J(200,{ok:1})}}
   if(p==='/api/admin/upload'&&m==='POST'){if(!need('admin'))return;const g=String(b.data).match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);if(!g)return J(400,{error:'Image must be png/jpeg/webp'});const buf=Buffer.from(g[2],'base64');if(buf.length>3e6)return J(400,{error:'Max 3MB'});const f=crypto.randomBytes(6).toString('hex')+'.'+(g[1]==='jpeg'?'jpg':g[1]);fs.writeFileSync(path.join(PUB,'uploads',f),buf);return J(200,{url:'/uploads/'+f})}
   if(p==='/api/admin/report'&&m==='GET'){if(!need('admin'))return;const f=Date.parse(u.searchParams.get('from')||'2000-01-01'),t=Date.parse((u.searchParams.get('to')||'2999-12-31')+'T23:59:59Z');
    const days={},top={},pays={};let rev=0;const os=all("select * from orders where status!='cancelled' and at between ? and ?",f,t);
    for(const o of os){rev+=o.total;const d=new Date(o.at).toLocaleDateString('en-CA',{timeZone:'Africa/Cairo'});(days[d]??={orders:0,revenue:0}).orders++;days[d].revenue+=o.total;(pays[o.pay]??={orders:0,revenue:0}).orders++;pays[o.pay].revenue+=o.total;for(const i of JSON.parse(o.items)){(top[i.n]??={qty:0,revenue:0}).qty+=i.q;top[i.n].revenue+=i.q*i.p}}
    return J(200,{orders:os.length,revenue:rev,days:Object.entries(days).sort().map(([d,v])=>({d,...v})),top:Object.entries(top).map(([n,v])=>({n,...v})).sort((a,b)=>b.qty-a.qty).slice(0,15),pays})}
   if(p==='/api/admin/users'){if(!need('admin'))return;
    if(m==='GET')return J(200,all('select id,username,role from users'));
    if(m==='POST'){if(!/^\w{3,30}$/.test(S(b.username))||S(b.password,100).length<6||!ROLES.includes(b.role))return J(400,{error:'Username 3+ chars, password 6+ chars, valid role'});
     try{run('insert into users(username,pass,role) values(?,?,?)',b.username,hp(b.password),b.role)}catch{return J(400,{error:'Username already exists'})}return J(200,{ok:1})}
    if(m==='DELETE'){if(+b.id===me.id)return J(400,{error:'You cannot delete yourself'});run('delete from users where id=?',+b.id);return J(200,{ok:1})}}
   return J(404,{error:'Not found'})}
  let f=path.normalize(path.join(PUB,p==='/'?'index.html':p));
  if(!f.startsWith(PUB)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end('Not found')}
  res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream','x-content-type-options':'nosniff'});fs.createReadStream(f).pipe(res);
 }catch(e){console.error(e);res.writeHead(500);res.end('Server error')}
}).listen(PORT,()=>console.log('Moka running on http://localhost:'+PORT));
