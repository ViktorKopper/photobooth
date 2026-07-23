# Photobooth — UX review a plán vylepšení (popisky fixkou + filtre)

Tento dokument má dve časti: (1) krátky review súčasného stavu appky očami senior UI/UX
dizajnéra a (2) kompletný, hotový prompt na implementáciu, ktorý stačí skopírovať a poslať
kódovaciemu AI agentovi (Claude Code, Cursor a pod.) — nič si k nemu netreba dopĺňať.

---

## 1. Review súčasného stavu

Appka má prekvapivo vyzretý vizuálny jazyk už teraz — ružovo-krémová paleta, sklenené karty,
srdiečkové motívy, Georgia serif pre nadpisy a Caveat pre osobný odkaz. Najsilnejšia vec v celom
projekte je `collage.js`: fotky sa kreslia ako skutočné polaroidy s washi páskou, jemným
nakláňaním, dorovnaním jasu naprieč zábermi a film-grain vrstvou navrch. Toto nie je bežná úroveň
detailu — je to prakticky hotové aj bez toho, čo chceš pridať teraz.

Zopár vecí by som ako dizajnér doladil, zoradené podľa dopadu:

Najväčšia medzera je, že celý "romantický" vizuálny jazyk sa objaví až vo finálnej koláži.
Samotné fotenie (countdown, tlačidlá Take/Switch) je čisto funkčné a pôsobí ako iná appka než tá,
čo vyrobí koláž o pár klikov neskôr. Presne toto rieši váš plán s popiskami — pridáva osobný,
"scrapbookový" prvok už do fotiaceho kroku, nie až na konci. Odporúčam preto popisky implementovať
tak, aby fotka s popiskom v preview vyzerala už ako mini-polaroid, nie len obyčajný textový input
pod fotkou.

Countdown prekrýva celý `camera-wrap` neprieadhľadnou vrstvou (`inset:0`), takže počas 3-2-1 nevidno
vlastnú tvár. Skutočné photoboothy nechávajú živý obraz presvitať — je to súčasť zážitku ("priprav sa,
vidím sa"). Odporúčam znížiť krytie pozadia countdownu alebo ho spraviť priehľadnejšie.

Prepínače Layout/Quality pri generovaní koláže sú natívne `<select>` prvky — jediné miesto v appke,
ktoré vizuálne vyskakuje z inak veľmi konzistentného "pill button" jazyka. Oplatí sa ich nahradiť
segmentovanými tlačidlami v rovnakom štýle ako zvyšok UI.

Grid layout (360px sidebar + zvyšok pre kameru) má len jeden breakpoint pri 860px, kde spadne na
jeden stĺpec. Medzi ~600–860px môže byť kamera zbytočne stlačená vedľa statusu. Stačí pridať jeden
medzistupeň, kde sa status card zbalí nad kameru namiesto vedľa nej.

Countdown a toast sú čisto vizuálne — bez `aria-live` regiónu človek so screen readerom nevie, že sa
niečo deje. Malá, ale lacná oprava.

Keď pribudnú popisky k jednotlivým fotkám, appka bude mať dva rôzne "rukou písané" vstupy: globálnu
správu na koláž (na landing page) a teraz aj popisky pri fotkách. Odporúčam v texte jasne odlíšiť
oba koncepty (napr. "Odkaz na koláž" vs. "Popisok k fotke"), nech si ich používatelia nepomýlia.

---

## 2. Návrh: popisky k fotkám ("fixkou")

Kľúčové zistenie: `drawPhotoCard` v `collage.js` už dnes rezervuje spodný okraj karty
(`bottomPad = height * 0.2`) presne s komentárom *"room to write a caption underneath"* — ale nič sa
tam momentálne nekreslí. Popisky teda nie sú nová vec navyše, sú to doplnenie niečoho, čo bolo od
začiatku pripravené.

**Flow, ktorý navrhujem:** odfotíš fotku 1 → v preview (predtým, než potvrdíš) sa fotka zobrazí ako
mini-polaroid s prázdnym pásikom dole → tam rovno píšeš popisok, živo v marker-fonte (WYSIWYG — čo
vidíš pri písaní, presne to sa objaví v koláži) → jedno tlačidlo "Potvrdiť" nahrá fotku aj popisok
naraz → ide sa na fotku 2. Zámerne to nie je dvojkrokové (odfoť → potom až popíš cez druhú
obrazovku) — spája to do jedného gesta, aby to netrvalo dlhšie ako doteraz.

**Font:** na "fixku" (hrubý fix/značkovač) je klasika Google Fontov **Permanent Marker** — hrubé,
nerovnomerné ťahy, presne ten efekt popísanej fotky. Caveat (súčasný font) je skôr elegantné pero na
podpis, nie fix — necháme ho na globálnu správu v hlavičke koláže a Permanent Marker pridáme len pre
popisky fotiek, nech majú vizuálne odlišný, "rýchlejší" charakter.

**Dáta a bezpečnosť:** `firestore.rules` má prísnu schému (`data.keys().hasOnly([...])`) pre
dokumenty vo `photos`. Ak sa pridá pole `caption` len do kódu appky bez úpravy pravidiel, Firebase
zápis potichu zlyhá (permission denied) — toto je najčastejšia skrytá chyba pri pridávaní nového
poľa, tak je to v prompte nižšie explicitne riešené.

**Renderovanie v koláži:** popisok sa vykreslí do existujúceho `bottomPad` priestoru, vycentrovaný,
s jemným náhodným (ale deterministickým) natočením nezávislým od natočenia fotky — presne ako keby
niekto pero pridal dodatočne a nie úplne rovno. Farba atramentu sa odvodí od farby daného partnera
(rovnaká logika ako washi páska), aby to ladilo s celkom. Ak popisok chýba, riadok ostane prázdny —
žiadna chyba, len čistý polaroid bez textu.

---

## 3. Návrh: filtre

Keďže to spomínaš len ako "ďalší plán", navrhujem najjednoduchšie riešenie, ktoré netreba nič ďalej
architektonicky meniť: pod živým náhľadom kamery pribudne riadok malých kruhových vzoriek filtrov
(Original, Teplý, Čiernobiely, Vintage, Studený). Kliknutie na vzorku hneď zmení CSS `filter` na
`<video>` (živý náhľad), a presne ten istý filter sa použije aj na `<canvas>` pri samotnom zábere —
takže efekt sa "zapečie" priamo do nahranej fotky a nie je potrebné ukladať žiadne extra metadáta ani
riešiť filter znova pri generovaní koláže. Výber filtra je per-fotka (dá sa zmeniť pred každým
záberom), ale zostáva nastavený, kým ho niekto zmení — netreba ho vyberať znova zakaždým.

---

## 4. KOMPLETNÝ PROMPT NA IMPLEMENTÁCIU (skopíruj celý blok nižšie)

```
Uprav web appku "photobooth" (vanilla JS + Vite + Firebase, súbory v src/: main.js, camera.js,
collage.js, room.js, utils.js, styles.css, plus index.html a firestore.rules). Zachovaj presne
existujúci vizuálny jazyk (ružovo-krémová paleta, sklenené karty so zaoblenými rohmi, srdiečkové
motívy, Georgia serif nadpisy, Caveat pre rukou písaný text) — toto je doplnenie existujúceho
dizajnu, nie redesign. Realizuj tieto dve funkcie:

=== A) POPISKY K JEDNOTLIVÝM FOTKÁM (marker font) ===

1. index.html
   - K existujúcemu Google Fonts <link> pridaj aj font "Permanent Marker":
     https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Permanent+Marker&display=swap
     (nahraď pôvodný Caveat-only link týmto jedným kombinovaným).

2. src/utils.js
   - Pridaj funkciu `sanitizeCaption(value)`: orezaná na 36 znakov, trim, môže byť aj prázdny
     reťazec (na rozdiel od sanitizeCollageMessage popisok NEMÁ default fallback text — prázdny
     popisok je platný stav).

3. src/camera.js
   - Uprav `capturePhoto(videoElement, facingMode, cssFilter = 'none')`: pred
     `context.drawImage(...)` nastav `context.filter = cssFilter;` a po nakreslení
     `context.filter = 'none';`. Toto "zapečie" vybraný filter priamo do JPEGu.

4. src/main.js — stavový model a UI
   - Do `state` pridaj: `activeFilter: 'none'` (CSS filter reťazec aktuálne vybraného filtra).
   - `state.pendingCapture` po zachytení fotky nech obsahuje aj `caption: ''`.
   - Definuj pole filtrov, napr.:
     ```js
     const FILTERS = [
       { id: 'none', label: 'Original', css: 'none' },
       { id: 'warm', label: 'Teplý', css: 'sepia(0.25) saturate(1.3) brightness(1.05)' },
       { id: 'bw', label: 'Čiernobiely', css: 'grayscale(1) contrast(1.1)' },
       { id: 'vintage', label: 'Vintage', css: 'sepia(0.35) contrast(0.9) brightness(1.05) saturate(0.85)' },
       { id: 'cool', label: 'Studený', css: 'hue-rotate(-8deg) saturate(1.15) brightness(1.02)' }
     ];
     ```
   - V `renderRoomShell()` pridaj pod `.camera-wrap` (nad `#cameraActions`) nový riadok
     `<div id="filterRow" class="filter-row">` s jedným kruhovým tlačidlom na filter
     (`class="filter-swatch" data-filter-id="..."`, aktívny má `class="filter-swatch active"`).
     Klik na swatch: nastaví `state.activeFilter`, aplikuje `video.style.filter = css` na
     `#cameraPreview` živo, prekreslí aktívny stav swatchov (bez plného re-renderu, nech nepreblikne
     kamera).
   - V `takePhotoFlow()` volaj `capturePhoto(video, state.facingMode, currentFilterCss)`.
   - Preview panel (`#previewPanel`) uprav tak, aby fotka vyzerala ako mini-polaroid s miestom na
     popis: pod `<img id="photoPreview">` pridaj input pre popisok:
     ```html
     <div class="polaroid-preview">
       <img id="photoPreview" alt="Captured preview" />
       <label class="visually-hidden" for="captionInput">Popisok k fotke (nepovinné)</label>
       <input
         id="captionInput"
         class="caption-input"
         maxlength="36"
         placeholder="napíš odkaz k tejto chvíli..."
         autocomplete="off"
       />
     </div>
     ```
     `.caption-input` musí byť štýlovaný `font-family: "Permanent Marker", cursive;` a vycentrovaný,
     aby vyzeral presne ako to, čo sa neskôr nakreslí do koláže (WYSIWYG). Farba textu inputu sa
     odvíja od role (`state.role === 'viktor' ? '#2a5a86' : '#9b2948'`) cez inline style alebo CSS
     class na kontajneri.
   - `captionInput` input event: `state.pendingCapture.caption = sanitizeCaption(event.target.value)`.
   - `retakePhoto()`: vyprázdni aj caption input a `state.pendingCapture` (ako doteraz), filter
     výber (`state.activeFilter`) NECHAJ nezmenený.
   - `confirmPhoto()`: pošli `caption: state.pendingCapture.caption` do `uploadPhoto(...)`.

5. src/room.js
   - `uploadPhoto({ roomId, uid, role, index, blob, caption = '' })`: do Firestore dokumentu
     `rooms/{roomId}/photos/{role}-{index}` pridaj pole `caption: caption` (vždy ulož, aj keď je to
     prázdny string — nech schéma ostane konzistentná naprieč všetkými fotkami).

6. firestore.rules — POVINNÉ, inak zápis s novým poľom zlyhá na "permission denied"
   - Vo funkcii `validPhoto(data)` priprav zoznam povolených kľúčov tak, aby obsahoval aj 'caption':
     `data.keys().hasOnly(['owner','ownerUid','index','storagePath','downloadUrl','createdAt',
     'width','height','caption'])`
   - Pridaj validáciu: `&& data.caption is string && data.caption.size() <= 36`.

7. src/collage.js — vykreslenie popisku do existujúcej rezervy `bottomPad`
   - Priprav `MARKER_FONT = '"Permanent Marker", cursive'` vedľa existujúceho `HANDWRITING_FONT`.
   - Rozšír `ensureHandwritingFont()` (alebo pridaj analogickú `ensureMarkerFont()`) tak, aby sa
     pred kreslením načítal aj font Permanent Marker cez `document.fonts.load(...)` +
     `document.fonts.check(...)`, s rovnakým fallback princípom ako pri Caveat (ak sa nenačíta,
     použi `italic 600 <size>px Georgia, serif` ako núdzový štýl).
   - `drawPhotoCard(...)` prijme nový voliteľný parameter `caption` v `options`. Ak `caption` nie je
     prázdny reťazec, nakresli ho do priestoru medzi `innerY + innerHeight` a `y + height` (teda
     presne do existujúceho bottomPad pásu):
     - vycentrovaný horizontálne na `x + width / 2`,
     - základná veľkosť fontu `clamp(width * 0.09, 22, 44)` — ak text nepasuje do `width * 0.86`,
       zmenšuj o 2px až do cca 60 % základnej veľkosti, potom orežarezaj s "…" (rovnaká logika ako
       existujúce skracovanie `messageText` v `drawHeaderBlock`),
     - farba: pre viktora tmavšia modrá `#2a5a86`, pre jericku tmavšia ružová `#9b2948` (rovnaké
       hodnoty ako `--viktor-dark` / `--jericka-dark` v styles.css),
     - jemné nezávislé natočenie ±1.5° (deterministické podľa indexu fotky, napr.
       `(index % 2 === 0 ? -1.4 : 1.6)`), nakreslené cez vlastný `ctx.save()/translate/rotate/restore`
       nezávisle od `rotationDeg` celej karty.
   - Priebežne cez `viktor`/`jericka` polia fotiek sa dnes do `viktorImages`/`jerickaImages` posielajú
     iba načítané `Image` objekty bez metadát. Uprav `loadOwnerImages` (alebo miesto volania) tak, aby
     sa spolu s obrázkom niesol aj zodpovedajúci `caption` z pôvodného photo záznamu (napr. vytvor pole
     objektov `{ image, caption }` namiesto holých `Image` inštancií) a preveď všetky tri layouty
     (`drawGridLayout`, `drawStripLayout`, `drawHeroLayout`) tak, aby pri volaní `drawPhotoCard`
     posielali `caption: item.caption` pre daný slot namiesto priameho `viktorImages[i]`.

8. src/styles.css — nové štýly
   - `.filter-row`: flex, gap 10px, `overflow-x: auto` na mobile, `padding: 4px 2px`.
   - `.filter-swatch`: kruh 44px, `border: 2px solid var(--border)`, `background: rgba(255,255,255,0.7)`,
     `font-size: 0.7rem`, `font-weight: 800`; `.filter-swatch.active` dostane
     `border-color: var(--rose); box-shadow: 0 0 0 3px rgba(217,77,114,0.18);`.
   - `.polaroid-preview`: biely rám okolo `#photoPreview` (rovnaký vizuál ako `.preview-panel img`
     dnes), s `.caption-input` umiestneným v spodnej "bielej" časti rámu (napodobiť skutočný
     polaroidový okraj — napr. `background:#fff; padding: 0 0 18px; border-radius: 0 0 22px 22px;`).
   - `.caption-input`: `font-family: "Permanent Marker", cursive; font-size: 1.4rem; text-align:
     center; border: none; background: transparent; width: 100%;` + `:focus` bez rušivého outline
     (jemný spodný podčiarknik namiesto štandardného focus ringu, nech to pôsobí ako písanie perom,
     napr. `border-bottom: 2px dashed var(--border);`).
   - `.visually-hidden`: štandardný screen-reader-only pattern (`position:absolute; width:1px;
     height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap;`).

=== B) DROBNÉ UX OPRAVY (voliteľné, ale odporúčané spolu s vyššie uvedeným) ===

9. `.countdown` v styles.css: zníž krytie pozadia (napr. `background: rgba(79,39,49,0.2)` namiesto
   `0.35`) nech je vidno živý obraz kamery aj počas odpočtu.

10. Pridaj `aria-live="polite"` na `#countdown` a na `.toast` kontajner v main.js, aby odpočet a
    potvrdenia boli oznámené aj screen readerom.

11. V `renderCollageSection` nahraď oba `<select>` (`#layoutSelect`, `#resolutionSelect`) skupinou
    pill-tlačidiel v rovnakom vizuálnom štýle ako `.secondary`/`.primary` inde v appke (segmented
    control), zachovaj rovnaké `id`/hodnoty, aby zvyšná logika (`generateCollageFlow`) fungovala bez
    zmeny.

Na záver over: (a) `npm run build` prejde bez chýb, (b) vygenerovaná koláž vo všetkých troch
layoutoch (grid/strip/hero) správne zobrazuje popisky aj pri prázdnom popisku, aj pri 36-znakovom
popisku, aj pri diakritike, (c) filter zvolený pri fotení sa zhoduje s tým, čo sa reálne nahrá do
Firebase Storage, (d) firestore.rules sa nasadia (`firebase deploy --only firestore:rules`) predtým,
než appka začne posielať pole `caption`, inak zápisy zlyhajú.
```

---

## Poznámka

Toto je hotový, samostatný prompt — nič k nemu netreba dopĺňať, len ho vlož kódovaciemu agentovi.
Ak chceš, viem tieto zmeny rovno aj implementovať priamo v tomto repozitári — stačí povedať.
