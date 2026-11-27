const $=id=>document.getElementById(id);
async function call(url,options={}){const r=await fetch(url,{cache:'no-store',credentials:'same-origin',...options});const d=await r.json();if(!r.ok)throw Error(d.error||'server_error');return d;}
const post=(url,body)=>call(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
async function init(){
  $('month').value=new Date().toISOString().slice(0,7);
  try {
    const s=await call('/api/status');
    $('state').textContent=!s.configured?'Ожидает настройки':!s.unlocked?'Защищён':s.connected?'FatSecret подключён':'Готов к подключению';
    $('message').textContent=!s.configured?'Не настроены серверные переменные. Ключи API вводятся только в защищённых настройках Vercel.':!s.unlocked?'Для доступа требуется код владельца пилота.':s.connected?'Можно получить дневные итоги за месяц. Это чтение без сохранения.':'Нажми «Разрешить доступ» и пройди авторизацию на сайте FatSecret.';
    $('unlock').hidden=!s.configured||s.unlocked;
    $('connect').hidden=!s.configured||!s.unlocked||s.connected;
    $('reader').hidden=!s.configured||!s.connected;
  }catch(e){$('state').textContent='Ошибка соединения';$('message').textContent='Тестовый сервер недоступен.';}
}
$('unlockForm').addEventListener('submit',async e=>{
  e.preventDefault();$('message').textContent='Проверяем код…';
  try{await post('/api/unlock',{code:new FormData(e.target).get('code')});e.target.reset();await init();}
  catch{$('message').textContent='Код не принят.';}
});
$('load').addEventListener('click',async()=>{
  $('readStatus').textContent='Читаем из FatSecret…';$('results').replaceChildren();
  try{
    const d=await call('/api/month?month='+encodeURIComponent($('month').value));
    $('readStatus').textContent='Получено дней: '+d.count+'. Ничего не записано в Activity Balance.';
    const table=document.createElement('table');
    const header=table.insertRow();['Дата','Ккал','Белки','Жиры','Углеводы'].forEach(v=>{const th=document.createElement('th');th.textContent=v;header.append(th)});
    for(const x of d.days){const tr=table.insertRow();[x.date,x.kcal,x.protein,x.fat,x.carbs].forEach(v=>{const td=tr.insertCell();td.textContent=v==null?'—':String(v)})}
    $('results').append(table);
  }catch(e){$('readStatus').textContent='Не удалось получить данные: '+e.message+'. Доступ Free Edition к личному дневнику пока не подтверждён.';}
});
$('clear').addEventListener('click',async()=>{try{await post('/api/clear',{})}catch{}$('results').replaceChildren();await init()});
init();