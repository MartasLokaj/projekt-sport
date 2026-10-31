# Projekt-sport — celkový přehled (stav k 31. 10. 2026)

Jeden soubor, kde je všechno pohromadě: kolik je hotovo, co jsme dnes udělali, co chybí a nápady na zlepšení.
Podrobný deník pro Clauda zůstává v `progress/STATUS.md`, zadání v `SPEC.md`.

---

## 1. Celkem hotovo: zhruba **65 %**

Hratelný základ obou her existuje. Chybí hlavně zvuky, „šťáva“ (efekty, oslavy), úvodní/výsledkové
obrazovky, dotažení editoru postavičky a **testování na skutečných telefonech**.

| Část | Hotovo | Stručně |
|---|---|---|
| Základ (server, připojení telefonů, QR, znovupřipojení) | **100 %** | Schváleno na telefonech. |
| Minigolf – hratelnost (fáze 0–3: míček, tahy, skóre, postavičky, levák/pravák) | **100 %** | Schváleno. |
| Minigolf – vzhled a jamky (fáze 4a, 4b, 9 jamek) | **95 %** | Všech 9 jamek schváleno. |
| Minigolf – „šťáva“ (fáze 4c: konfety, zvuky, úvod jamky, stupně vítězů) | **0 %** | Nezačato. |
| Badminton – hratelnost (B1–B3, mechaniky 1–5, běhání) | **90 %** | Většina schválena. Trenér (coach) čeká na test. |
| Badminton – 2 v 2 (B4) | **70 %** | Postaveno, **nevyzkoušeno** (chybí 3–4 telefony). |
| Badminton – pláž, oblečení, košík, rakety, kamera | **80 %** | Postaveno, nová kamera čeká na tvůj pohled. |
| Kostka (lobby, Cube World) | **60 %** | Vzhled hotový. Chybí zvuky (K3), přechody a výsledky (K4), lobby na telefonu (K5). |
| Editor postavičky na telefonu (fáze 5) | **45 %** | Krok 1 schválen, krok 2 má problém s 3D náhledem na telefonu, kroky 3–4 chybí. |
| Doladění (fáze 6: nastavení, návod, test s přáteli) | **5 %** | Titulní menu a návod už jsou, zbytek ne. |
| Ověření 60 snímků/s na MacBooku Air | **0 %** | Nikdy neměřeno na skutečném MacBooku Air. |

---

## 2. Co jsme dnes (31. 10.) dokázali — 59 uložených verzí

**Kostka (lobby)**
- Úplně nový vzhled lobby (Cube World 2.0): titulní menu Play / How to Play, vesmír s hvězdami a planetami,
  „živá“ kostka (vlny, mlýn, míček padá do jamky, rally s košíkem), vodopád, měsíčky, padající hvězda.
- Vybraná strana svítí, má dřevěnou ceduli, kostka poskočí. Hráči na kostku seskočí s konfetami.
- Vyhození hráče z lobby (křížek u obličeje). Na straně Badmintonu drží postavičky raketu.
- Výběr obtížnosti počítače (Easy / Normal / Pro) a délky zápasu přímo v lobby.

**Minigolf**
- Nový vzhled: šachovnicový trávník, dřevěné mantinely, širší dráhy, bližší kamera, louky, kopce, balvany.
- **6 nových jamek (celkem 9):** 4 Trubka, 5 Skokánek, 6 Hrad, 7 Klopená zatáčka, 8 Most, 9 Finále s trychtýřem.
- Oprava neviditelných lopatek mlýna.

**Badminton**
- Mechaniky krok 1–5: tlačítko SHORT (krátký úder), kymácivé údery, pády do písku, **Super Smash**,
  zlatý „Perfect“, úrovně počítače, počítadlo výměn s ohnivou stopou, racky, délka zápasu.
- Žádné texty přes hru (jen skóre).
- Běhání jako ve skutečném badmintonu: návrat na střed, odraz na špičkách, výpady u sítě.
- **Trenér (coach):** hra se učí načasování, sílu, míření a zpoždění Wi-Fi každého hráče.
- Pláž: kurt, palmy, přístřešek, molo, moře, vlajky; plážové oblečení, reakce po bodu, bílý košík, skutečné rakety.
- **2 v 2** pro 3–4 telefony (počítač doplní volná místa).
- Kamera ve stylu konzolových sportů a svítící stopa košíku.

**Postavička (fáze 5)**
- Krok 1: všechny možnosti vzhledu (vlasy, oči, pusa, čepice, brýle…) + testovací stránka `/avatars`. Schváleno.
- Krok 2: editor na telefonu s živým náhledem na televizi + 2D náhradní obrázek, když telefon neumí 3D.

**Ostatní**
- Projekt je na GitHubu, dvě práce v cloudu (kostka/minigolf a postavička) jsme bez problémů spojili.

---

## 3. Co čeká na tvůj test (postaveno, ale nevyzkoušeno)

0. ~~Přechod z kostky do hry~~ — schváleno.

Tohle je teď **největší riziko**: hodně věcí je hotových jen „na Macu“, ne na skutečných telefonech.

1. ~~Minigolf jamky 8 (Most) a 9 (Finále)~~ — schváleno, všech 9 jamek je top.
2. Badminton — trenér (coach). Záznam v `logs/badminton-outcomes.jsonl` je zatím jen z klávesnice Macu,
   ne z telefonu (žádné zpoždění Wi-Fi, síla pořád 60).
3. ~~Badminton — nová kamera a běh ke košíku~~ — schváleno.
4. Badminton — 2 v 2 (potřebuje 3–4 telefony).
5. Editor postavičky — co ukazuje telefon místo 3D náhledu (2D obrázek + poznámka proč).
6. Míření v badmintonu na iPhonu vs. Androidu (jestli vlevo/vpravo nefunguje obráceně).
7. Plynulost (60 snímků/s) na MacBooku Air, hlavně badminton na rozdělené obrazovce a minigolf s trávou.

---

## 4. Co ještě chybí (seřazeno podle důležitosti)

**A. Aby se to dalo ukázat kamarádům**
- **Zvuky a hudba** (kostka, minigolf, badminton) — zatím je hra úplně potichu. Potřeba stáhnout CC0 zvuky
  (vždy se předem zeptám: název, zdroj, velikost).
- **Úvod a výsledky:** přechod z kostky do hry, odpočet 3-2-1, obrazovka výsledků s „Play again / Back to the cube“.
- **Minigolf „šťáva“ (4c):** úvodní průlet jamkou „Hole N · Par P“, konfety při trefě, oslava hole-in-one,
  stopa míčku, vibrace, stupně vítězů, vítr v trávě.
- **Měření plynulosti** na MacBooku Air.

**B. Dotažení**
- Editor postavičky krok 3 (rychlý start, uložené postavičky, tmavý vzhled všech obrazovek na telefonu)
  a krok 4 (oblečení podle hry, stejná barva pro víc hráčů).
- Lobby na telefonu (K5): telefon ukáže vybranou hru, kdo je připojený, tlačítko Ready; vedoucí hráč může
  na telefonu otáčet kostkou a spustit hru.
- Volba 3 / 9 jamek v minigolfu.

**C. Fáze 6 – doladění**
- Nastavení (hlasitost, hudba, citlivost švihu, náhradní ovládání), návod s animací švihu,
  **test s přáteli** a oprava hlavních problémů.

**D. Drobnosti**
- Oranžové bočnice pod mlýnem, strom občas zakryje kameru v zatáčce, finální název hry.
- Později: další prostředí pro badminton (oblak, tělocvična, zahrada), další hry na kostce.

---

## 5. Nápady na optimalizaci

**Plynulost hry (výkon)**
- **Automatická kvalita:** hra si sama změří, jak rychle běží, a když nestíhá, sníží rozlišení
  nebo vypne záři (bloom). Počítač s ní pak běží plynule i na slabším Macu.
- **Tráva v minigolfu** má ~430 tisíc trojúhelníků. Vzdálené ostrovy můžou mít méně trávy
  (tzv. LOD = jednodušší verze věcí v dálce). Rychlá pojistka: zvětšit `grassSpacing`.
- **Kostka v pozadí:** když běží hra, kostka se nesmí vykreslovat (ověřit, že se opravdu zastaví).
- **Rozdělená obrazovka v badmintonu** kreslí scénu dvakrát → v každé polovině vynechat drobnosti v dálce.
- **Textury** (2,5 MB) převést do menšího formátu (WebP / KTX2) → rychlejší načítání.
- **Malé počitadlo snímků** v rohu (jen ve vývojovém režimu), ať hned vidíme, jestli hra nestíhá.

**Telefony**
- 3D náhled v editoru: nižší rozlišení a méně snímků → telefon se tolik nehřeje a nevybíjí.
- Trenér (coach) si zatím pamatuje hráče jen dokud běží server — mohl by si to ukládat do souboru.

**Kód (aby se v něm dobře pokračovalo)**
- Největší soubory rozdělit: `Badminton.ts` (1360 řádků), `course.ts` (1292), `Hub.ts` (1026),
  `tuning.ts` (925 řádků — rozdělit na část pro minigolf, badminton a kostku, ať se ladící hodnoty lépe hledají).
- **Automatické testy** pravidel (tahy, skóre, výměny, 2 v 2), ať změna v jedné hře nerozbije jinou.
- `STATUS.md` má skoro 600 řádků — staré, uzavřené věci přesunout do archivu, ať je nový začátek chatu rychlejší.

**Postup práce**
- **Testovací den:** projít seznam z bodu 3 najednou s telefony, místo stavění dalších věcí.
  Hodně hotové práce je zatím neověřené.
- Krátký **kontrolní seznam testu** (co otevřít, co udělat, co vidět) pro každou hru, ať se dá hra
  rychle projít po každé větší změně.
- Práce v cloudu: vždy jen jedna relace na jednu oblast kódu (kostka / minigolf / badminton / postavička),
  ať se změny nepřepisují.

---

## 6. Doporučený další krok

1. **Testovací den** s telefony (seznam v bodě 3) — 1–2 hodiny.
2. **Zvuky** (K3 + badminton + minigolf) — hra pak hned působí mnohem hotověji.
3. **Úvod a výsledky** (K4) a minigolf „šťáva“ (4c).
4. Měření plynulosti na MacBooku Air.
5. Dokončení editoru postavičky (krok 3 a 4).
