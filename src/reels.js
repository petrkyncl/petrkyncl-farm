// Slot-machine digits. Every digit is a vertical reel of 0–9 repeated a few times.
// reveal(): the reels spin several turns and land left to right.
// set(): later changes roll only the digits that changed, always forward, like an odometer.
const CYCLES = 5;

export function reel(el){
  el.textContent = '';
  el.classList.add('reel');
  let cells = [];

  function build(str){
    el.textContent = ''; cells = [];
    for (const ch of str){
      if (/\d/.test(ch)){
        const d = document.createElement('span'); d.className = 'd';
        const s = document.createElement('span'); s.className = 's';
        s.textContent = '0123456789'.repeat(CYCLES).split('').join('\n');
        d.appendChild(s); el.appendChild(d);
        cells.push({s, idx: +ch + 10, digit: true});
        s.style.transform = `translateY(${-(+ch + 10)}em)`;
      } else {
        const t = document.createElement('span'); t.className = 'c'; t.textContent = ch; el.appendChild(t);
        cells.push({digit: false, ch});
      }
    }
    el.setAttribute('aria-label', str);
  }

  function move(c, idx, dur, delay = 0){
    c.idx = idx;
    c.s.style.transition = `transform ${dur}s cubic-bezier(.16,.84,.24,1) ${delay}s`;
    c.s.style.transform = `translateY(${-idx}em)`;
    clearTimeout(c.t);
    // settle back into the second cycle so the strip never runs out
    c.t = setTimeout(() => { c.s.style.transition = 'none'; c.idx = c.idx % 10 + 10; c.s.style.transform = `translateY(${-c.idx}em)`; }, (dur + delay)*1000 + 40);
  }

  function shape(str){ return cells.length === str.length && cells.every((c, i) => c.digit === /\d/.test(str[i])); }

  return {
    reveal(str){
      build(str);
      cells.forEach((c, i) => {
        if (!c.digit) return;
        c.s.style.transition = 'none'; c.s.style.transform = `translateY(${-(Math.floor(Math.random()*10))}em)`;
        void c.s.offsetHeight;
        move(c, 30 + +str[i], 1.1 + i*.13);
      });
    },
    set(str){
      if (!shape(str)){ build(str); return; }
      cells.forEach((c, i) => {
        if (!c.digit) return;
        const want = +str[i], cur = c.idx % 10;
        if (want !== cur) move(c, c.idx + ((want - cur + 10) % 10), .45);
      });
      el.setAttribute('aria-label', str);
    }
  };
}
