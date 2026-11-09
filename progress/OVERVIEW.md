# Projekt-sport — celkový přehled (stav k 9. 11. 2026)

Jeden soubor, kde je všechno pohromadě: kolik je hotovo, co jsme udělali, co chybí a nápady na zlepšení.
Podrobný deník pro Clauda zůstává v `progress/STATUS.md`, zadání v `SPEC.md`.

---

## 1. Celkem hotovo: zhruba **82 %**

Obě hry jsou hratelné, se zvuky, s hudbou a s přechodem z kostky do hry. Chybí hlavně efekty a oslavy
v minigolfu, obrazovky s výsledky, dotažení editoru postavičky, nastavení a test s kamarády.

| Část | Hotovo | Stručně |
|---|---|---|
| Základ (server, připojení telefonů, QR, znovupřipojení) | **100 %** | Schváleno na telefonech. |
| Minigolf – hratelnost (míček, tahy, skóre, postavičky, levák/pravák) | **100 %** | Schváleno. |
| Minigolf – vzhled a jamky | **100 %** | 9 jamek schváleno, volba 3 náhodné / 9 jamek schválena. |
| Minigolf – efekty a oslavy (4c) | **90 %** | Úvod jamky, konfety, hole-in-one, stopa, zatřesení, vibrace, vítr, zvuky, stupně vítězů. Čeká na tvůj pohled. |
| Badminton – hratelnost, běhání, kamera | **95 %** | Schváleno. Trenér (coach) čeká na test z telefonu. |
| Badminton – 2 v 2 | **70 %** | Postaveno, **nevyzkoušeno** (chybí 3–4 telefony). |
| Badminton – pláž, oblečení, košík, rakety | **90 %** | Hotovo, grafiku ještě vylepšíme. |
| Kostka (lobby) | **85 %** | Vzhled, zvuky, hudba, přechod do hry a stupně vítězů hotové. Chybí úvod zápasu a lobby na telefonu. |
| Editor postavičky na telefonu (fáze 5) | **60 %** | Kroky 1–2 fungují (živé úpravy, ukládání). Chybí kroky 3–4. |
| Doladění (fáze 6: nastavení, návod, test s přáteli) | **10 %** | Titulní menu, návod a ztlumení (M) jsou, zbytek ne. |
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

## 2b. Co jsme udělali 31. 10. večer a 1. 11.

- **Přechod z kostky do hry:** kamera vletí do strany kostky, bílý záblesk, kamera se snese ke hře, a zpět. Schváleno.
- **Badminton:** kamera jede za hráčem, košík i postavička jsou vždy v obraze; postavička drží odstup a natáhne raketu. Schváleno.
- **Zvuky a hudba** na kostce, v minigolfu i v badmintonu (CC0), klávesa M ztlumí. Schváleno.
- **Opraveno:** jen 5 jamek a nefunkční živé úpravy postavičky (server běžel ze starého kódu).
- **Minigolf:** volba 3 náhodné jamky / všech 9 v kartě. Schváleno.

---

## 3. Co čeká na tvůj test (postaveno, ale nevyzkoušeno)

0. **Minigolf opravy** (3. 11.): úder se už nespustí sám ani při drobném pohybu; čekající hráči stojí
   stranou u kraje obrazu; stromy a keře před kamerou zprůsvitní.
0. **Curling C1** (2. 11.): strana Curling na kostce → Play. Telefonem zamíříš a švihneš, kámen klouže a zatáčí.

1. Badminton — trenér (coach): zahraj si s telefonem aspoň 20 úderů, pak ho doladím podle záznamu.
2. Badminton — 2 v 2 (potřebuje 3–4 telefony).
3. Míření v badmintonu na iPhonu vs. Androidu (jestli vlevo/vpravo nefunguje obráceně).
4. Editor postavičky: je na telefonu vidět 3D postavička, nebo jen 2D obrázek?
5. Plynulost (60 snímků/s) na MacBooku Air, hlavně badminton na rozdělené obrazovce a minigolf s trávou.

---

## 4. Co ještě chybí (seřazeno podle důležitosti)

**A. Aby se to dalo ukázat kamarádům**
- ~~Stupně vítězů s oslavou~~ — hotovo a vyzkoušeno. Zbývá úvod zápasu (hráči vedle sebe,
  odpočet 3-2-1).
- ~~Minigolf efekty (4c)~~ — postaveno 2. 11. (čeká na tvůj pohled).
- **Měření plynulosti** na MacBooku Air.

**B. Dotažení**
- Editor postavičky krok 3 (rychlý start, uložené postavičky, tmavý vzhled všech obrazovek na telefonu)
  a krok 4 (oblečení podle hry, víc hráčů smí mít stejnou barvu).
- Lobby na telefonu (K5): telefon ukáže vybranou hru a kdo je připojený; vedoucí hráč může na telefonu
  vybrat hru a spustit ji.
- Automatický restart serveru po změně (aby se už nestalo, že běží starý kód).

**C. Fáze 6 – doladění**
- Nastavení na obrazovce (hlasitost hudby a efektů, citlivost švihu, náhradní ovládání),
  návod s animací švihu, **test s přáteli** a oprava hlavních problémů.

**D. Grafika (domluveno na později)**
- Velké vylepšení grafiky obou her a postaviček.

**E. Drobnosti a později**
- Oranžové bočnice pod mlýnem, finální název hry. (Strom před kamerou — opraveno 3. 11., čeká na test.)
- Případně jiná hudba (výměna je snadná).
- Další prostředí pro badminton, další hry na kostce (tenis, box, bowling, curling…).

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
