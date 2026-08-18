# Mindful Learning — UI-audit och rollgenomgång

## Syfte
Detta dokument beskriver den kommersiella användarresan för Mindful Learning och fungerar som QA-guide för de sju rollerna. Befintliga funktioner ska behållas; varje punkt verifieras genom UI:t och ska ha laddning, tomt läge, fel/omförsök och bekräftelse efter lyckad åtgärd.

## Navigationsprincip
- **Översikt:** alltid första sidan efter inloggning (`/dashboard`).
- **Lärande:** kurser, studieplan, uppgifter och prövningar.
- **Elevstöd:** elever, handlingsplan, APL och möten.
- **Administration:** kursinstanser, användare, betyg, rapporter och systeminställningar.
- **Kommunikation:** meddelanden och notiser.
- Menyalternativ visas efter roll och behörighet. En otillåten funktion ska inte presenteras som en aktiv knapp.

## Rollbaserad genomgång

| Roll | Start och dagligt flöde | Kritiska mål |
|---|---|---|
| Elev | `/dashboard` → `/course-cards` → `/submissions` → `/messages` | Se kurser, framsteg, deadlines, betyg, prövningar och besked |
| Lärare | `/dashboard` → `/larare/kurser` → `/betyg` → `/inaktiva-elever` | Bedöma egna elever, låsa betyg, följa upp undervisning |
| Admin | `/dashboard` → `/students` → `/course-instances` → `/admin/analytics` | Hantera register, placeringar, rapporter och kursdrift |
| Systemadmin | Admin-flöden + `/admin/betygsskala` och behörigheter | Konfigurera system och låsa upp skyddade ändringar |
| SYV | `/dashboard` → elevprofil → studieplan/handlingsplan → samtal | Planera elevens utbildningsväg och dokumentera åtgärder |
| Specialpedagog | `/dashboard` → elevprofil → handlingsplan → möten | Synliggöra stödinsatser med minsta möjliga dataläckage |
| Praktiksamordnare | `/dashboard` → `/apl` → elevprofil → loggbok | Placering, status, uppföljning och praktikdokument |

## Skärm-för-skärm QA

### Inloggning och konto
- `/login`: validera tomma fält, felaktigt lösenord, laddningsläge och tydlig lyckad omdirigering.
- `/change-password`: bekräfta krav, felmeddelande, lyckad ändring och utloggning vid sessionens slut.
- Profilmeny: kontrollera rollnamn, profil, lösenordsbyte och säker utloggning.

### Översikt
- `/dashboard`: verifiera hälsning, roll, primär åtgärd, snabblänkar och notifieringsantal.
- Uppdatera ska visa vänteläge och återanvända senaste fungerande vy om notifieringar inte kan hämtas.
- Mobil 522 px: inga överlappande knappar, horisontell scroll och tydlig fokusmarkering.

### Elevprofil och studieplan
- `/students` → välj elev → flikarna General, Behörigheter, Studieplan, APL, Betyg och Dokument.
- Spara ska visa bekräftelse; behörighetskontroller ska vara dolda/inaktiva för fel roll.
- PDF/export ska ha tydlig filstatus och fel med omförsök.

### Prövning
- `/examform`: elev skapar begäran med kurs och motivering.
- `/provningar`: behörig handläggare granskar och väljer Godkänn, Flytta eller Neka.
- Kontrollera status, datumrullning, bekräftelse och att beslutet syns för eleven.

### Betyg
- `/betyg`: lärare väljer egen kurs/elev och registrerar betyg.
- NP-poäng ska kunna öppna förslag utan att skriva över lärarens beslut.
- Låsning kräver bekräftelse; upplåsning visas endast för admin/systemadmin och ska skapa notis.

### APL
- `/apl`: kontrollera sex manuella statusar, drag-and-drop, AUTO-badge under tre veckor och färgkontrast.
- Kortets detaljvy ska nå elevprofil, placering och loggbok på högst två klick.
- Tomt board-läge ska ha instruktion och inte se trasigt ut.

### Kurser och kursinstanser
- `/course-templates`, `/course-instances`: skapa, redigera, tilldela lärare och lägga till/ta bort elev.
- Destruktiva åtgärder ska kräva bekräftelse och efterföljas av snackbar/tydlig status.

### Kommunikation, kalender och rapporter
- `/messages`: kontrollera olästa, tom inkorg, fel vid sändning och återförsök.
- `/kalender`: kontrollera möten, prov, filter och responsiv dialog.
- `/admin/analytics`: kontrollera filter, datumintervall, tom data, laddningsindikator och CSV/PDF-export.

## Lanseringsblockerare
1. Backend och MongoDB måste vara tillgängliga i samma miljö som frontend.
2. Produktions-CORS, secure/httpOnly-cookies, HTTPS, mail/Scrive-konfiguration, backup och övervakning måste vara konfigurerade.
3. Varje roll behöver ett testkonto och representativa testdata; inga hårdkodade driftvärden får användas.
4. Browser-QA ska köras på desktop och tablet när preview-routing är tillgänglig.

## Godkännandekriterier
- [ ] Alla roller kan logga in och landar på rätt översikt.
- [ ] Alla tidigare implementerade flöden är nåbara via meny eller kontextuell åtgärd.
- [ ] Ingen knapp visas som aktiv när användaren saknar behörighet.
- [ ] Alla muterande åtgärder visar laddning, fel/omförsök och lyckad bekräftelse.
- [ ] Frontend build, backend lint och relevanta E2E-tester är gröna.
- [ ] Browser-journeys är dokumenterade med viewport och resultat.
