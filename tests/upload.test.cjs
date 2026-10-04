const {test}=require('node:test');
const assert=require('node:assert/strict');
const U=require('../studio-upload');
const W=require('../studio-workspace-cloud');
const limits={fileBytes:250*1024**2,reverseVideoBytes:4*1024**3,localLargeVideo:true};
test('655 MB reverse accepted locally; ordinary/public uploads remain bounded',()=>{
  const f={name:'电影.mp4',size:654889594};
  assert.equal(U.validate(f,limits,true),limits.reverseVideoBytes);
  assert.throws(()=>U.validate(f,limits),/尚未上传/);
  assert.throws(()=>U.validate(f,{reverseVideoBytes:250*1024**2},true),/本地工作台/);
  assert.throws(()=>U.validate({...f,size:5*1024**3},limits,true),/超过/);
  assert.throws(()=>U.validate({...f,size:0},limits,true),/为空/);
  assert.throws(()=>U.validate({...f,name:'bad.exe'},limits,true),/MP4/);
});
test('transport reports actual progress and parsed size/disk failures',async()=>{
  const events=[],xhr={upload:{},open(){},setRequestHeader(){},send(){this.upload.onprogress({lengthComputable:true,loaded:5,total:10});this.status=413;this.responseText='';this.onload();}};
  await assert.rejects(U.send({url:'/test',file:{name:'x.mp4',size:10},progress:e=>events.push(e),xhrFactory:()=>xhr}),/413/);
  assert.equal(events[0].percent,50);
  assert.match(U.responseError(507),/磁盘/);
  xhr.send=function(){this.onerror();};
  await assert.rejects(U.send({url:'/test',file:{name:'x.mp4',size:10},xhrFactory:()=>xhr}),/连接中断/);
  xhr.send=function(){this.ontimeout();};
  await assert.rejects(U.send({url:'/test',file:{name:'x.mp4',size:10},xhrFactory:()=>xhr}),/超时/);
});
test('pending large original is local only; lightweight completed proxy can sync',()=>{
  const groups=W.mediaGroups({video:{localId:'original.mp4',kind:'video',localOnly:true,preparationId:'id'},proxy:{localId:'proxy.mp4',kind:'video',originalLocalId:'original.mp4'}});
  assert.deepEqual([...groups.keys()],['proxy.mp4']);
});
