// Shared utilities for Dog Breed Reveal
var App = App || {};

// Escape HTML
App.esc = function(s) {
  var d = document.createElement("div");
  d.textContent = String(s);
  return d.innerHTML;
};

// Fetch helper with auth
App.headers = function() {
  var token = localStorage.getItem("token");
  return { "Content-Type": "application/json", "Authorization": "Bearer " + token };
};

// Slug from URL
App.slug = function() {
  return (window.location.pathname.split("/p/")[1] || "").split("/")[0];
};

// API path for party
App.api = function(path) {
  return "/api/parties/" + App.slug() + (path || "");
};

// Breeds
App.BREEDS = [
  "Affenpinscher","Afghan Hound","Airedale Terrier","Akita",
  "Alaskan Malamute","American Bulldog","American Cocker Spaniel",
  "Australian Cattle Dog","Australian Shepherd","Basenji","Basset Hound",
  "Beagle","Bearded Collie","Belgian Malinois","Bernese Mountain Dog",
  "Bichon Frise","Bloodhound","Border Collie","Boston Terrier",
  "Boxer","Brittany","Bulldog","Bullmastiff","Cairn Terrier",
  "Cane Corso","Cavalier King Charles Spaniel","Chihuahua",
  "Chinese Crested","Chow Chow","Cocker Spaniel","Collie",
  "Corgi (Pembroke Welsh)","Corgi (Cardigan Welsh)","Dachshund",
  "Dalmatian","Doberman Pinscher","English Bulldog",
  "English Springer Spaniel","French Bulldog","German Shepherd",
  "German Shorthaired Pointer","Golden Retriever","Gordon Setter",
  "Great Dane","Great Pyrenees","Greyhound","Havanese",
  "Irish Setter","Irish Wolfhound","Italian Greyhound",
  "Jack Russell Terrier","Japanese Chin","Keeshond",
  "Labrador Retriever","Leonberger","Lhasa Apso","Maltese",
  "Mastiff","Miniature Pinscher","Miniature Schnauzer",
  "Newfoundland","Norfolk Terrier","Norwegian Elkhound",
  "Old English Sheepdog","Papillon","Pekingese","Pit Bull Terrier",
  "Pointer","Pomeranian","Poodle","Portuguese Water Dog","Pug",
  "Rhodesian Ridgeback","Rottweiler","Saint Bernard","Saluki",
  "Samoyed","Schipperke","Scottish Terrier","Shar-Pei",
  "Shetland Sheepdog","Shiba Inu","Shih Tzu","Siberian Husky",
  "Silky Terrier","Staffordshire Bull Terrier","Vizsla",
  "Weimaraner","Welsh Springer Spaniel","Welsh Terrier",
  "West Highland White Terrier","Whippet","Wire Fox Terrier",
  "Yorkshire Terrier","Mixed Breed / Mutt","Other"
];

// SVG icon library
App.Icons = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
  lightning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  qrcode: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
  arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5m7-7l-7 7 7 7"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
};

// Create a breed select dropdown
App.createBreedSelect = function(selected) {
  var s = document.createElement("select");
  s.className = "form-group";
  var h = '<option value="">-- Pick --</option>';
  for (var i = 0; i < App.BREEDS.length; i++) {
    h += '<option value="' + App.BREEDS[i] + '"' + (App.BREEDS[i] === selected ? ' selected' : '') + '>' + App.BREEDS[i] + '</option>';
  }
  s.innerHTML = h;
  return s;
};

// Create a breed row (select + percentage input + optional remove)
App.createBreedRow = function(index, breed, pct, onRemove) {
  var d = document.createElement("div");
  d.className = "breed-row";

  var sw = document.createElement("div");
  sw.className = "form-group select-col";
  sw.style.marginBottom = "0";
  sw.appendChild(App.createBreedSelect(breed || ""));
  d.appendChild(sw);

  var pw = document.createElement("div");
  pw.className = "form-group pct-col";
  pw.style.marginBottom = "0";
  var inp = document.createElement("input");
  inp.type = "number"; inp.className = "pct-input";
  inp.value = pct || 0; inp.min = 0; inp.max = 100; inp.placeholder = "%";
  pw.appendChild(inp);
  d.appendChild(pw);

  if (index > 0 && onRemove) {
    var rm = document.createElement("button");
    rm.className = "rm-btn";
    rm.innerHTML = App.Icons.plus.replace('stroke-width="2"','stroke-width="3"').replace(/line/g,'g').replace(/x1="12" y1="5" x2="12" y2="19"/,'x1="6" y1="6" x2="18" y2="18"').replace(/x1="5" y1="12" x2="19" y2="12"/,'');
    // Actually simpler: just use ×
    rm.textContent = "×";
    rm.onclick = onRemove;
    d.appendChild(rm);
  } else {
    var sp = document.createElement("span");
    sp.style.cssText = "width:28px;flex-shrink:0;";
    d.appendChild(sp);
  }

  return { el: d, select: sw.querySelector("select"), input: inp };
};

// Collect breeds from a dog block container
App.collectBreeds = function(block) {
  var rows = block.querySelectorAll(".breed-row");
  var result = [];
  for (var i = 0; i < rows.length; i++) {
    var s = rows[i].querySelector("select");
    var p = rows[i].querySelector(".pct-input");
    if (s && s.value) result.push({ breed: s.value, percentage: parseInt(p.value) || 0 });
  }
  return result;
};

// Auto-distribute percentages evenly
App.autoDistribute = function(block) {
  var rows = block.querySelectorAll(".breed-row");
  var sel = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].querySelector("select").value) sel.push(i);
  }
  if (!sel.length) return;
  var each = Math.floor(100 / sel.length);
  var rem = 100 - each * sel.length;
  for (var i = 0; i < sel.length; i++) {
    rows[sel[i]].querySelector(".pct-input").value = each + (i === 0 ? rem : 0);
  }
};

// Update percentage bars
App.updatePercentages = function() {
  var blocks = document.querySelectorAll(".dog-section");
  for (var i = 0; i < blocks.length; i++) {
    var data = App.collectBreeds(blocks[i]);
    var total = 0;
    for (var j = 0; j < data.length; j++) total += data[j].percentage;
    var bar = blocks[i].querySelector(".pct-bar-fill");
    var tv = blocks[i].querySelector(".pct-value");
    if (tv) tv.textContent = total + "%";
    if (bar) {
      bar.style.width = Math.min(total, 100) + "%";
      var good = Math.abs(total - 100) < 1;
      bar.className = "pct-bar-fill " + (good ? "good" : "bad");
    }
  }
};

// Create a dog block for admin page
App.createDogBlock = function(dog, index, existing) {
  var block = document.createElement("div");
  block.className = "dog-section";
  block.dataset.index = index;

  var name = (existing && existing.name) || dog.name || ("Dog " + (index + 1));
  block.innerHTML = '<h4>🐶 ' + App.esc(name) + '</h4>';

  var breeds = (existing && existing.breeds) || [];
  if (breeds.length) {
    for (var j = 0; j < breeds.length; j++) {
      var row = App.createBreedRow(j, breeds[j].breed, breeds[j].percentage, function() {
        this.parentNode.remove();
        App.updatePercentages();
      });
      block.appendChild(row.el);
      row.select.onchange = function() {
        if (block.querySelectorAll(".breed-row").length === 1) App.autoDistribute(block);
        App.updatePercentages();
      };
      row.input.oninput = App.updatePercentages;
    }
  }
  if (block.querySelectorAll(".breed-row").length === 0) {
    var fr = App.createBreedRow(0);
    block.appendChild(fr.el);
    fr.select.onchange = function() { App.updatePercentages(); };
    fr.input.oninput = App.updatePercentages;
  }

  // Percentage bar
  block.innerHTML += '<div class="pct-bar-wrap"><span>Total:</span><span class="pct-value">0%</span><div class="pct-bar-bg"><div class="pct-bar-fill" style="width:0%"></div></div></div>';

  // Photo section
  var ps = document.createElement("div");
  ps.className = "photo-section";
  ps.innerHTML = '<label class="photo-label">' + App.Icons.image + ' Photo (optional)</label>' +
    '<div class="photo-row">' +
    '<span class="btn btn-secondary btn-file">' + App.Icons.upload + ' Upload<input type="file" class="pfile" accept="image/*"></span>' +
    '<span class="photo-sep">or</span>' +
    '<input type="text" class="url-input" placeholder="Paste image URL...">' +
    '</div>' +
    '<img class="photo-preview" src="" alt="Preview">';
  block.appendChild(ps);

  if (existing && existing.image) {
    var pv = ps.querySelector(".photo-preview");
    pv.src = existing.image;
    pv.classList.add("show");
    block.dataset.photo = existing.image;
  }

  var fi = ps.querySelector(".pfile");
  fi.onchange = function() {
    var f = fi.files[0];
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) { alert("Max 3MB"); return; }
    var r = new FileReader();
    r.onload = function() {
      block.dataset.photo = r.result;
      ps.querySelector(".photo-preview").src = r.result;
      ps.querySelector(".photo-preview").classList.add("show");
    };
    r.readAsDataURL(f);
  };

  var ui = ps.querySelector(".url-input");
  ui.oninput = function() {
    var u = ui.value.trim();
    if (u) {
      block.dataset.photo = u;
      ps.querySelector(".photo-preview").src = u;
      ps.querySelector(".photo-preview").classList.add("show");
    }
  };

  // Add breed button
  var ab = document.createElement("button");
  ab.className = "btn btn-outline mt-8";
  ab.innerHTML = App.Icons.plus + 'Add breed';
  ab.onclick = function() {
    if (block.querySelectorAll(".breed-row").length >= 4) return;
    var row = App.createBreedRow(block.querySelectorAll(".breed-row").length, null, null, function() {
      this.parentNode.remove();
      App.updatePercentages();
    });
    block.insertBefore(row.el, ab);
    ab.disabled = block.querySelectorAll(".breed-row").length >= 4;
    row.select.onchange = function() {
      if (block.querySelectorAll(".breed-row").length === 1) App.autoDistribute(block);
      App.updatePercentages();
    };
    row.input.oninput = App.updatePercentages;
    App.autoDistribute(block);
  };
  block.appendChild(ab);
  return block;
};

// Confetti
App.confetti = function(count) {
  count = count || 50;
  var colors = ["#F5A623","#FF6B6B","#4ECDC4","#FF8DA1","#7BC67E","#FFD93D"];
  for (var i = 0; i < count; i++) {
    var p = document.createElement("div");
    p.style.cssText = "position:fixed;pointer-events:none;z-index:999;border-radius:3px;animation:confettiFall 2s ease-out forwards;";
    p.style.left = Math.random() * 100 + "%";
    p.style.top = -(Math.random() * 50) + "px";
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDelay = Math.random() * 1.2 + "s";
    p.style.animationDuration = (1.5 + Math.random() * 2.5) + "s";
    p.style.width = (6 + Math.random() * 12) + "px";
    p.style.height = (6 + Math.random() * 12) + "px";
    document.body.appendChild(p);
    setTimeout(function() { p.remove(); }, 4000);
  }
};
