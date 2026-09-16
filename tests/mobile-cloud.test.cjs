const test=require('node:test');
const assert=require('node:assert/strict');

const values=new Map();
global.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
global.JINHUA_MOBILE_CONFIG={supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_test_key_123456789'};
const Cloud=require('../studio-cloud.js');

test.beforeEach(()=>{values.clear();});

test('rejects an invalid cloud URL',()=>{
  global.JINHUA_MOBILE_CONFIG={supabaseUrl:'http://example.supabase.co',publishableKey:'sb_publishable_test_key_123456789'};
  assert.equal(Cloud.configured(),false);
  global.JINHUA_MOBILE_CONFIG={supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_test_key_123456789'};
});

test('sign in stores the user session and authenticated insert owns its row',async()=>{
  const calls=[];global.fetch=async(url,options)=>{calls.push({url,options});if(url.includes('/auth/v1/token'))return new Response(JSON.stringify({access_token:'user-token',refresh_token:'refresh-token',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'user-1',email:'lance@example.com'}}),{status:200});return new Response(JSON.stringify([{id:'row-1'}]),{status:201});};
  const session=await Cloud.signIn('lance@example.com','password123');assert.equal(session.user.id,'user-1');assert.equal(Cloud.readSession().access_token,'user-token');
  await Cloud.createInbox({workspace:'personal',kind:'text',title:'路上想到的镜头',body:'窗外光线变化'});
  const insert=calls.find(call=>call.url.endsWith('/rest/v1/mobile_inbox'));const row=JSON.parse(insert.options.body);assert.equal(row.user_id,'user-1');assert.equal(row.status,'inbox');assert.equal(insert.options.headers.Authorization,'Bearer user-token');
});

test('email-confirmation signup is not mistaken for a logged-in session',async()=>{
  global.fetch=async()=>new Response(JSON.stringify({user:{id:'pending-user'},session:null}),{status:200});
  const result=await Cloud.signUp('lance@example.com','password123');assert.equal(result.user.id,'pending-user');assert.equal(Cloud.readSession(),null);
});

test('safe file names cannot add folders or credentials',()=>{
  assert.equal(Cloud.safeName('../我的 参考图?.png'),'png');
  assert.equal(Cloud.safeName('scene-reference.mov'),'scene-reference.mov');
});
