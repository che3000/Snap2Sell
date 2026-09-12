"""Local-only HTTP integration checks. Never targets a hosted deployment."""
import json, urllib.request, urllib.error, uuid, base64
BASE='http://localhost:5173'
def call(path,data=None,auth=True,headers=None,raw=None):
 h={'Cookie':'__sites_local_auth=1'} if auth else {}
 if data is not None:h['Content-Type']='application/json'
 h.update(headers or {})
 req=urllib.request.Request(BASE+'/api/'+path,data=raw if raw is not None else json.dumps(data).encode() if data is not None else None,headers=h)
 try:
  with urllib.request.urlopen(req) as r:return r.status,json.loads(r.read())
 except urllib.error.HTTPError as e:
  raw=e.read()
  try:body=json.loads(raw)
  except ValueError:body={'error':raw.decode()[:200]}
  return e.code,body
assert call('bootstrap',auth=False)[0]==401
assert call('settings',{'model':'gpt-4.1-mini'},headers={'Origin':'https://untrusted.test'})[0]==403
p=dict(id='test-'+str(uuid.uuid4()),name='Logitech G304',brand='Logitech',model='G304',category='滑鼠',condition='全新',attributes={},title='',description='',price=None,stock=None,shipping='',warranty='',variants='',images=[],confirmed=False,version=0,store='main')
assert call('generate',{'product':p})[0]==400
p['confirmed']=True
status,g=call('generate',{'product':p});assert status==200,(status,g)
p.update(title=g['title'],description=g['description'])
status,save=call('save',{'product':p,'generationId':g['generationId']});assert status==200,(status,save)
assert save['product']['version']==1
assert call('save',{'product':p})[0]==409
assert any(d['id']==p['id'] for d in call('bootstrap')[1]['drafts'])
assert call('save',{'product':dict(p,stock=-1)})[0]==400
assert call('save',{'product':dict(p,images=[{'id':'unknown-image','name':'x'}])})[0]==403
assert call('upload',raw=b'not a png',headers={'Content-Type':'image/png'})[0]==400
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYwAAAABJRU5ErkJggg==')
status,img=call('upload',raw=png,headers={'Content-Type':'image/png','x-file-name':'test.png'});assert status==200,(status,img)
assert call('preferences',{'scope':'store:test','patch':{'tone':'y2k'}})[0]==200
assert call('preferences?store=test&category=')['profile' if False else 1]['profile']['tone']=='y2k'
assert call('preferences?store=second&category=')[1]['profile']['tone']=='professional'
assert call('preferences',{'scope':'store:test','reset':True})[0]==200
# Disposable fake credential only; no external OpenAI call is made.
status,key=call('settings',{'key':'sk-snap2sell-test-not-a-real-key','model':'gpt-4.1-mini'});assert status==200,(status,key)
bootstrap=call('bootstrap')[1];assert bootstrap['settings']['configured'];assert 'cipher' not in json.dumps(bootstrap);assert 'sk-snap2sell' not in json.dumps(bootstrap)
assert call('settings',{'remove':True,'model':'gpt-4.1-mini'})[0]==200
print('PASS: auth, CSRF, generation gate, persistence, optimistic concurrency, input validation, image validation/upload, preference isolation/reset, encrypted settings')
status,market=call('market',{'product':p});assert status==200,(status,market)
print('PASS: live BigGo search; results='+str(len(market['items']))+', comparable summary='+str(market['summary']))
