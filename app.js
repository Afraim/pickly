// Pickly - app.js (ES module)

const fileInput = document.getElementById('fileInput');
const dropArea = document.getElementById('dropArea');
const photo = document.getElementById('photo');
const hiddenCanvas = document.getElementById('hiddenCanvas');
const magnifier = document.getElementById('magnifier');
const magnifierCanvas = document.getElementById('magnifierCanvas');
const palette = document.getElementById('palette');
const lastPick = document.getElementById('lastPick');
const clearBtn = document.getElementById('clearBtn');

let ctxHidden, ctxMag;
let imgLoaded = false;
let zoom = 8; // magnification
const magSize = 100;
let lastTouchTime = 0;
let lastTouchPos = null;

function init(){
  ctxHidden = hiddenCanvas.getContext('2d');
  ctxMag = magnifierCanvas.getContext('2d');

  fileInput.addEventListener('change', onFileInput);
  ['dragenter','dragover','dragleave','drop'].forEach(e=>{
    dropArea.addEventListener(e, preventDefaults);
  });
  dropArea.addEventListener('drop', onDrop);

  document.addEventListener('paste', onPaste);

  photo.addEventListener('mousemove', onMouseMove);
  photo.addEventListener('mouseleave', onMouseLeave);
  photo.addEventListener('click', onClickPick);
  // touch support for mobile: show magnifier while touching and pick on touchend
  photo.addEventListener('touchstart', onTouchStart, {passive:false});
  photo.addEventListener('touchmove', onTouchMove, {passive:false});
  photo.addEventListener('touchend', onTouchEnd);

  clearBtn.addEventListener('click', onClear);
}

function preventDefaults(e){e.preventDefault();e.stopPropagation();}

function onFileInput(e){
  const f = e.target.files && e.target.files[0];
  if(f) loadFile(f);
}

function onDrop(e){
  const item = e.dataTransfer.files && e.dataTransfer.files[0];
  if(item) loadFile(item);
}

function onPaste(e){
  const items = (e.clipboardData || window.clipboardData).items;
  if(!items) return;
  for(const it of items){
    if(it.type.indexOf('image')!==-1){
      const file = it.getAsFile();
      loadFile(file);
      e.preventDefault();
      return;
    }
  }
}

function loadFile(file){
  const reader = new FileReader();
  reader.onload = ev => {
    photo.src = ev.target.result;
    photo.onload = () => {
      imgLoaded = true;
      setupHiddenCanvas();
      magnifier.style.display = 'none';
    };
  };
  reader.readAsDataURL(file);
}

function setupHiddenCanvas(){
  hiddenCanvas.width = photo.naturalWidth;
  hiddenCanvas.height = photo.naturalHeight;
  ctxHidden.clearRect(0,0,hiddenCanvas.width, hiddenCanvas.height);
  ctxHidden.drawImage(photo, 0,0, hiddenCanvas.width, hiddenCanvas.height);
}

function onMouseMove(e){
  if(!imgLoaded) return;
  const rect = photo.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  // place magnifier relative to viewport but centered on cursor
  magnifier.style.position = 'fixed';
  magnifier.style.left = `${e.clientX}px`;
  magnifier.style.top = `${e.clientY}px`;
  magnifier.style.display = 'block';

  // compute mapped coords to natural image
  const naturalX = Math.round((x / rect.width) * photo.naturalWidth);
  const naturalY = Math.round((y / rect.height) * photo.naturalHeight);

  drawMagnifier(naturalX, naturalY);
}

function onMouseLeave(){
  magnifier.style.display = 'none';
}

function onTouchStart(e){
  if(!imgLoaded) return;
  // prevent page from panning while interacting with image
  e.preventDefault();
  const t = e.touches[0];
  const rect = photo.getBoundingClientRect();
  const x = t.clientX - rect.left;
  const y = t.clientY - rect.top;
  const naturalX = Math.round((x / rect.width) * photo.naturalWidth);
  const naturalY = Math.round((y / rect.height) * photo.naturalHeight);
  // place magnifier centered on touch point (fixed positioning)
  magnifier.style.position = 'fixed';
  magnifier.style.left = `${t.clientX}px`;
  magnifier.style.top = `${t.clientY}px`;
  magnifier.style.display = 'block';
  drawMagnifier(naturalX, naturalY);
  lastTouchPos = {nx: naturalX, ny: naturalY, clientX: t.clientX, clientY: t.clientY};
}

function onTouchMove(e){
  if(!imgLoaded) return;
  e.preventDefault();
  const t = e.touches[0];
  const rect = photo.getBoundingClientRect();
  const x = t.clientX - rect.left;
  const y = t.clientY - rect.top;
  const naturalX = Math.round((x / rect.width) * photo.naturalWidth);
  const naturalY = Math.round((y / rect.height) * photo.naturalHeight);
  magnifier.style.position = 'fixed';
  magnifier.style.left = `${t.clientX}px`;
  magnifier.style.top = `${t.clientY}px`;
  magnifier.style.display = 'block';
  drawMagnifier(naturalX, naturalY);
  lastTouchPos = {nx: naturalX, ny: naturalY, clientX: t.clientX, clientY: t.clientY};
}

function onTouchEnd(e){
  if(!imgLoaded) return;
  magnifier.style.display = 'none';
  // pick the last touched pixel
  if(lastTouchPos){
    try{
      const pixel = ctxHidden.getImageData(lastTouchPos.nx, lastTouchPos.ny, 1,1).data;
      const [r,g,b,a] = pixel;
      const rgba = `rgba(${r}, ${g}, ${b}, ${ (a/255).toFixed(2) })`;
      const hex = rgbToHex(r,g,b);
      const rgb = `rgb(${r}, ${g}, ${b})`;
      const hsl = rgbToHslString(r,g,b);
      const cmyk = rgbToCmykString(r,g,b);
      addColor({hex, rgb, hsl, cmyk, rgba, r,g,b});
    }catch(err){
      console.warn('Touch pick failed', err);
    }
  }
  lastTouchTime = Date.now();
  // clear lastTouchPos shorty after
  setTimeout(()=> lastTouchPos = null, 200);
}

function drawMagnifier(nx, ny){
  const sSize = magSize / zoom; // source square size
  const sx = Math.max(0, Math.min(hiddenCanvas.width - sSize, nx - sSize/2));
  const sy = Math.max(0, Math.min(hiddenCanvas.height - sSize, ny - sSize/2));

  ctxMag.clearRect(0,0,magnifierCanvas.width,magnifierCanvas.height);
  // draw from hidden canvas to magnifier canvas scaled up
  ctxMag.imageSmoothingEnabled = false;
  ctxMag.drawImage(hiddenCanvas, sx, sy, sSize, sSize, 0,0, magSize, magSize);

  // center pixel indicator
  ctxMag.strokeStyle = 'rgba(255,255,255,0.5)';
  ctxMag.lineWidth = 1;
  ctxMag.beginPath();
  ctxMag.moveTo(magSize/2 - 10, magSize/2);
  ctxMag.lineTo(magSize/2 + 10, magSize/2);
  ctxMag.moveTo(magSize/2, magSize/2 - 10);
  ctxMag.lineTo(magSize/2, magSize/2 + 10);
  ctxMag.stroke();
}

function onClickPick(e){
  if(!imgLoaded) return;
  const rect = photo.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const naturalX = Math.round((x / rect.width) * photo.naturalWidth);
  const naturalY = Math.round((y / rect.height) * photo.naturalHeight);
  const pixel = ctxHidden.getImageData(naturalX, naturalY, 1,1).data;
  const [r,g,b,a] = pixel;
  const rgba = `rgba(${r}, ${g}, ${b}, ${ (a/255).toFixed(2) })`;
  const hex = rgbToHex(r,g,b);
  const rgb = `rgb(${r}, ${g}, ${b})`;
  const hsl = rgbToHslString(r,g,b);
  const cmyk = rgbToCmykString(r,g,b);
  addColor({hex, rgb, hsl, cmyk, rgba, r,g,b});
}

function addColor(color){
  // create a color entry
  const item = document.createElement('div');
  item.className = 'color-item';

  const sw = document.createElement('div');
  sw.className = 'swatch';
  sw.style.background = color.hex;

  const codes = document.createElement('div');
  codes.className = 'codes';

  const lineHex = codeLine('HEX', color.hex);
  const lineRgb = codeLine('RGB', color.rgb);
  const lineHsl = codeLine('HSL', color.hsl);
  const lineCmyk = codeLine('CMYK', color.cmyk);

  codes.appendChild(lineHex);
  codes.appendChild(lineRgb);
  codes.appendChild(lineHsl);
  codes.appendChild(lineCmyk);

  item.appendChild(sw);
  item.appendChild(codes);

  // clicking the whole item copies the hex
  item.addEventListener('click', ()=>{
    copyText(color.hex);
    flashCopy(lineHex.querySelector('.copy-btn'));
    showLastPick(color);
  });

  palette.prepend(item);
  showLastPick(color);
}

function codeLine(label, value){
  const wrap = document.createElement('div');
  wrap.className = 'code-line';
  const lbl = document.createElement('div');
  lbl.style.width = '42px';
  lbl.style.color = 'var(--muted)';
  lbl.textContent = label;
  const code = document.createElement('div');
  code.className = 'code';
  code.textContent = value;
  const copy = document.createElement('button');
  copy.className = 'copy-btn';
  copy.textContent = 'Copy';
  copy.addEventListener('click', (ev)=>{
    ev.stopPropagation();
    copyText(value);
    flashCopy(copy);
  });
  wrap.appendChild(lbl);
  wrap.appendChild(code);
  wrap.appendChild(copy);
  return wrap;
}

function flashCopy(btn){
  if(!btn) return;
  const original = btn.textContent;
  btn.textContent = 'Copied';
  setTimeout(()=>btn.textContent = original, 900);
}

async function copyText(txt){
  try{
    await navigator.clipboard.writeText(txt);
  }catch(e){
    console.warn('Clipboard write failed', e);
  }
}

function showLastPick(c){
  lastPick.classList.remove('empty');
  lastPick.innerHTML = '';
  const sw = document.createElement('div');
  sw.className = 'small-swatch';
  sw.style.background = c.hex;
  const info = document.createElement('div');
  info.style.display = 'flex';
  info.style.flexDirection = 'column';
  info.style.gap = '6px';
  info.innerHTML = `<div style="font-weight:700">${c.hex}</div><div style="color:var(--muted);font-size:13px">${c.rgb} · ${c.hsl}</div>`;
  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn';
  copyBtn.textContent = 'Copy HEX';
  copyBtn.style.marginLeft = 'auto';
  copyBtn.addEventListener('click', ()=>{ copyText(c.hex); flashCopy(copyBtn); });

  lastPick.appendChild(sw);
  lastPick.appendChild(info);
  lastPick.appendChild(copyBtn);
}

function onClear(){
  photo.src = '';
  ctxHidden && ctxHidden.clearRect(0,0,hiddenCanvas.width,hiddenCanvas.height);
  palette.innerHTML = '';
  lastPick.innerHTML = 'No color picked yet';
  lastPick.classList.add('empty');
  imgLoaded = false;
}

// --- color helpers ---
function componentToHex(c){
  const hex = c.toString(16).padStart(2,'0');
  return `#${hex}`; // not used directly
}
function rgbToHex(r,g,b){
  return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
}

function rgbToHslString(r,g,b){
  r/=255;g/=255;b/=255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h,s,l = (max+min)/2;
  if(max===min){h=s=0;}else{
    const d = max-min;
    s = l>0.5? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h = (g-b)/d + (g<b?6:0); break;
      case g: h = (b-r)/d + 2; break;
      case b: h = (r-g)/d + 4; break;
    }
    h /= 6;
  }
  h = Math.round(h*360);
  s = Math.round(s*100);
  l = Math.round(l*100);
  return `hsl(${h}°, ${s}%, ${l}%)`;
}

function rgbToCmykString(r,g,b){
  const rn = r/255, gn = g/255, bn = b/255;
  const k = 1 - Math.max(rn,gn,bn);
  if(k === 1) return 'cmyk(0, 0, 0, 100)';
  const c = Math.round(((1-rn-k)/(1-k))*100);
  const m = Math.round(((1-gn-k)/(1-k))*100);
  const y = Math.round(((1-bn-k)/(1-k))*100);
  const kk = Math.round(k*100);
  return `cmyk(${c}%, ${m}%, ${y}%, ${kk}%)`;
}

// init once DOM is ready
window.addEventListener('DOMContentLoaded', init);

// helpful: allow clicking the drop hint to open file dialog
document.querySelector('.drop-hint').addEventListener('click', ()=>fileInput.click());

// expose helpers for testing
export {rgbToHex, rgbToHslString, rgbToCmykString};
