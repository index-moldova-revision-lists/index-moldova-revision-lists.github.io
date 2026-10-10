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
    /* Deux reponses identiques : la carte descend dans « deja repondu », pour
       que les visiteurs aillent d'abord vers ce que personne n'a regarde
       (Monica, 2026-10-10). Elle reste lisible, et on peut encore y repondre. */
    var bas = document.getElementById("deja-repondu"), faites = {};
    rows.forEach(function (r) { if (r.n >= 2 && COMPTES[r.question]) faites[r.question] = 1; });
    Object.keys(faites).forEach(function (id) {
      var carte = document.getElementById("q-" + id);
      if (carte && bas) { bas.appendChild(carte); bas.hidden = false; }
    });
  });

  /* ---- envoyer une liste entiere (lot 24) : un texte colle, un fichier, ou
     les deux. Le fichier part dans le stockage prive « envois » sous un nom
     tire au hasard ; la table `envois` garde le texte, le chemin et le nom
     d'origine. Le visiteur ne peut rien relire. ---- */
  var TYPES = {
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    odt: "application/vnd.oasis.opendocument.text",
    pdf: "application/pdf", csv: "text/csv", txt: "text/plain"
  };
  var fEnvoi = document.getElementById("envoi");
  if (fEnvoi) {
    fEnvoi.hidden = false;
    var zTexte = document.getElementById("envoi-texte"), zFichier = document.getElementById("envoi-fichier");
    var zMsg = document.getElementById("envoi-msg"), bEnvoi = fEnvoi.querySelector("button");
    var dit = function (texte, erreur) { zMsg.className = "q-msg" + (erreur ? " erreur" : ""); zMsg.textContent = texte; };
    fEnvoi.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var texte = zTexte.value.trim(), fichier = zFichier.files && zFichier.files[0];
      if (!texte && !fichier) { dit(T.d_vide, true); return; }
      var corps = { langue: LANGUE }, depot = Promise.resolve();
      if (texte) corps.texte = texte.slice(0, 20000);
      if (fichier) {
        var ext = (fichier.name.split(".").pop() || "").toLowerCase();
        if (!TYPES[ext]) { dit(T.d_type, true); return; }
        if (fichier.size > 5242880) { dit(T.d_trop, true); return; }
        var hasard = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
          : String(Date.now()) + "-" + Math.random().toString(36).slice(2);
        corps.fichier = new Date().toISOString().slice(0, 10) + "/" + hasard + "." + ext;
        corps.nom = fichier.name.slice(0, 200);
        depot = fetch(SB.url + "/storage/v1/object/envois/" + corps.fichier, {
          method: "POST", headers: { apikey: SB.cle, "Content-Type": TYPES[ext] }, body: fichier
        }).then(function (r) { if (!r.ok) throw new Error(r.status); });
      }
      bEnvoi.disabled = true;
      dit("");
      depot.then(function () { return envoie("envois", corps); }).then(function () {
        fEnvoi.reset();
        bEnvoi.disabled = false;
        dit(T.d_merci);
        compte("aide/envoi/" + (fichier ? "fichier" : "texte"), "envoi");
      }).catch(function () { bEnvoi.disabled = false; dit(T.erreur, true); });
    });
  }

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
  /* ---- les dossiers sans village place : le lien d'une ligne (comme le lot 22) ---- */
  Array.prototype.forEach.call(document.querySelectorAll("ul.aide-lignes > li"), function (li) {
    var cle = li.dataset.d + "|" + li.dataset.v + "|" + li.dataset.f;
    LIGNES[cle] = li;
    var b = el("button", "lien film-q", T.contribQ);
    b.type = "button";
    li.appendChild(document.createTextNode(" "));
    li.appendChild(b);
    b.addEventListener("click", function () {
      if (li.querySelector("form")) return;
      var f = el("form", "q-form"), champ = el("input"), img = el("input", "petit"), msg = el("span", "q-msg");
      champ.type = "url";
      champ.maxLength = 400;
      champ.placeholder = T.contribPh;
      img.type = "text";
      img.inputMode = "numeric";
      img.maxLength = 5;
      img.placeholder = T.contribImage;
      var ok = el("button", "", T.envoyer);
      ok.type = "submit";
      var non = el("button", "lien", T.annuler);
      non.type = "button";
      non.addEventListener("click", function () { f.remove(); });
      [champ, img, ok, non, msg].forEach(function (x) { f.appendChild(x); });
      f.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var url = champ.value.trim();
        msg.className = "q-msg erreur";
        if (!RE_ARK.test(url)) { msg.textContent = T.invalide; return; }
        ok.disabled = true;
        var corps = { dosar: li.dataset.d, village: li.dataset.v, feuillet: li.dataset.f, langue: LANGUE, lien: url };
        var n = parseInt(img.value, 10);
        if (n >= 1 && n <= 20000) corps.image = n;
        envoie("propositions", corps)
          .then(function () {
            f.remove();
            montreLien(li, url);
            li.appendChild(el("span", "q-msg", " " + T.merciLien));
            compte("aide/ligne/" + li.dataset.d + "/f" + li.dataset.f, li.dataset.v);
          })
          .catch(function () { ok.disabled = false; msg.textContent = T.erreur; });
      });
      li.appendChild(f);
      champ.focus();
    });
  });

  lit("lignes_proposees?select=dosar,village,feuillet,lien&order=recu_le.desc&limit=5000").then(function (rows) {
    var vus = {};
    rows.forEach(function (r) {
      var cle = r.village === "*" ? r.dosar : r.dosar + "|" + r.village + "|" + (r.feuillet || "");
      var li = LIGNES[cle];
      if (!li) return;
      if (li.parentNode.className === "aide-lignes") {
        var det = li.closest("details"), s = det && det.querySelector("summary");
        if (s && !s.querySelector(".a-propose")) s.appendChild(el("span", "a-propose", " · " + T.propose));
      }
      r = { dosar: cle, lien: r.lien };
      vus[r.dosar] = (vus[r.dosar] || 0) + 1;
      if (vus[r.dosar] <= 3) montreLien(li, r.lien);
    });
  });
})();
