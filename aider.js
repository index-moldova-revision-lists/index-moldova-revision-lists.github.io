/* La page « Aider » (lot 23, 2026-10-10). Tout le contenu est deja dans le
   HTML (genere_site.py) ; ce script n'ajoute que ce qui demande Supabase :
   les boutons de reponse aux lectures a trancher, avec le compte des reponses
   deja donnees (vue `reponses_comptes`), et le champ « lien du film » des
   dossiers sans film (table `propositions`, village « * » = dossier entier).
   Supabase absent ou en panne : la page se lit quand meme, sans boutons. */
(function () {
  "use strict";
  var SB = window.CONTRIB, T = window.TEXTES_AIDE || {};
  if (!SB || !window.fetch) return;
  var LANGUE = document.documentElement.lang || "en";
  var RE_ARK = /^https:\/\/(www\.)?familysearch\.org\/.*ark:\/61903\/3:[12]:[A-Za-z0-9-]+/;

  function el(tag, cls, texte) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texte) e.textContent = texte;
    return e;
  }
  function envoie(table, corps) {
    return fetch(SB.url + "/rest/v1/" + table, {
      method: "POST",
      headers: { apikey: SB.cle, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(corps)
    }).then(function (r) { if (!r.ok) throw new Error(r.status); });
  }
  function lit(vue) {
    return fetch(SB.url + "/rest/v1/" + vue, { headers: { apikey: SB.cle } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; });
  }
  function compte(chemin, titre) {
    if (window.goatcounter && window.goatcounter.count) {
      window.goatcounter.count({ path: chemin, title: titre, event: true });
    }
  }
  function garde(cle, v) { try { localStorage.setItem(cle, v); } catch (e) { /* sans stockage */ } }
  function relit(cle) { try { return localStorage.getItem(cle); } catch (e) { return null; } }

  /* ---- les lectures a trancher ---- */
  var COMPTES = {};     /* id de question -> { choix -> span du compte } */
  Array.prototype.forEach.call(document.querySelectorAll(".question"), function (carte) {
    var id = carte.dataset.id, choix = JSON.parse(carte.dataset.choix);
    var zone = carte.querySelector(".q-rep"), cle = "rep|" + id;
    var msg = el("p", "q-msg");
    COMPTES[id] = {};
    function fini(code) {
      Array.prototype.forEach.call(zone.querySelectorAll("button.q-choix"), function (b) {
        b.disabled = true;
        if (b.dataset.code === code) b.classList.add("choisi");
      });
      var f = zone.querySelector("form");
      if (f) f.remove();
    }
    function repond(code, note) {
      var corps = { question: id, choix: code, langue: LANGUE };
      if (note) corps.note = note.slice(0, 300);
      msg.className = "q-msg";
      msg.textContent = "";
      envoie("reponses", corps).then(function () {
        garde(cle, code);
        fini(code);
        var c = COMPTES[id][code];
        c.textContent = String((parseInt(c.textContent, 10) || 0) + 1);
        msg.textContent = T.merci;
        compte("aide/reponse/" + id + "/" + code, id);
      }).catch(function () {
        msg.className = "q-msg erreur";
        msg.textContent = T.erreur;
      });
    }
    choix.forEach(function (c) {
      var b = el("button", "q-choix", c[1]);
      b.type = "button";
      b.dataset.code = c[0];
      var n = el("span", "q-n");
      n.title = T.comptes || "";
      COMPTES[id][c[0]] = n;
      b.appendChild(n);
      b.addEventListener("click", function () {
        if (c[0] !== "autre") { repond(c[0]); return; }
        if (zone.querySelector("form")) return;
        var f = el("form", "q-form"), champ = el("input");
        champ.type = "text";
        champ.maxLength = 300;
        champ.placeholder = T.notePh;
        var ok = el("button", "", T.envoyer);
        ok.type = "submit";
        f.appendChild(champ);
        f.appendChild(ok);
        f.addEventListener("submit", function (ev) { ev.preventDefault(); repond("autre", champ.value.trim()); });
        zone.appendChild(f);
        champ.focus();
      });
      zone.appendChild(b);
    });
    carte.appendChild(msg);
    var deja = relit(cle);
    if (deja) fini(deja);
  });
  lit("reponses_comptes?select=question,choix,n").then(function (rows) {
    rows.forEach(function (r) {
      var c = COMPTES[r.question] && COMPTES[r.question][r.choix];
      if (c) c.textContent = String(r.n);
    });
  });

  /* ---- les dossiers sans film : coller le lien du volume ---- */
  var LIGNES = {};
  function montreLien(li, lien) {
    var s = el("span", "film-propose");
    var a = el("a", "", "→ " + T.propose);
    a.href = lien;
    a.target = "_blank";
    a.rel = "noopener nofollow";
    s.appendChild(a);
    s.appendChild(el("i", "", " · " + T.nonVerifie));
    li.appendChild(s);
  }
  Array.prototype.forEach.call(document.querySelectorAll("li[data-dosar]"), function (li) {
    var d = li.dataset.dosar;
    LIGNES[window.PREFIXE + d] = li;
    var b = el("button", "lien film-q", T.ajouterFilm);
    b.type = "button";
    li.appendChild(document.createTextNode(" "));
    li.appendChild(b);
    b.addEventListener("click", function () {
      if (li.querySelector("form")) return;
      var f = el("form", "q-form"), champ = el("input"), msg = el("span", "q-msg");
      champ.type = "url";
      champ.maxLength = 400;
      champ.placeholder = T.phFilm;
      var ok = el("button", "", T.envoyer);
      ok.type = "submit";
      var non = el("button", "lien", T.annuler);
      non.type = "button";
      non.addEventListener("click", function () { f.remove(); });
      f.appendChild(champ);
      f.appendChild(ok);
      f.appendChild(non);
      f.appendChild(msg);
      f.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var url = champ.value.trim();
        msg.className = "q-msg erreur";
        if (!RE_ARK.test(url)) { msg.textContent = T.invalide; return; }
        ok.disabled = true;
        envoie("propositions", { dosar: window.PREFIXE + d, village: "*", langue: LANGUE, lien: url })
          .then(function () {
            f.remove();
            montreLien(li, url);
            li.appendChild(el("span", "q-msg", " " + T.merciLien));
            compte("aide/film/" + d, d);
          })
          .catch(function () { ok.disabled = false; msg.textContent = T.erreur; });
      });
      li.appendChild(f);
      champ.focus();
    });
  });
  lit("lignes_proposees?select=dosar,village,lien&village=eq.%2A&order=recu_le.desc&limit=1000").then(function (rows) {
    var vus = {};
    rows.forEach(function (r) {
      var li = LIGNES[r.dosar];
      if (!li || r.village !== "*") return;
      vus[r.dosar] = (vus[r.dosar] || 0) + 1;
      if (vus[r.dosar] <= 3) montreLien(li, r.lien);
    });
  });
})();
