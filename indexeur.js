/* Recherche dans l'index, entierement dans le navigateur.
   Aucune requete serveur : donnees.json est charge une fois, puis tout se fait
   en memoire. C'est ce qui permet d'heberger le site sur GitHub Pages.

   Le resultat d'une recherche est L'INVENTAIRE LUI-MEME, reduit aux dossiers
   qui contiennent la ligne cherchee, dans l'ordre de l'inventaire : chaque
   dossier est une carte qui reproduit ses lignes telles qu'ecrites (volume,
   prefixe, nom, judet, feuillets) et met les liens en face (REFONTE_SITE.md,
   § A2). La ligne qui a repondu est surlignee, au milieu d'une fenetre de
   8 lignes contigues (le reste du dossier est replie avant et apres), parce
   que ce sont les voisines qui disent au visiteur si c'est bien SON village.

   La recherche (lot 2, § A1, A3, A4) : suggestions par graphie d'inventaire
   en tapant, pliage tolerant identique a genere_donnees.py (cyrillique
   compris), table « aussi ecrit » jamais appliquee en silence, puces
   d'annees, etat dans l'URL, « vouliez-vous dire » a zero resultat. */
(function () {
  "use strict";
  /* Le prefixe commun des liens FamilySearch : donnees.json ne porte que la
     partie variable, pour ne pas repeter 600 fois la meme chaine. */
  var FS = "https://www.familysearch.org/ark:/61903/";
  /* La recherche du catalogue FamilySearch par numero de bobine (DGS), pour
     les dossiers pas encore relies (lot 5 ; l'adresse repond 200 le
     2026-09-09, apres une redirection vers /en/). */
  var CATALOGUE = "https://www.familysearch.org/search/catalog/results?count=20&query=%2Bfilmnumber%3A";
  /* Les images d'une bobine, par son numero DGS : ouvre directement la
     visionneuse sur ce groupe d'images (compte FamilySearch gratuit requis,
     comme pour toutes les images de ce fonds). */
  var BOBINE = "https://www.familysearch.org/records/images/search-results?imageGroupNumbers=";
  var VISIBLES = 8;                     /* lignes montrees avant repli */
  var MAX_SUGG = 12, MAX_RES = 300, MAX_PROCHES = 5;
  var EXEMPLES = ["Tomai", "Beşghioz", "Copăceni", "Hotin"];
  /* Les annees des catagrafii, regroupees comme dans le tableau « les
     recensements disponibles » (genere_site.py, GROUPES, qui les ecrit dans
     la page) : un dossier va dans le groupe de son annee de DEBUT. */
  var GROUPES = window.GROUPES || [[1834, 1836], [1848, 1851], [1854, 1857], [1858, 1859]];
  var D = null, LF = null, T = window.TEXTES || {};
  var LANG = document.documentElement.lang || "en";
  var G = [];        /* les graphies d'inventaire : {nom, fold, fam, pre, dos, juds, a1, a2} */
  var NOMS = [];     /* pour « vouliez-vous dire » : {fold, nom} (noms entiers et mots) */
  var DOS_DE = [];   /* ligne k -> indice du dossier */
  var NB_VILLAGES = 0;   /* graphies distinctes (lig.nom), lot 8 : le meme
                             compte que genere_donnees.py imprime, pour que
                             la page et la console disent le meme nombre */
  var S = { q: "", an: "", nom: null, fam: null, famPre: "" };   /* l'etat de la recherche */
  var actif = -1;    /* la suggestion en surbrillance (clavier) */
  var SUGG = [];     /* les suggestions affichees */

  function $(id) { return document.getElementById(id); }

  /* ------------------------------------------------------------ pliage
     LE MEME ALGORITHME QUE plie() DANS genere_donnees.py : toute modification
     ici se reporte la-bas, et se verifie avec `genere_donnees.py --test-plie`
     contre la meme liste passee ici. */
  var CYR = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "io", "ж": "j",
    "з": "z", "и": "i", "й": "i", "к": "c", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "t",
    "ч": "c", "ш": "s", "щ": "st", "ъ": "", "ы": "i", "ь": "", "э": "a", "ю": "iu",
    "я": "ia", "і": "i", "ї": "i", "є": "ie", "ґ": "g", "ӂ": "j"
  };
  function estLettre(c) { return !!c && c.toLowerCase() !== c.toUpperCase(); }

  /* Cyrillique -> latin dans l'orthographe roumaine (э = ă sauf en tete de
     mot, ь final = i, к/г devant е/и = ch/gh) ; le reste passe tel quel. */
  function translit(s) {
    var out = "", n = s.length;
    for (var i = 0; i < n; i++) {
      var lo = s.charAt(i).toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(CYR, lo)) { out += s.charAt(i); continue; }
      var nx = i + 1 < n ? s.charAt(i + 1).toLowerCase() : "";
      var pv = i ? s.charAt(i - 1).toLowerCase() : "";
      var r = CYR[lo];
      if (lo === "к") r = (nx === "е" || nx === "и") ? "ch" : "c";
      else if (lo === "г") r = (nx === "е" || nx === "и") ? "gh" : "g";
      else if (lo === "э") r = estLettre(pv) ? "a" : "e";
      else if (lo === "ь") r = estLettre(nx) ? "" : "i";
      out += r;
    }
    return out;
  }

  var PAIRES = [["tz", "t"], ["ph", "f"], ["gh", "g"], ["k", "c"], ["w", "v"], ["y", "i"]];
  function plie(s) {
    s = translit(s || "").toLowerCase().normalize("NFD")
      .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
    for (var i = 0; i < PAIRES.length; i++) s = s.split(PAIRES[i][0]).join(PAIRES[i][1]);
    return s.replace(/(.)\1+/g, "$1");
  }
  window.plieIndexeur = plie;   /* expose pour le test de concordance avec Python */

  function nombre(n) {
    try { return Number(n).toLocaleString(LANG); } catch (e) { return String(n); }
  }

  /* L'accord du pluriel (lot 5) : une cle de TEXTES dont la valeur est un
     tableau de formes est un mot a accorder sur {n}. Trois formes en russe
     (1 строка, 2-4 строки, 5+ строк, et 11-14 prennent la troisieme) ;
     deux formes suffiraient ailleurs, mais aucun libelle n'en a besoin. */
  function pluriel(n, formes) {
    n = Math.abs(Math.floor(Number(n) || 0));
    var u = n % 10, d = n % 100;
    if (formes.length < 3) return formes[n === 1 ? 0 : 1];
    if (u === 1 && d !== 11) return formes[0];
    if (u >= 2 && u <= 4 && (d < 12 || d > 14)) return formes[1];
    return formes[2];
  }

  /* {n} : un compte se formate selon la langue, un identifiant (DGS) non ;
     {strok} et tout autre {mot} dont TEXTES porte les formes s'accorde sur n */
  function t(cle, n) {
    var s = (T[cle] || cle).replace("{n}", n === undefined ? "" : (typeof n === "number" ? nombre(n) : String(n)));
    return s.replace(/\{(\w+)\}/g, function (m, k) {
      return Array.isArray(T[k]) ? pluriel(n, T[k]) : m;
    });
  }
  function fmt(cle, vals) {
    return (T[cle] || cle).replace(/\{(\w+)\}/g, function (m, k) {
      return k in vals ? (typeof vals[k] === "number" ? nombre(vals[k]) : String(vals[k])) : m;
    });
  }
  /* les plages d'images s'ecrivent avec un trait d'union, comme les feuillets */
  function plageAff(s) { return String(s || "").replace(/–/g, "-"); }

  function el(tag, cls, texte) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texte !== undefined && texte !== null) e.textContent = texte;
    return e;
  }

  function bouton(cls, texte, action) {
    var b = el("button", cls, texte);
    b.type = "button";
    b.addEventListener("click", action);
    return b;
  }

  function tinutDe(k) { return D.tinuturi[D.lig.tinut[k]] || ""; }

  /* Le judet que porte le TITRE du dossier (« judeţul Cahul », « judeţului
     Leova »), pour situer une graphie quand sa ligne n'a pas de judet.
     Contexte d'affichage seulement, jamais un critere de recherche. */
  var R_JUD = /jude[ţț]ul(?:ui)?\s+([A-ZĂÂÎŞȘŢȚ][^\s,;.]*)/;
  function judTitre(i) {
    var m = R_JUD.exec(D.col.titre[i] || "");
    return m ? m[1] : "";
  }

  /* Page russe (§ C5, lot 3) : les judete s'affichent en cyrillique quand
     TEXTES.tinutRu existe. Fonction d'AFFICHAGE seulement : la comparaison
     (tinutDe, la reference a copier) garde la chaine
     de l'inventaire, pour que la recherche et les liens soient les memes
     dans les quatre langues. Chaque morceau separe par « · » est traduit ;
     le suffixe « pentru anul N » reste tel quel ; un adjectif d'uezd seul
     recoit « уезд », plusieurs recoivent « уезды » apres le dernier. */
  function tinutAff(s) {
    var R = T.tinutRu;
    if (!s || !R) return s || "";
    var out = [], adj = [];
    s.split("·").forEach(function (m) {
      m = m.replace(/\s+/g, " ").replace(/^ | $/g, "");
      if (!m) return;
      var mm = /^(.*?)( pentru anul \d+)$/.exec(m);
      var base = mm ? mm[1] : m, suf = mm ? mm[2] : "", r = R[base];
      if (r === undefined) { out.push(m); return; }
      if (/ский$/.test(r)) {
        if (suf) { out.push(r + " " + R._uezd + suf); return; }
        adj.push(out.length);
      }
      out.push(r);
    });
    if (adj.length === 1) out[adj[0]] += " " + R._uezd;
    else if (adj.length > 1) out[adj[adj.length - 1]] += " " + R._uezdy;
    return out.join(" · ");
  }
  function estNum(q) { return /^\d{1,4}[a-z]?$/i.test(q); }

  /* Familles de prefixe (A1, recette du 2026-09-09, lot 8) : « Tomai »
     additionnait col. Tomai (colons bulgares, judeţul Bender) et s. Tomai --
     deux entites que le prefixe de l'inventaire distingue la ou le judet ne
     distingue rien (le meme village change de judet au fil des dossiers).
     Trois familles : colonie (col., colonia), sat (s., satul, moshia -- le
     domaine va avec le village, une reserve simple), autre (le reste, y
     compris le prefixe vide). Le libelle affiche : le mot canonique pour
     colonie/sat, sinon le prefixe le plus frequent du groupe (ou rien). */
  function familleDe(pre) {
    var p = (pre || "").toLowerCase();
    if (p.indexOf("col") === 0) return "colonie";
    if (p.indexOf("s") === 0 || p.indexOf("mo") === 0) return "sat";
    return "autre";
  }
  var LIB_FAMILLE = { colonie: "colonia", sat: "s." };
  function prefixeDominant(pres) {
    var meilleur = "", n = 0;
    Object.keys(pres).forEach(function (p) { if (pres[p] > n) { n = pres[p]; meilleur = p; } });
    return meilleur;
  }

  /* ------------------------------------------------------------ index
     Une entree par graphie d'inventaire distincte (le nom tel qu'ecrit, et
     lui seul), avec ses dossiers et ses annees : c'est ce que listent les
     suggestions (§ A3 : chaque graphie separement, jamais fusionnee). Le
     judet n'entre PAS dans la cle : le meme village passe de Leova a Cahul
     puis a Bender au fil des dossiers (les regions changent de nom), le
     decouper par judet donnait cinq « Tomai » identiques. Les judets
     rencontres (ligne, sinon titre du dossier) ne servent qu'au contexte. */
  function indexe() {
    var c = D.col, L = D.lig, cle = {}, folds = {}, mots = {}, vusNoms = {};
    LF = L.nom.map(plie);
    DOS_DE = new Array(L.nom.length);
    NB_VILLAGES = 0;
    for (var i = 0; i < D.n; i++) {
      var jt = judTitre(i);
      for (var k = c.l0[i]; k < c.l0[i] + c.ln[i]; k++) {
        DOS_DE[k] = i;
        if (!vusNoms[L.nom[k]]) { vusNoms[L.nom[k]] = true; NB_VILLAGES++; }
        var fam = familleDe(L.pre[k]), id = fam + "|" + L.nom[k], g = cle[id];
        if (!g) {
          g = cle[id] = { nom: L.nom[k], fold: LF[k], fam: fam, pre: "", pres: {},
                          dos: [], vu: {}, jud: {}, juds: [], a1: 0, a2: 0 };
          G.push(g);
        }
        if (L.pre[k]) g.pres[L.pre[k]] = (g.pres[L.pre[k]] || 0) + 1;
        var jud = tinutDe(k) || jt;
        if (jud) g.jud[jud] = (g.jud[jud] || 0) + 1;
        if (!g.vu[i]) {
          g.vu[i] = true;
          g.dos.push(i);
          /* les annees d'une graphie : celles ou ses dossiers COMMENCENT,
             comme les puces (« Tomai · 1835-1859 ») */
          if (c.an1[i]) {
            g.a1 = g.a1 ? Math.min(g.a1, c.an1[i]) : c.an1[i];
            g.a2 = Math.max(g.a2, c.an1[i]);
          }
        }
        if (!folds[LF[k]]) { folds[LF[k]] = true; NOMS.push({ fold: LF[k], nom: L.nom[k], entier: true }); }
        /* les mots d'un nom compose, pour rapprocher « Razesi » de « Sărata Răzeşi » */
        L.nom[k].split(/[\s\-(),]+/).forEach(function (m) {
          var f = plie(m);
          if (f.length < 3 || f === LF[k] || mots[f + "|" + L.nom[k]]) return;
          mots[f + "|" + L.nom[k]] = true;
          NOMS.push({ fold: f, nom: L.nom[k], entier: false });
        });
      }
    }
    G.forEach(function (g) {
      /* les judets par frequence, les plus vus d'abord */
      g.juds = Object.keys(g.jud).sort(function (a, b) { return g.jud[b] - g.jud[a] || a.localeCompare(b, LANG); });
      /* le prefixe affiche devant le nom (« colonia Tomai », « s. Tomai ») :
         le mot canonique de la famille, sinon le prefixe le plus frequent
         du groupe (vide si le groupe n'en a aucun) */
      g.pre = LIB_FAMILLE[g.fam] || prefixeDominant(g.pres);
    });
    G.sort(function (a, b) { return a.nom.localeCompare(b.nom, LANG); });
  }

  function anneesDe(g) {
    if (!g.a1) return "";
    return g.a1 === g.a2 ? String(g.a1) : g.a1 + "-" + g.a2;
  }

  /* ------------------------------------------------------------ suggestions */
  function suggestions(q) {
    var pq = plie(q);
    if (pq.length < 2 || estNum(q)) return [];
    var debut = [], dedans = [], tous = {}, nTous = 0, i;
    for (i = 0; i < G.length; i++) {
      var g = G[i], p = g.fold.indexOf(pq);
      if (p === -1) continue;
      (p === 0 ? debut : dedans).push({ g: g });
      g.dos.forEach(function (d) { if (!tous[d]) { tous[d] = true; nTous++; } });
    }
    /* la table « aussi ecrit » : la saisie commence comme un cote de la paire,
       l'autre cote est une graphie de l'inventaire que la saisie ne trouve
       pas d'elle-meme. Entree a part, etiquetee, jamais appliquee en silence. */
    var eq = [], vus = {};
    if (pq.length >= 3) {
      (D.equiv || []).forEach(function (paire) {
        for (var s = 0; s < 2; s++) {
          var a = paire[s], b = paire[1 - s], fa = plie(a), fb = plie(b);
          if (fa === fb || fa.indexOf(pq) !== 0 || fb.indexOf(pq) === 0) continue;
          G.forEach(function (g) {
            var id = a + "|" + g.nom;
            if (g.fold === fb && !vus[id]) { vus[id] = true; eq.push({ g: g, de: a }); }
          });
        }
      });
    }
    var liste = debut.concat(eq, dedans).slice(0, MAX_SUGG);
    if (debut.length + dedans.length > 1) liste.unshift({ tout: true, q: q, n: nTous });
    return liste;
  }

  function libelleSugg(li, s) {
    if (s.tout) {
      li.className = "tout";
      li.appendChild(el("span", "nom", t("toutesGraphies")));
      li.appendChild(el("span", "meta", "(" + nombre(s.n) + ")"));
      return;
    }
    var g = s.g, nom = el("span", "nom");
    if (s.de) {
      li.className = "equiv";
      nom.appendChild(el("span", "de", t("aussiEcrit") + " " + s.de + " → "));
    }
    /* le prefixe devant le nom (« colonia Tomai », « s. Tomai »), lot 8 :
       c'est lui qui separe les homonymes que le judet ne separe pas */
    if (g.pre) nom.appendChild(document.createTextNode(g.pre + " "));
    nom.appendChild(document.createTextNode(g.nom));
    if (LANG === "ru" && D.noms_ru && D.noms_ru[g.nom]) {
      nom.appendChild(document.createTextNode(" (" + D.noms_ru[g.nom] + ")"));
    }
    li.appendChild(nom);
    var meta = [];
    if (anneesDe(g)) meta.push(anneesDe(g));
    /* au plus trois judets, en contexte (cyrillique sur la page russe) */
    g.juds.slice(0, 3).forEach(function (j) { meta.push(tinutAff(j)); });
    li.appendChild(el("span", "meta", meta.join(" · ") + " (" + nombre(g.dos.length) + ")"));
  }

  function rendSuggestions(liste) {
    var ul = $("suggestions"), q = $("q");
    ul.textContent = "";
    SUGG = liste;
    actif = -1;
    liste.forEach(function (s, n) {
      var li = el("li");
      li.setAttribute("role", "option");
      li.id = "sugg-" + n;
      libelleSugg(li, s);
      /* mousedown : garder le focus dans le champ, pour que blur ne ferme
         pas la liste avant le clic */
      li.addEventListener("mousedown", function (e) { e.preventDefault(); });
      li.addEventListener("click", function () { choisis(s); });
      ul.appendChild(li);
    });
    ul.hidden = liste.length === 0;
    q.setAttribute("aria-expanded", liste.length ? "true" : "false");
    q.removeAttribute("aria-activedescendant");
  }

  function fermeSuggestions() { rendSuggestions([]); }

  function surligne(n) {
    var lis = $("suggestions").children;
    if (!lis.length) return;
    actif = (n + lis.length) % lis.length;
    for (var i = 0; i < lis.length; i++) {
      lis[i].className = lis[i].className.replace(/ ?actif/, "") + (i === actif ? " actif" : "");
      lis[i].setAttribute("aria-selected", i === actif ? "true" : "false");
    }
    $("q").setAttribute("aria-activedescendant", "sugg-" + actif);
    if (lis[actif].scrollIntoView) lis[actif].scrollIntoView({ block: "nearest" });
  }

  /* Choisir une suggestion : la graphie exacte, ou toutes. Le filtre
     d'annee revient a « toutes » (lot 5 : il survivait au changement de
     village sans signal). */
  function choisis(s) {
    fermeSuggestions();
    if (s.tout) {
      S.q = s.q; S.nom = null; S.fam = null; S.famPre = "";
    } else {
      S.q = s.g.nom; S.nom = s.g.nom; S.fam = s.g.fam; S.famPre = s.g.pre;
      $("q").value = s.g.nom;
    }
    S.an = "";
    lance();
  }

  /* ------------------------------------------------------------ annees */
  function idGroupe(g) { return g[0] === g[1] ? String(g[0]) : g[0] + "-" + g[1]; }

  function groupeDe(an1) {
    if (!an1) return "sans";
    for (var i = 0; i < GROUPES.length; i++) {
      if (GROUPES[i][0] <= an1 && an1 <= GROUPES[i][1]) return idGroupe(GROUPES[i]);
    }
    return "autres";
  }

  /* Ce que l'URL peut porter : l'identifiant d'une puce, ou une annee seule
     (« an=1850 » tombe dans la puce 1848-1850). */
  function normaliseAn(v) {
    if (!v) return "";
    if (v === "sans" || v === "autres") return v;
    for (var i = 0; i < GROUPES.length; i++) if (idGroupe(GROUPES[i]) === v) return v;
    var a = parseInt(v, 10);
    return a ? groupeDe(a) : "";
  }

  function rendAnnees(comptes, total) {
    var z = $("annees");
    while (z.children.length > 1) z.removeChild(z.lastChild);
    function puce(lib, id, n) {
      var b = bouton("puce" + (S.an === id ? " actif" : ""), lib + " (" + nombre(n) + ")", function () {
        S.an = S.an === id ? "" : id;
        lance();
      });
      b.setAttribute("aria-pressed", S.an === id ? "true" : "false");
      if (!n && S.an !== id) b.disabled = true;
      z.appendChild(b);
    }
    puce(t("anToutes"), "", total);
    GROUPES.forEach(function (g) { puce(idGroupe(g), idGroupe(g), comptes[idGroupe(g)] || 0); });
    puce(t("anAutres"), "autres", comptes.autres || 0);
    puce(t("anSans"), "sans", comptes.sans || 0);
    z.hidden = false;
  }

  /* ------------------------------------------------------------ recherche
     Rend {avec, sans, comptes} : les dossiers dates qui repondent (filtres
     par la puce active), les dossiers sans annee qui repondent (montres en
     fin de liste quand aucune puce n'est active, ou sous la puce « sans
     annee » ; lot 5 : ils ne s'ajoutent plus a un filtre d'annee, pour que
     le compteur soit celui de la puce), et le compte par groupe d'annees
     avant filtre. Un dossier repond par ses lignes ou par son numero. */
  function cherche() {
    var c = D.col, L = D.lig, avec = [], sans = [], comptes = {}, total = 0;
    var q = S.q.trim(), pq = plie(q), num = estNum(q) ? q.toLowerCase() : "";
    for (var i = 0; i < D.n; i++) {
      var hits = [], k;
      if (S.nom) {
        /* la graphie exacte choisie dans les suggestions ; la famille de
           prefixe filtre aussi (lot 8), sinon « colonia Tomai » rouvrait
           tout « Tomai » y compris « s. Tomai » */
        for (k = c.l0[i]; k < c.l0[i] + c.ln[i]; k++) {
          if (L.nom[k] === S.nom && (!S.fam || familleDe(L.pre[k]) === S.fam)) hits.push(k);
        }
        if (!hits.length) continue;
      } else if (num) {
        if (c.dosar[i].toLowerCase() !== num) continue;
      } else if (pq) {
        for (k = c.l0[i]; k < c.l0[i] + c.ln[i]; k++) {
          if (LF[k].indexOf(pq) !== -1) hits.push(k);
        }
        if (!hits.length && c.fold[i].indexOf(pq) === -1) continue;
      }
      var grp = groupeDe(c.an1[i]);
      comptes[grp] = (comptes[grp] || 0) + 1;
      total++;
      if (grp === "sans") { if (!S.an || S.an === "sans") sans.push({ d: i, l: hits }); }
      else if (!S.an || S.an === grp) avec.push({ d: i, l: hits });
    }
    return { avec: avec, sans: sans, comptes: comptes, total: total };
  }

  /* ------------------------------------------------------------ vouliez-vous dire */
  function levenshtein(a, b, max) {
    var m = a.length, n = b.length;
    if (Math.abs(m - n) > max) return max + 1;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur[0] = i;
      var mini = i;
      for (j = 1; j <= n; j++) {
        var cout = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cout);
        if (cur[j] < mini) mini = cur[j];
      }
      if (mini > max) return max + 1;
      var tmp = prev; prev = cur; cur = tmp;
    }
    return prev[n];
  }

  function proches(q) {
    var pq = plie(q), cand = [], vus = {};
    if (!pq) return [];
    /* les equivalences dont un cote est exactement la saisie */
    (D.equiv || []).forEach(function (paire) {
      for (var s = 0; s < 2; s++) {
        var fa = plie(paire[s]), fb = plie(paire[1 - s]);
        if (fa !== pq || fb === pq) continue;
        G.forEach(function (g) {
          if (g.fold === fb && !vus[g.nom]) { vus[g.nom] = true; cand.push({ nom: g.nom, d: -1, de: paire[s] }); }
        });
      }
    });
    /* une faute par tranche de trois lettres ; au-dela, on ne propose rien
       plutot que n'importe quoi */
    var seuil = Math.max(1, Math.floor(pq.length / 3));
    NOMS.forEach(function (e) {
      var d = levenshtein(pq, e.fold, seuil);
      if (d > seuil) return;
      if (!e.entier) d += 0.5;          /* un mot du nom vaut un peu moins que le nom */
      if (vus[e.nom] === undefined || vus[e.nom] > d) { vus[e.nom] = d; }
    });
    Object.keys(vus).forEach(function (nom) {
      if (vus[nom] !== true) cand.push({ nom: nom, d: vus[nom] });
    });
    cand.sort(function (a, b) { return a.d - b.d || a.nom.localeCompare(b.nom, LANG); });
    return cand.slice(0, MAX_PROCHES);
  }

  function rendProches(liste) {
    var z = $("proches");
    z.textContent = "";
    if (!liste.length) { z.hidden = true; return; }
    z.appendChild(el("span", "", t("vouliez") + " "));
    liste.forEach(function (p, n) {
      var lib = p.de ? t("aussiEcrit") + " " + p.de + " → " + p.nom : p.nom;
      if (n) z.appendChild(document.createTextNode(", "));
      z.appendChild(bouton("lien", lib, function () {
        $("q").value = p.nom;
        S.q = p.nom; S.nom = null; S.fam = null; S.famPre = ""; S.an = "";
        lance();
      }));
    });
    z.hidden = false;
  }

  /* ------------------------------------------------------------ rendu */
  function cfNom(ix) { return D.confiances[ix] || ""; }

  /* La confiance (sur, probable, deduit, estime, incertain, volum, exacte)
     reste portee par donnees.json et par indexeur_fs.db, mais ne s'affiche
     plus : decision de Monica du 2026-09-10. Rend toujours null, les points
     d'appel sont conserves pour que le retour arriere tienne en une ligne. */
  function pastille(ix) {
    return null;
  }

  /* Pour un dossier dont le volume en ligne n'est pas identifie : un lien
     direct vers les images de sa bobine (numero DGS), qui ouvre la visionneuse
     FamilySearch sur cette bobine. Remplace, le 2026-09-10, la consigne
     « cherchez le DGS N dans le catalogue » : le visiteur n'a plus de
     recherche a faire, seulement le numero d'image affiche a atteindre. */
  function nonRelie(dgs) {
    var a = el("a", "btn", t("chercherCatalogue", dgs));
    a.href = BOBINE + encodeURIComponent(dgs);
    a.target = "_blank";
    a.rel = "noopener";
    a.title = T.fs_titre || "";
    return a;
  }

  function lienFS(partie, libelle) {
    var a = el("a", "btn", libelle);
    a.href = FS + partie;
    a.target = "_blank";
    a.rel = "noopener";
    a.title = T.fs_titre || "";
    return a;
  }

  /* Le numero d'image A SAISIR dans la visionneuse FamilySearch.

     Ce fut d'abord un LIEN (A3, lot 8) : meme ark, seul le "i=" change. Teste
     le 2026-09-10 dans un vrai navigateur, session ouverte : le viewer IGNORE
     le "i=" et reste sur la premiere vue -- i=94, i=50 et i=3 tombent tous sur
     l'image 1. Le lien est donc supprime : il promettait un saut qui n'a pas
     lieu.

     Ce qui reste est l'essentiel, et c'est meme plus utile qu'avant : le
     viewer compte DANS LE VOLUME (« of 113 »), pas dans la bobine. La plage de
     l'inventaire (« images 223-228 ») ne correspond donc a rien de saisissable,
     alors que le numero calcule, lui, se tape directement dans le champ. On
     l'affiche a cote de la plage, avec la marge dite par la pastille. */
  /* Le lien vers LA VUE exacte (lot 13, 2026-09-10). FamilySearch donne un ark
     par image : sans lui, changer le « i= » ne fait rien (teste le 2026-09-10,
     le viewer reste sur la premiere vue). `lig.ark` porte l'ark moissonne pour
     cette image ; on garde les cc/wc du lien du dossier et on met « i= » a
     n-1, comme le fait le viewer lui-meme. */
  function lienFSVue(fsPartie, ark, n, libelle) {
    var suffixe = fsPartie.indexOf("?") >= 0 ? fsPartie.slice(fsPartie.indexOf("?")) : "";
    var a = el("a", "plage", libelle);
    a.href = FS + ark + suffixe.replace(/([?&])i=\d+/, "$1i=" + (n - 1));
    a.target = "_blank";
    a.rel = "noopener";
    a.title = T.fs_titre || "";
    return a;
  }

  function numeroASaisir(n) {
    var sp = el("span", "img-saisir", fmt("imgSaisir", { n: nombre(n) }));
    sp.title = T.imgEstimee || "";
    return sp;
  }

  function feuillets(k) {
    var L = D.lig, a = L.fa[k] + (L.sa[k] || ""), b = L.fb[k] + (L.sb[k] || "");
    return L.fa[k] === L.fb[k] && !L.sb[k] ? a : a + "-" + b;
  }

  /* Une ligne de l'inventaire, telle qu'ecrite, avec sa plage en face quand
     elle en a une (precision village). La plage devient un lien cliquable,
     ouvrant directement l'image visee, quand lig.i la donne (A3, lot 8 :
     dossier a l'ecart connu et petit) ; sinon elle reste un texte simple,
     le bouton du dossier (ligne de titre) ouvrant sa premiere image. */
  function ligne(k, hit, montreVol) {
    var L = D.lig, li = el("li", "ligne" + (hit ? " hit" : ""));
    li.dataset.vol = L.vol[k] || "";
    var vol = el("span", "vol", montreVol ? L.vol[k] : "");
    li.appendChild(vol);
    var texte = el("span", "texte");
    if (L.pre[k]) texte.appendChild(el("span", "pre", L.pre[k] + " "));
    /* L'inventaire lui-meme laisse parfois un nom en blanc : dosar 621,
       feuillets 13-39, « (text stins) » -- le texte est efface sur la page.
       La ligne existe et sa plage de feuillets compte, on la nomme donc
       plutot que d'afficher un vide (2026-09-10). */
    texte.appendChild(el(hit ? "em" : "span", L.nom[k] ? "nom" : "nom nom-vide",
                         L.nom[k] || t("nomIllisible")));
    /* nom russe entre parentheses, page russe seulement (lot 6) : le roumain
       reste seul dans le texte surligne (l'em ci-dessus), la recherche et le
       lien ne changent pas. */
    if (LANG === "ru" && D.noms_ru && D.noms_ru[L.nom[k]]) {
      texte.appendChild(document.createTextNode(" (" + D.noms_ru[L.nom[k]] + ")"));
    }
    var tin = tinutDe(k);
    if (tin) texte.appendChild(el("span", "tinut", ", " + tinutAff(tin)));
    if (L.bis && L.bis[k]) texte.appendChild(el("span", "bis", " · " + L.bis[k]));
    if (L.fa[k]) texte.appendChild(el("span", "fil", ", " + (T.filele || "f.") + " " + feuillets(k)));
    li.appendChild(texte);
    /* Un numero d'image ne s'affiche que s'il est UTILISABLE (2026-09-10,
       demande de Monica sur le dosar 330). Nos plages sont numerotees dans
       la bobine ; la visionneuse FamilySearch numerote dans son volume.
       Deux cas seulement font coincider les deux :
         - la ligne a son numero de volume calcule (`L.i[k]`) : on ouvre
           l'image, ou on donne le numero a saisir ;
         - le dossier n'a pas de lien FamilySearch : le visiteur passe par
           les images de la bobine, ou notre numerotation EST la bonne.
       Hors de ces deux cas (dosar 330 : 311 images chez nous, 519 chez eux),
       le numero serait faux de deux cents vues : on n'affiche que le
       feuillet. La plage reste dans donnees.json et en base. */
    var fsDos = D.col.fs[DOS_DE[k]];
    var estimee = L.i && L.i[k] && fsDos;
    if (L.plage[k] && (estimee || !fsDos)) {
      var face = el("span", "face");
      var texteImg = "→ " + (T.imgs || "images") + " " + plageAff(L.plage[k]);
      var ark = estimee && L.ark && L.ark[k];
      if (ark) {
        /* on a l'ark de la vue : la plage devient cliquable, et le numero a
           saisir n'a plus lieu d'etre -- le clic ouvre directement l'image. */
        face.appendChild(lienFSVue(fsDos, ark, L.i[k], texteImg));
      } else {
        face.appendChild(el("span", "plage", texteImg));
        if (estimee) face.appendChild(numeroASaisir(L.i[k]));
      }
      /* « (sur une autre bobine NNNN) » retire le 2026-09-10 : le lien mene
         deja au bon endroit, le numero de bobine ne sert qu'a nous. */
      var p = pastille(L.cf[k]);
      /* la marge se dit avec le vocabulaire deja en place (§ A3, lot 8) :
         la meme pastille de confiance, dont l'info-bulle gagne une phrase
         quand l'image ouverte est une estimation (bobines mises bout a
         bout) plutot qu'une nouvelle etiquette. */
      if (estimee && p) {
        p.title = (p.title ? p.title + " " : "") + (T.imgEstimee || "");
      }
      if (p) face.appendChild(p);
      li.appendChild(face);
    }
    return li;
  }

  /* La reference a copier : « ANRM F.134 inv.2, dossier 247, vol. I,
     col. Tomai, f. 1-64v ; bobine DGS 2362341, images 564-701 », les mots
     dans la langue de la page (lot 5 : plus de « d. » ni de « img »). */
  function reference(i, hits) {
    var c = D.col, L = D.lig;
    var s = "ANRM F." + D.fond + " inv." + D.opis + ", " + t("refDossier") + " " + c.dosar[i];
    var plage = null;
    hits.forEach(function (k) {
      s += ", " + (L.vol[k] ? "vol. " + L.vol[k] + ", " : "")
        + (L.pre[k] ? L.pre[k] + " " : "") + L.nom[k]
        + (tinutDe(k) ? ", " + tinutDe(k) : "")
        + (L.fa[k] ? ", " + (T.filele || "f.") + " " + feuillets(k) : "");
      if (!plage && L.plage[k]) plage = [L.bob[k], L.plage[k]];
    });
    if (!plage && c.bob[i]) plage = [c.bob[i], c.plage[i]];
    if (plage) {
      var bobs = plage[0].split(" · "), pls = plage[1].split(" · ");
      s += " ; " + bobs.map(function (b, n) {
        return t("refBobine") + " " + b + (pls[n] ? ", " + t("refImages") + " " + plageAff(pls[n]) : "");
      }).join(" · ");
    }
    return s;
  }

  /* Les lignes visibles d'un dossier de n lignes : un tableau de booleens,
     union des fenetres de VISIBLES lignes autour de chaque ligne trouvee
     (positions relatives) ; sans ligne trouvee, les VISIBLES premieres. */
  function fenetre(n, pos) {
    var v = new Array(n), i;
    for (i = 0; i < n; i++) v[i] = false;
    function ouvre(a, b) { for (var j = Math.max(0, a); j < Math.min(n, b); j++) v[j] = true; }
    if (!pos.length) ouvre(0, VISIBLES);
    pos.forEach(function (h) {
      if (h < VISIBLES) ouvre(0, VISIBLES);
      else if (h >= n - VISIBLES) ouvre(n - VISIBLES, n);
      else ouvre(h - 3, h + 5);
    });
    return v;
  }

  /* vrai si, a partir de la position p, plus rien n'est visible */
  function fin(v, p) {
    for (var j = p; j < v.length; j++) if (v[j]) return false;
    return true;
  }

  function copie(texte, b) {
    var fini = function () {
      var avant = b.textContent;
      b.textContent = t("copie");
      b.disabled = true;
      setTimeout(function () { b.textContent = avant; b.disabled = false; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texte).then(fini, function () { secours(texte); fini(); });
    } else {
      secours(texte);
      fini();
    }
  }

  function secours(texte) {
    var ta = document.createElement("textarea");
    ta.value = texte;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* tant pis */ }
    document.body.removeChild(ta);
  }

  /* La carte d'un dossier : la ligne de titre (numero, titre verbatim, meta,
     pastille, bouton FamilySearch), les lignes de l'inventaire, le pied
     (page d'inventaire, copier la reference). */
  function carte(i, hits) {
    var c = D.col, L = D.lig;
    var art = el("article", "dosar cf-" + cfNom(c.cf[i]));

    /* --- ligne de titre */
    /* des div, pas header/footer : la page a des regles globales sur ces balises */
    var tete = el("div", "dosar-tete");
    tete.appendChild(el("span", "dosar-num", c.dosar[i]));
    var corps = el("div", "dosar-corps");
    var titre = el("p", "dosar-titre", c.titre[i] || t("sansTitre"));
    if (!c.titre[i]) titre.className += " absent";
    corps.appendChild(titre);
    /* traduction du titre (lot 6) : en italique sous l'original, sur les
       pages non roumaines, quand traduit.py en a fourni une. L'original
       reste seul sur ro.html. */
    if (LANG !== "ro") {
      var trTitre = c["titre_" + LANG] && c["titre_" + LANG][i];
      if (trTitre) corps.appendChild(el("p", "dosar-titre-tr", trTitre));
    }
    /* la meta (lot 5, refondue le 2026-09-10) : le visiteur clique le
       bouton et FamilySearch l'ouvre au bon endroit -- le numero de bobine
       et les plages d'images du dossier sont notre plomberie, ils restent
       dans donnees.json et en base mais ne s'affichent plus (demande de
       Monica : « je ne veux pas de toutes les indications techniques a
       nous »). Restent le nombre de lignes d'inventaire et la taille du
       dossier. */
    var meta = el("p", "dosar-meta");
    var morceaux = [];
    if (c.ln[i]) morceaux.push(c.ln[i] === 1 ? t("lig1") : t("ligN", c.ln[i]));
    if (c.img[i]) morceaux.push(nombre(c.img[i]) + " " + (T.imgs || "images"));
    meta.textContent = morceaux.join(" · ");
    corps.appendChild(meta);
    tete.appendChild(corps);
    /* a droite : la pastille de confiance puis le bouton (§ B, lot 4) */
    var actions = el("div", "dosar-actions");
    var p = pastille(c.cf[i]);
    if (p) actions.appendChild(p);
    if (c.fs[i]) {
      actions.appendChild(lienFS(c.fs[i], t("ouvrirFS")));
    } else if (c.bob[i]) {
      actions.appendChild(nonRelie(c.bob[i].split(" · ")[0]));
    }
    tete.appendChild(actions);
    art.appendChild(tete);
    /* Le paragraphe « ce dossier s'etale sur plusieurs bobines » est retire
       le 2026-09-10 (demande de Monica : trop long sur la carte). Le fait
       reste dit une fois, dans le mode d'emploi. */

    /* --- les lignes de l'inventaire : une fenetre CONTIGUE autour de la
       ligne trouvee (demande de Monica apres recette), pour que ses voisines
       restent a cote d'elle. Fenetre de VISIBLES lignes : si la ligne trouvee
       est dans les 8 premieres, les 8 premieres et la fin repliee ; dans les
       8 dernieres, les 8 dernieres et le debut replie ; sinon 3 avant, la
       ligne, 4 apres, les deux bouts replies. Plusieurs lignes trouvees :
       union des fenetres. Aucune (recherche par numero) : les 8 premieres. */
    var n = c.ln[i], l0 = c.l0[i];
    if (n) {
      var ol = el("ol", "lignes");
      var estHit = {}, montre = fenetre(n, hits.map(function (k) { return k - l0; }));
      hits.forEach(function (k) { estHit[k] = true; });
      var caches = 0, prevCache = false, prevVol = null, bplus = null;
      for (var k = l0; k < l0 + n; k++) {
        if (!montre[k - l0]) {
          caches++;
          if (!prevCache) {
            /* debut d'une serie repliee : le bouton prend sa place */
            var plus = el("li", "plus");
            bplus = el("button", "lien", "");
            bplus.type = "button";
            plus.appendChild(bplus);
            ol.appendChild(plus);
            plus.dataset.n = "0";
            /* avant la premiere ligne visible, apres la derniere, ou entre deux fenetres */
            plus.dataset.ou = k === l0 ? "avant" : (fin(montre, k - l0) ? "apres" : "autres");
          }
          var li = ligne(k, false, L.vol[k] !== prevVol);
          li.className += " cache";
          li.hidden = true;
          ol.appendChild(li);
          bplus.parentNode.dataset.n = String(parseInt(bplus.parentNode.dataset.n, 10) + 1);
          prevCache = true;
        } else {
          ol.appendChild(ligne(k, !!estHit[k], L.vol[k] !== prevVol || prevCache));
          prevCache = false;
        }
        prevVol = L.vol[k];
      }
      if (caches) {
        var boutons = ol.querySelectorAll("li.plus button");
        Array.prototype.forEach.call(boutons, function (b) {
          var ou = b.parentNode.dataset.ou;
          b.textContent = "… " + t(hits.length ? ou : "autres", parseInt(b.parentNode.dataset.n, 10));
          b.addEventListener("click", function () {
            Array.prototype.forEach.call(ol.querySelectorAll("li.cache"), function (li) {
              li.hidden = false;
              li.className = li.className.replace(" cache", "");
            });
            Array.prototype.forEach.call(ol.querySelectorAll("li.plus"), function (li) {
              ol.removeChild(li);
            });
            /* une fois tout visible, le volume ne se marque qu'au changement */
            var prev = null;
            Array.prototype.forEach.call(ol.querySelectorAll("li.ligne"), function (li) {
              li.querySelector(".vol").textContent = li.dataset.vol !== prev ? li.dataset.vol : "";
              prev = li.dataset.vol;
            });
          });
        });
      }
      art.appendChild(ol);
    } else {
      art.appendChild(el("p", "note", t("sansLignes")));
    }

    /* --- pied : page d'inventaire, copier la reference */
    var pied = el("div", "dosar-pied");
    if (c.pag[i]) {
      var page1 = parseInt(c.pag[i], 10);
      pied.appendChild(el("span", "", t("invPage") + " " + c.pag[i] + " "));
      if (D.pdf) {
        var a = el("a", "", t("voirPage"));
        a.href = D.pdf + "#page=" + page1;
        a.target = "_blank";
        a.rel = "noopener";
        pied.appendChild(a);
      }
    }
    var b = el("button", "lien copier", t("copier"));
    b.type = "button";
    b.addEventListener("click", function () { copie(reference(i, hits), b); });
    pied.appendChild(b);
    art.appendChild(pied);
    return art;
  }

  function affiche(res) {
    var zone = $("resultats"), compte = $("compte");
    var n = res.avec.length + res.sans.length, reste = MAX_RES;
    zone.textContent = "";
    res.avec.slice(0, reste).forEach(function (r) { zone.appendChild(carte(r.d, r.l)); });
    reste -= res.avec.length;
    if (res.sans.length && reste > 0) {
      /* les dossiers sans annee, toujours en fin de liste, sous leur mention */
      zone.appendChild(el("p", "groupe", t("sansAnnee") + " (" + nombre(res.sans.length) + ")"));
      res.sans.slice(0, reste).forEach(function (r) { zone.appendChild(carte(r.d, r.l)); });
    }
    /* la ligne d'etat (.status) : le chiffre dans un span, en violet (lot 4) */
    compte.textContent = "";
    if (n === 0) compte.textContent = T.rien;
    else {
      if (n === 1) compte.textContent = T.ligne1;
      else {
        compte.appendChild(el("span", "", nombre(n)));
        compte.appendChild(document.createTextNode(" " + T.lignes));
      }
      if (n > MAX_RES) compte.appendChild(document.createTextNode(" · " + T.trop));
    }
    zone.hidden = n === 0;
    rendProches(n === 0 && S.q && !estNum(S.q.trim()) ? proches(S.q) : []);
  }

  /* Le filtre « graphie exacte » choisi dans les suggestions, et de quoi
     l'effacer pour revenir a la recherche tolerante. */
  function rendGraphie() {
    var z = $("graphie");
    z.textContent = "";
    if (!S.nom) { z.hidden = true; return; }
    z.appendChild(el("span", "", t("graphie") + " "));
    z.appendChild(el("strong", "", (S.famPre ? S.famPre + " " : "") + S.nom));
    z.appendChild(document.createTextNode(" "));
    z.appendChild(bouton("lien", t("effacer"), function () {
      S.nom = null; S.fam = null; S.famPre = "";
      lance();
    }));
    z.hidden = false;
  }

  /* La graphie de G qui correspond a (nom, fam) -- utilisee pour relire
     l'URL (litURL) : sans elle, le champ affiche apres un lien partage
     n'aurait pas le prefixe de la famille choisie. */
  function trouveGraphie(nom, fam) {
    for (var i = 0; i < G.length; i++) {
      if (G[i].nom === nom && (!fam || G[i].fam === fam)) return G[i];
    }
    return null;
  }

  /* L'etat de la recherche vit dans l'URL : un resultat se partage. Les
     liens de langue de l'en-tete le reportent aussi (lot 5), pour que
     changer de langue ne perde pas la recherche. */
  function ecritURL() {
    var p = new URLSearchParams();
    if (S.q) p.set("q", S.q);
    if (S.an) p.set("an", S.an);
    if (S.nom) p.set("nom", S.nom);
    if (S.nom && S.fam) p.set("fam", S.fam);
    var s = p.toString();
    Array.prototype.forEach.call(document.querySelectorAll("nav.langues a"), function (a) {
      if (!a.dataset.page) a.dataset.page = a.getAttribute("href").split("?")[0];
      a.setAttribute("href", a.dataset.page + (s ? "?" + s : ""));
    });
    if (!window.history || !history.replaceState) return;
    history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash);
  }

  function litURL() {
    var p = new URLSearchParams(location.search);
    S.q = (p.get("q") || "").trim();
    S.an = normaliseAn(p.get("an") || "");
    S.nom = p.get("nom") || null;
    /* « jud= » des anciennes adresses : ignore, la graphie ne se filtre
       plus par judet (le meme village change de judet au fil des dossiers) */
    if (S.nom && !S.q) S.q = S.nom;
    /* « fam= » (lot 8) : la famille de prefixe choisie ; retrouvee dans G
       (deja indexe a cet instant) pour recuperer aussi le prefixe affiche.
       Absente (vieux lien d'avant le lot 8) ou perimee : toutes les
       familles de ce nom repondent, comme avant. */
    var fam = p.get("fam"), g = S.nom && fam ? trouveGraphie(S.nom, fam) : null;
    S.fam = g ? g.fam : null;
    S.famPre = g ? g.pre : "";
  }

  /* l'etat vide en deux morceaux : les exemples dans la boite de recherche
     (#vide) et la loupe en dessous (#etat-vide), montres ensemble (lot 4) */
  function montreVide(oui) {
    $("vide").hidden = !oui;
    var e = $("etat-vide");
    if (e) e.hidden = !oui;
  }

  function lance() {
    var vide = !S.q.trim() && !S.an;
    rendGraphie();
    if (vide) {
      $("resultats").hidden = true;
      $("resultats").textContent = "";
      $("compte").textContent = "";
      $("proches").hidden = true;
      var glob = cherche();
      rendAnnees(glob.comptes, glob.total);
      montreVide(true);
      ecritURL();
      return;
    }
    var res = cherche();
    rendAnnees(res.comptes, res.total);
    affiche(res);
    montreVide(false);
    ecritURL();
  }

  /* ------------------------------------------------------------ etat vide */
  function rendVide() {
    var ex = $("exemples");
    EXEMPLES.forEach(function (e) {
      ex.appendChild(bouton("puce", e, function () {
        $("q").value = e;
        S.q = e; S.nom = null; S.fam = null; S.famPre = ""; S.an = "";
        lance();
      }));
    });
    /* villages cherchables (lot 8) : les graphies distinctes (lig.nom), le
       meme compte que genere_donnees.py imprime en console -- pas le nombre
       de formes plies distinctes (deux graphies qui se replient pareil
       restent deux villages qu'on peut chercher separement). */
    var villages = NB_VILLAGES, a = 0, b = 0;
    for (var i = 0; i < D.n; i++) {
      if (D.col.an1[i]) { a = a ? Math.min(a, D.col.an1[i]) : D.col.an1[i]; }
      b = Math.max(b, D.col.an2[i] || 0, D.col.an1[i] || 0);
    }
    $("stats-ligne").textContent = fmt("statsLigne", { v: villages, d: D.n, a: String(a), b: String(b) });
  }

  /* ------------------------------------------------------------ demarrage */
  function pret() {
    indexe();
    rendVide();
    document.documentElement.className += " pret";
    var q = $("q"), f = $("recherche");
    q.disabled = false;
    q.placeholder = T.phQ || "";
    $("bouton").disabled = false;
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      if (actif >= 0 && SUGG[actif]) { choisis(SUGG[actif]); return; }
      fermeSuggestions();
      S.q = q.value.trim();
      lance();
    });
    q.addEventListener("input", function () {
      /* nouvelle saisie : plus de graphie exacte, et le filtre d'annee
         revient a « toutes » (lot 5) */
      S.q = q.value.trim(); S.nom = null; S.fam = null; S.famPre = ""; S.an = "";
      rendSuggestions(suggestions(S.q));
      lance();
    });
    q.addEventListener("keydown", function (e) {
      if ($("suggestions").hidden) return;
      if (e.key === "ArrowDown") { e.preventDefault(); surligne(actif + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); surligne(actif - 1); }
      else if (e.key === "Escape") { e.preventDefault(); fermeSuggestions(); }
    });
    q.addEventListener("blur", function () { setTimeout(fermeSuggestions, 150); });
    q.addEventListener("focus", function () {
      if (S.q && !S.nom) rendSuggestions(suggestions(S.q));
    });
    var s = $("stats");
    if (s) s.textContent = nombre(D.n);
    litURL();
    q.value = S.q;
    lance();
  }

  fetch("donnees.json").then(function (r) { return r.json(); })
    .then(function (j) { D = j; pret(); })
    .catch(function () {
      $("chargement").hidden = false;
      if ($("etat-vide")) $("etat-vide").hidden = true;
      $("q").placeholder = T.erreur || "";
    });
})();

/* ------------------------------------------------------------ illustration
   La figure commentee de la section « catagrafie » est ECRITE dans la page
   (genere_site.py) : cadres, numeros et legende sont la sans JavaScript. Ce
   bloc n'ajoute que la mise en evidence -- survoler une entree de la legende
   allume son cadre et eteint les autres, et inversement. Il est independant
   du reste du fichier : si l'index ne charge pas, la figure marche quand
   meme. */
(function () {
  var figs = document.querySelectorAll(".illus-fig");
  Array.prototype.forEach.call(figs, function (fig) {
    var plaque = fig.querySelector(".plaque");
    var zones = fig.querySelectorAll(".zone");
    var lis = fig.querySelectorAll("ol.illus-leg li");
    if (!plaque || !zones.length) return;

    function pose(cle, actif) {
      plaque.classList.toggle("focalise", actif);
      Array.prototype.forEach.call(zones, function (z) {
        var sien = z.getAttribute("data-z") === cle;
        z.classList.toggle("eteint", actif && !sien);
        z.classList.toggle("actif", actif && sien);
      });
      Array.prototype.forEach.call(lis, function (li) {
        li.classList.toggle("actif", actif && li.getAttribute("data-z") === cle);
      });
    }

    function branche(el) {
      var cle = el.getAttribute("data-z");
      el.addEventListener("mouseenter", function () { pose(cle, true); });
      el.addEventListener("mouseleave", function () { pose(cle, false); });
      el.addEventListener("focus", function () { pose(cle, true); });
      el.addEventListener("blur", function () { pose(cle, false); });
    }
    Array.prototype.forEach.call(zones, branche);
    Array.prototype.forEach.call(lis, function (li) {
      /* atteignable au clavier une fois le script actif */
      li.setAttribute("tabindex", "0");
      branche(li);
    });
  });
}());
