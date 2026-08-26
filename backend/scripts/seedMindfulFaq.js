import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config({ path: path.resolve(import.meta.dirname, "../.env.development") });

import mongoose from "mongoose";
import FaqCategory from "../src/models/FaqCategory.js";
import Faq from "../src/models/Faq.js";

// ---------------------------------------------------------------------------
// Helper – upsert a category by name (case-insensitive via collation)
// ---------------------------------------------------------------------------
async function upsertCategory({ name, description, displayOrder }) {
  const existing = await FaqCategory.findOne({ name }).collation({ locale: "sv", strength: 2 });
  if (existing) {
    await FaqCategory.findByIdAndUpdate(existing._id, { description, displayOrder });
    console.log(`  Category (updated): ${name}`);
    return existing._id;
  }
  const doc = await FaqCategory.create({ name, description, displayOrder });
  console.log(`  Category (created): ${name}`);
  return doc._id;
}

// ---------------------------------------------------------------------------
// Helper – upsert a FAQ by question text within a category
// ---------------------------------------------------------------------------
async function upsertFaq(categoryId, { question, answer, keywords, alternateQuestions, displayOrder }) {
  const existing = await Faq.findOne({ categoryId, question });
  if (existing) {
    await Faq.findByIdAndUpdate(existing._id, { answer, keywords, alternateQuestions, displayOrder });
    return;
  }
  await Faq.create({ categoryId, question, answer, keywords, alternateQuestions, displayOrder });
}

// ---------------------------------------------------------------------------
// FAQ DATA
// ---------------------------------------------------------------------------

const categories = [
  {
    name: "Komvux & Mindful – allmänt",
    description: "Allmänna frågor kring Komvux och Mindful",
    displayOrder: 0,
  },
  {
    name: "Ansökan & antagning",
    description: "Hur man ansöker, antagningsbesked och kommunikation med hemkommunen",
    displayOrder: 1,
  },
  {
    name: "Kurser & studier",
    description: "Kurslängder, studietider, distans, kombinera kurser och studieplan",
    displayOrder: 2,
  },
  {
    name: "Betyg & prov",
    description: "Betygsutdrag, slutprov, prövning och rättning",
    displayOrder: 3,
  },
  {
    name: "CSN & ekonomi",
    description: "Studiestöd, avgifter och CSN-frågor",
    displayOrder: 4,
  },
  {
    name: "Studenttjänster",
    description: "Intyg, stöd, anpassningar, studievägledning och It's Learning",
    displayOrder: 5,
  },
  {
    name: "Kontakt & support",
    description: "Kontaktuppgifter, avanmälan, teknisk support och slutprov bokning",
    displayOrder: 6,
  },
];

// [categoryName, question, answer, keywords[], alternateQuestions[], displayOrder]
const faqs = [
  // ── Komvux & Mindful – allmänt ────────────────────────────────────────────
  {
    cat: "Komvux & Mindful – allmänt",
    q: "Vad är Komvux?",
    a: "Komvux är kommunal vuxenutbildning där hemkommunen finansierar studierna. Utbildningen passar personer som vill komplettera gymnasiebetyg, uppnå fullständig gymnasieexamen, byta karriär, få behörighet till högskola eller yrkeshögskola.",
    kw: ["komvux", "vuxenutbildning", "kommun", "finansiering"],
    alt: ["Vad står Komvux för?", "Vad innebär Komvux?"],
    order: 0,
  },
  {
    cat: "Komvux & Mindful – allmänt",
    q: "Vad är privat utbildning hos Mindful?",
    a: "Privata studier innebär att studenten själv betalar för utbildningen utan att kommunen är inblandad.\n\nObservera:\n• Privata studier är inte CSN-berättigade.\n• Det finns möjlighet att komplettera med prövning för gymnasiala betyg.",
    kw: ["privat", "utbildning", "betala", "avgift"],
    alt: ["Vad är privata studier?", "Skillnad mellan Komvux och privat utbildning?"],
    order: 1,
  },
  {
    cat: "Komvux & Mindful – allmänt",
    q: "Ger utbildningarna arbetsmöjligheter?",
    a: "Alla utbildningar innehåller cirka 15 % APL (praktik). En lyckad praktik kan leda till anställning.",
    kw: ["arbete", "praktik", "apl", "anställning", "jobb"],
    alt: ["Finns det praktik i utbildningen?", "Kan jag få jobb efter utbildningen?", "Leer praktiken till anställning?"],
    order: 2,
  },
  {
    cat: "Komvux & Mindful – allmänt",
    q: "Är studierna på distans eller i klassrum?",
    a: "Mindful erbjuder distansutbildning.\n\nSlutprov genomförs alltid på plats och kan inte genomföras på distans. Detta gäller både kommunala och privata studier.\n\nAdress för slutprov:\nFinlandsgatan 64–68, 164 74 Kista eller Aniaraplatsen 4, plan 3, 191 47 Sollentuna.",
    kw: ["distans", "klassrum", "plats", "slutprov", "kista", "sollentuna"],
    alt: ["Hur fungerar distansutbildning?", "Var skriver man slutprov?", "Måste jag vara på plats?"],
    order: 3,
  },
  {
    cat: "Komvux & Mindful – allmänt",
    q: "Hur fungerar privata studier?",
    a: "Undervisningen sker digitalt genom videomöten, uppgifter och digital handledning.",
    kw: ["privat", "digital", "videomöte", "handledning"],
    alt: ["Hur är undervisningen för privata studier?", "Hur sker undervisningen?"],
    order: 4,
  },
  {
    cat: "Komvux & Mindful – allmänt",
    q: "Finns det platsgaranti?",
    a: "Komvux:\n• Ingen platsgaranti.\n\nPrivata studier:\n• Platsgaranti vid varje månadsstart.\n• Anmälan ska göras senast den 15:e i månaden innan önskad start.",
    kw: ["platsgaranti", "plats", "anmälan"],
    alt: ["Har jag platsgaranti?", "Är det platsgaranti på Komvux?"],
    order: 5,
  },
  {
    cat: "Komvux & Mindful – allmänt",
    q: "Hur långa är utbildningarna?",
    a: "Kurser:\n• 5, 10 eller 20 veckor.\n\nUtbildningar:\n• 20, 25, 40, 75 eller 90 veckor.",
    kw: ["längd", "veckor", "kurser", "utbildningar", "tid"],
    alt: ["Hur lång tid tar utbildningen?", "Hur lång är en kurs?"],
    order: 6,
  },
  {
    cat: "Komvux & Mindful – allmänt",
    q: "Vilken svensk nivå krävs?",
    a: "Studenten ska ha avslutat SAS Grund 1–4 eller förväntas bli klar innan kursstart, detta gäller alla kurser eller utbildningar.",
    kw: ["svenska", "sas", "nivå", "språk", "grund"],
    alt: ["Vilka språkkrav finns?", "Måste jag kunna svenska?"],
    order: 7,
  },

  // ── Ansökan & antagning ───────────────────────────────────────────────────
  {
    cat: "Ansökan & antagning",
    q: "Hur ansöker jag till Komvux hos Mindful?",
    a: "Ansökningsinformation kan variera beroende på kommun, utbildning och studieval. Hänvisa alltid till aktuell ansökningsinformation på Mindfuls hemsida.",
    kw: ["ansöka", "ansökan", "ansökningsinformation"],
    alt: ["Hur söker jag till Komvux?", "Vart_ansöker jag?"],
    order: 0,
  },
  {
    cat: "Ansökan & antagning",
    q: "Kommunen har inte godkänt min ansökan. Vad kan jag göra?",
    a: "Kontakta din hemkommun för avstämning kring nekade ansökan. Hemkommunen ansvarar för hela antagningsprocessen, inte Mindful.",
    kw: ["nekad", "ansökan", "godkänd", "kommun"],
    alt: ["Min ansökan avslagits", "Kommunen sa nej till min ansökan"],
    order: 1,
  },
  {
    cat: "Ansökan & antagning",
    q: "Kan jag ansöka efter sista ansökningsdagen?",
    a: "Du behöver kontakta din hemkommun. Sena ansökningar godkänns sällan, men Mindful har nya kursstarter varje månad.",
    kw: ["sen", "ansökningsdag", "frist"],
    alt: ["Går det att ansöka sent?", "Är det för sent att ansöka?"],
    order: 2,
  },
  {
    cat: "Ansökan & antagning",
    q: "När får jag antagningsbesked?",
    a: "En månad före kursstart.",
    kw: ["antagningsbesked", "besked", "när"],
    alt: ["När kommer mitt antagningsbesked?", "Hur lång tid innan start får jag besked?"],
    order: 3,
  },
  {
    cat: "Ansökan & antagning",
    q: "Hur får jag min studieplan?",
    a: "Studieplan mejlas till elever innan start. Om studieplan inte mejlats till elev, kontakta utbildning@mindful.se",
    kw: ["studieplan", "mejl", "planering"],
    alt: ["Var finner jag min studieplan?", "När får jag studieplanen?"],
    order: 4,
  },

  // ── Kurser & studier ──────────────────────────────────────────────────────
  {
    cat: "Kurser & studier",
    q: "Kan jag läsa om en kurs jag redan har godkänt betyg i?",
    a: "Nej, inte via Komvux.\n\nVid privatstudier kan kursen läsas igen för kompetensutveckling, men inget nytt betyg utfärdas. Däremot kan en prövning genomföras för att försöka höja betyget.",
    kw: ["läsa igen", "betyg", "godkänt", "höja"],
    alt: ["Kan jag läsa en kurs till igen?", "Får jag läsa om en kurs jag redan klarat?"],
    order: 0,
  },
  {
    cat: "Kurser & studier",
    q: "Kan jag gå en utbildning som innehåller en kurs jag redan läst?",
    a: "Vid start av studier reviderar SYV på skolan bort kurser som tidigare studerats.\n\nVid privatstudier kan kursen läsas igen.",
    kw: ["redan läst", "syv", "revidering", "utbildning"],
    alt: ["Jag har redan läst en kurs i utbildningen, vad händer?"],
    order: 1,
  },
  {
    cat: "Kurser & studier",
    q: "Kan jag läsa två kurser eller utbildningar samtidigt?",
    a: "• En heltidskurs (100 %) kan inte kombineras med andra studier.\n• Två deltidskurser (50 %) kan kombineras.\n• Endast en heltidsutbildning kan läsas i taget.",
    kw: ["kombinera", "samtidigt", "heltid", "deltid"],
    alt: ["Får jag studera mer än en kurs?", "Kan jag kombinera kurser?"],
    order: 2,
  },
  {
    cat: "Kurser & studier",
    q: "Vad innebär en prövning?",
    a: "En prövning innebär att studenten läser kursen självständigt och därefter genomför prov.\n• Kostnad 500 kr per prövning.\n• CSN ges inte för prövningar.\n• Prövning kan genomföras i valfri kommun.",
    kw: ["prövning", "prov", "självstudier", "kostnad"],
    alt: ["Hur fungerar prövning?", "Vad är en prövning?"],
    order: 3,
  },
  {
    cat: "Kurser & studier",
    q: "Hur lång tid tar det att rätta uppgifter?",
    a: "Lärare rättar uppgifter efter avsnittets deadline.",
    kw: ["rätta", "uppgifter", "deadline", "betyg"],
    alt: ["När får jag betyg på uppgifter?", "När rättas mina uppgifter?"],
    order: 4,
  },

  // ── Betyg & prov ──────────────────────────────────────────────────────────
  {
    cat: "Betyg & prov",
    q: "Hur får jag tag på mina betyg?",
    a: "Kontakta vuxenutbildningen i din hemkommun alternativt logga in på Alvis och \"Mina sidor\" för beställning av betyg.",
    kw: ["betyg", "beställa", "alvis", "hemkommun"],
    alt: ["Var hittar jag mina betyg?", "Hur beställer jag betyg?"],
    order: 0,
  },
  {
    cat: "Betyg & prov",
    q: "Hur lång tid tar det innan jag får mitt betyg?",
    a: "Ett betyg meddelas av läraren senast en vecka efter kursslut. Efter detta registreras betyget i kommunens system, en process som tar ca 3 veckor innan betyg är synligt i din hemkommuns sida.",
    kw: ["betyg", "tid", "registrering", "kommun"],
    alt: ["När syns mitt betyg?", "Hur lång tid tar betygsregistrering?"],
    order: 1,
  },
  {
    cat: "Betyg & prov",
    q: "Hur får jag ett betygsutdrag?",
    a: "Betygsutdrag får du från din hemkommun. Hos vissa kommuner kan du beställa det direkt via din inloggning till antagningsplattformen (Alvis) hos kommunen. Hos andra kommuner behöver du kontakta den kommunala vuxenutbildningen och önska att få ett betygsutdrag. Betygsutdraget skickas därefter till dig via post av kommunen. Skolan kan ej utfärda betygsutdrag utan endast diplom och intyg på avslutade studier i kurs och/eller utbildning.",
    kw: ["betygsutdrag", "alvis", "hemkommun", "utdrag"],
    alt: ["Var får jag betygsutdrag?", "Kan skolan ge mig betygsutdrag?"],
    order: 2,
  },
  {
    cat: "Betyg & prov",
    q: "Måste jag göra slutprov på plats?",
    a: "Slutprovet äger rum någon gång under de två sista veckorna av en kurs. Datumet för detta prov delges av ansvarig lärare. Slutprov måste genomföras fysiskt på plats och detta är obligatoriskt för samtliga elever. Detta krav är en grundläggande del av bedömningen och utvärderingen av elevens kunskaper i kursen. Skolan vill understryka att frånvaro från det avslutande provet kommer att leda till att elev erhåller ett F i slutbetyg – oavsett prestation i resterande moment i kurs. Skolans administration vill uppmana samtliga elever till att vara noga med att hålla sig uppdaterade om datum och övrig information relaterat till slutprovet. Om elever har några frågor eller behöver ytterligare information är de välkomna att kontakta lärare eller administrationen på skolan.",
    kw: ["slutprov", "plats", "obligatoriskt", "frånvaro"],
    alt: ["Kan jag skriva slutprov på distans?", "Vad händer om jag inte kommer på slutprov?"],
    order: 3,
  },
  {
    cat: "Betyg & prov",
    q: "Jag kan inte komma på slutprovet. Kan jag få en annan tid?",
    a: "Elever ges inga möjligheter att genomföra slutprov efter angivet slutprovsdatum. Men, elev kan i god tid innan slutprov (senast 3 veckor innan) höra av sig till skolans administration och se över eventuella möjligheter att kunna komma in till skolan och skriva sitt prov vid ett tidigare datum. Krav är att skälig anledning ska uppges i samband med önskan gällande ombokning av prov. Om elev inte kan genomföra slutprov innan angivet slutprovsdatum delges elev ett F, men kan i efterhand boka en F-prövning på skolan för att genomföra slutprov på plats för möjlighet till godkänt betyg i kurs. Detta bokas via mejl till administrationen. F-prövning kostar 500 kr per kurs och är en självkostnad som elev står för och betalar på plats innan F-prövning genomförs. Vi tar endast emot kontanter, har du inte med dig kontanter får du inte genomföra provet.",
    kw: ["slutprov", "omboka", "tid", "frånvaro", "f-prövning"],
    alt: ["Kan jag ändra tid för slutprov?", "Vad gör jag om jag missar slutprov?"],
    order: 4,
  },
  {
    cat: "Betyg & prov",
    q: "När, hur och var kan jag få göra en prövning i ett ämne?",
    a: "Du behöver kontakta skolan för att se över vilka möjliga datum som skolan erbjuder för prövning. Detta gör du genom att kontakta administrationen. Du hamnar då på en intresselista, när lärarna godkänt prövningselever skickas kallelse med information ut till elever.",
    kw: ["prövning", "datum", "kontakta", "kallelse"],
    alt: ["Hur bokar jag en prövning?", "Var och när kan jag göra prövning?"],
    order: 5,
  },

  // ── CSN & ekonomi ─────────────────────────────────────────────────────────
  {
    cat: "CSN & ekonomi",
    q: "Får jag CSN?",
    a: "CSN ansöker elever själva. I antagningsbesked som skickas innan start finns en lathund för hur elever ansöker CSN för respektive kommun. CSN kan beviljas vid Komvuxstudier på minst 50 % för personer som uppfyller CSN:s villkor.\n\nPrivata studier berättigar inte till CSN.",
    kw: ["csn", "studiestöd", "lån", "bidrag"],
    alt: ["Är jag berättigad till CSN?", "Kan jag få CSN-stöd?"],
    order: 0,
  },
  {
    cat: "CSN & ekonomi",
    q: "Hur ansöker jag om CSN för mina Komvuxstudier?",
    a: "Du ansöker genom att följa de steg och anvisningar som visas på följande sida hos CSN: https://www.csn.se/bidrag-och-lan/studiestod/studiemedel/sa-ansoker-du-om-studiemedel.html\n\nI varje kursstart som du är antagen till studieförsäkrar skolan dig till din hemkommun, som sedan meddelar CSN om att du är studieförsäkrad för dina aktuella kurser. Studerar du en utbildning studieförsäkras du vid varje tillfälle som nya kurser på skolan startar för dig.\n\nIbland kan det behövas att du som elev behöver skicka kompletterande studieintyg till CSN, detta ansöker du om att få på följande mailadress: utbildning@mindful.se.",
    kw: ["csn", "ansöka", "studieförsäkring", "komplettering"],
    alt: ["Hur söker jag CSN?", "Vart skickar jag CSN-ansökan?"],
    order: 1,
  },
  {
    cat: "CSN & ekonomi",
    q: "Vad kostar utbildningarna?",
    a: "Komvux är kostnadsfritt.\n\nPrivata studier är avgiftsbelagda.",
    kw: ["kostnad", "avgift", "betala", "pris"],
    alt: ["Hur mycket kostar det?", "Är det gratis?"],
    order: 2,
  },

  // ── Studenttjänster ───────────────────────────────────────────────────────
  {
    cat: "Studenttjänster",
    q: "Kan jag få ett intyg? Vilken info behöver jag ge?",
    a: "Du som är blivande eller aktiv elev hos Mindfuls Vuxenutbildningar har möjlighet att få ett sammanfattat studieintyg. För att önska ett sådant mailar du ditt önskemål till utbildning@mindful.se. När detta är sänt kommer vår administration att sammanfatta ditt studieintyg.",
    kw: ["intyg", "studieintyg", "bekräftelse"],
    alt: ["Hur får jag ett studieintyg?", "Kan jag få ett intyg från skolan?"],
    order: 0,
  },
  {
    cat: "Studenttjänster",
    q: "Jag känner att jag behöver extra stöd/anpassning i studierna, hur gör jag?",
    a: "Om du tillsammans med din hemkommun eller på egenhand i din ansökan har fyllt i/flaggat för att du är i behov av stöd/extra anpassningar kommer detta att via skolans administration sändas till skolans specialpedagog innan din uppstart. Specialpedagog kommer då att ta kontakt med dig inför din start och boka upp dig för ett möte. Viktigt är att hålla utkik i mailen/skräpposten om du vet att du på egen hand eller tillsammans med kommunen har fyllt i detta i samband med din ansökan.\n\nDu kommer att i uppstarten av din kurs därtill genomföra ett uppstartsavsnitt: \"Kom igång med dina studier\". I detta kommer du att därtill få skriva fram om du önskar stöd – något som därtill kommer diskuteras och uppmärksammas av lärare i ert första gemensamma möte.\n\nOm du inte har (på egen hand eller tillsammans med kommunen) fyllt i behov av stöd/extra anpassningar kommer detta att diskuteras med din lärare vid första mötet. Läraren i sin tur kommer att mejla specialpedagog och önska bokning av träff med dig som elev.",
    kw: ["stöd", "anpassning", "specialpedagog", "extra"],
    alt: ["Behöver jag extra stöd i studierna?", "Hur får jag anpassningar?", "Vad gör jag om jag behöver hjälp?"],
    order: 1,
  },
  {
    cat: "Studenttjänster",
    q: "Jag skulle vilja diskutera vidare kurser/utbildning, hur gör jag?",
    a: "I samband med att du startar dina studier kommer du att få förfrågan huruvida du önskar att komma i kontakt med studie- och yrkesvägledare för vidare planering av studier och karriärsval. Detta kommer att ske i samband med ditt första uppstartsmöte med din lärare. Lärare kommer att, efter dialog med dig i mötet, maila till skolans studie- och yrkesvägledare och önska att ett möte bokas med dig.\n\nStudie- och yrkesvägledare kommer då att tillsammans med dig diskutera och skräddarsy en planering utefter dina behov och önskemål men därtill möjligheter i förhållande till betyg, tidigare studier och meriter. Kartläggningen sammanfattas och delges dig och skolan, vid behov för att bekräfta studieplanering till kommun laddas den upp på kommunens hemsida.\n\nOm du ändrar dig efter att ha tackat nej till studie- och yrkesvägledning i starten av dina studier är du välkommen att boka en tid via syv@mindful.se.",
    kw: ["syv", "studievägledning", "karriär", "vidare studier"],
    alt: ["Hur bokar jag möte med SYV?", "Kan jag prata med en studievägledare?"],
    order: 2,
  },
  {
    cat: "Studenttjänster",
    q: "Jag tycker att It's Learning är svårt. Hur kan jag få mer info om hur det fungerar?",
    a: "I ditt välkomstbrev/antagningsbesked delges du några viktiga länkar. En av dessa är länken som lär dig att nyttja och arbeta i läroplattformen It's Learning. Om du ej hittar ditt välkomstbrev/antagningsbesked kan du maila och önska länken igen hos utbildning@mindful.se.",
    kw: ["it's learning", "läroplattform", "länk", "välkomstbrev"],
    alt: ["Hur använder jag It's Learning?", "Var finner jag It's Learning?"],
    order: 3,
  },
  {
    cat: "Studenttjänster",
    q: "Jag har blivit sjuk och känner att jag ligger lite efter. Vad behöver jag göra?",
    a: "Viktigt är att du först och främst kontaktar din lärare och informerar denne att du är sjuk. Tillsammans med läraren gör ni upp en individuell planering för hur du ska arbeta för att komma i kapp. En elev som visar på hög inaktivitet vid tillfälle ges en varning innan elev avbryts i sina studier. Vi rekommenderar därför att du uppmärksammar din lärare på om du ej har möjlighet att hålla din planering i din/dina kurser.",
    kw: ["sjuk", "frånvaro", "efter", "planering", "inaktivitet"],
    alt: ["Vad gör jag om jag blir sjuk?", "Jag ligger efter, vad gör jag?"],
    order: 4,
  },
  {
    cat: "Studenttjänster",
    q: "Får jag plugga när och varifrån jag vill?",
    a: "Du är välkommen att studera från vart du vill, så länge du håller dig till din planering som du ser i dina kursplaneringar och närvarar vid dina obligatoriska träffar med din lärare. Viktigt är att du har en god uppkoppling till internet och har möjlighet att ha videosamtal via Teams/Zoom med din lärare. En elev som visar på hög inaktivitet vid tillfälle ges en varning innan elev avbryts i sina studier. Vi rekommenderar därför att du uppmärksammar din lärare på om du eventuellt är bortrest eller ej har möjlighet att hålla din planering i din/dina kurser.\n\nVIKTIGT! För elever som studerar Vård- och omsorgsprogrammet (Vårdbiträde/Undersköterska) krävs att dessa närvarar vid sina obligatoriska metodtillfällen på plats. Dessa delges av lärare i samband med uppstart av studier på skolan. Vid frånvaro möjliggörs ej elev godkända betyg i kurs, därtill kan ej elev möjliggöras att godkännas gå ut på sin praktik.",
    kw: ["plugga", "när", "var", "distans", "obligatoriskt", "vård"],
    alt: ["Kan jag studera vart som helst?", "Måste jag vara på plats?"],
    order: 5,
  },
  {
    cat: "Studenttjänster",
    q: "Hur många gånger får jag kolla på lektionerna?",
    a: "Som elev har du möjlighet att kolla om på lektioner hur många gånger du vill. Du har även möjlighet att spola samt ändra hastighet på lektionerna. Du klickar dig tillbaka till tidigare avsnitt för att ta del av tidigare genomförda lektioner – för att titta på dessa igen.",
    kw: ["lektioner", "repetera", "spola", "hastighet"],
    alt: ["Kan jag titta på lektioner igen?", "Hur många gånger kan jag se en lektion?"],
    order: 6,
  },
  {
    cat: "Studenttjänster",
    q: "Jag har försökt men jag lyckas inte få in texten rätt i avsnittet \"Mina mål med kursen\". Kan jag skicka svaren på annat sätt till min lärare?",
    a: "Om du ej får in texten rätt i avsnittet ber vi dig att kontakta skolans administration. Detta då vi behöver säkerställa att du framöver i kursen kan lämna in samtliga uppgifter rätt. Vi vill flagga för att arbete genom mobil/padda/annan enhet än dator kan vara utmanande att arbeta i, då detta format kan skapa problem med att fylla i samt arbeta med skrivuppgifter i läroplattformen. Vi rekommenderar att elever som ej har tillgång till egen dator arbetar i stöd av en biblioteksdator, ser över möjligheten att låna en dator eller hör av sig till skolan och bokar in tillfällen där elev får sitta på skolan och arbeta med sina uppgifter på en av skolans datorer. OBS! Skolan tillåter ej hemlån av skolans datorer.",
    kw: ["text", "skriva", "mobil", "dator", "avsnitt"],
    alt: ["Jag kan inte skriva i It's Learning", "Tekniskt problem med inlämning"],
    order: 7,
  },

  // ── Studenttjänster (additional) ───────────────────────────────────────────
  {
    cat: "Studenttjänster",
    q: "Hur hittar jag min kurslitteratur?",
    a: "I ditt antagningsbesked och ditt välkomstbrev delges du en bifogad fil (PDF) som heter \"Kurslitteratur\". I denna hittar du samtlig kurslitteratur som är aktuell för dig och dina studier i din kurs/utbildning. Du har även möjlighet att läsa dig till vilken kurslitteratur som gäller för vardera kurs i skolans läroplattform It's Learning, detta under kursens välkomstavsnitt. Under välkomstavsnittet hittar du också en guide som visar vart och hur du kan köpa/låna din kurslitteratur. Vid frågor och/eller funderingar kan du alltid kontakta administrationen eller din lärare.",
    kw: ["kurslitteratur", "bok", "läsa", "pdf", "välkomstbrev"],
    alt: ["Var finner jag kurslitteratur?", "Vilka böcker behöver jag?", "Hur skaffar jag kurslitteratur?"],
    order: 8,
  },

  // ── Kontakt & support ─────────────────────────────────────────────────────
  {
    cat: "Kontakt & support",
    q: "Hur avanmäler jag mig?",
    a: "Avanmälan sker via e-post till utbildning@mindful.se. Ange fullständigt namn, personnummer och studier som önskas avslutas.",
    kw: ["avanmälan", "avsluta", "e-post"],
    alt: ["Vill jag avsluta mina studier, hur gör jag?", "Hur avslutar jag mina kurser?"],
    order: 0,
  },
  {
    cat: "Kontakt & support",
    q: "Jag hittar inte/har inte fått inloggningsuppgifter/välkomstbrev.",
    a: "Eftersom det är en första gång som vi har kontakt med varandra via mail kan det hända att vi med skolans mail hamnar i skräpposten. Antagningsbesked/välkomstbrev inkommer till elev senast två veckor innan start. Om du som nybliven elev ej fått ett antagningsbesked/välkomstbrev i din inkorg ber vi dig först att kolla din skräppost. Om du ej finner ett välkomstbrev i skräpposten ber vi dig att kontakta administrationen. Eventuellt har gammalt eller inaktiverad mailadress inkommit till skolan från kommunen, om eventuell uppdatering av mailadress i kommunens system ej genomförts av dig som elev.",
    kw: ["inloggning", "välkomstbrev", "skräppost", "mail"],
    alt: ["Jag har inte fått mitt välkomstbrev", "Jag kan inte logga in"],
    order: 1,
  },
  {
    cat: "Kontakt & support",
    q: "Mitt konto har låst sig/blivit spärrat. Vem kontaktar jag?",
    a: "Viktigt är att du ser över om kontot är spärrat eller om du inte tryckt i rätt lösenord. Om du ej tryckt i rätt lösenord kan du önska beställa ett nytt till din mailadress genom att på startsidan till läroplattformen klicka på \"Har du glömt ditt lösenord?\". Om du spärrat ditt konto behöver du komma i kontakt med skolans administration för att få hjälp med att låsa upp ditt konto.",
    kw: ["konto", "spärrat", "låst", "lösenord"],
    alt: ["Jag är låst ute från mitt konto", "Kontot är spärrat"],
    order: 2,
  },

];

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB\n");

  console.log("--- Upserting FAQ categories ---");
  const categoryIds = {};
  for (const cat of categories) {
    categoryIds[cat.name] = await upsertCategory(cat);
  }

  console.log("\n--- Upserting FAQ entries ---");
  let count = 0;
  for (const faq of faqs) {
    const categoryId = categoryIds[faq.cat];
    if (!categoryId) {
      console.error(`  ERROR: category "${faq.cat}" not found, skipping`);
      continue;
    }
    await upsertFaq(categoryId, {
      question: faq.q,
      answer: faq.a,
      keywords: faq.kw,
      alternateQuestions: faq.alt,
      displayOrder: faq.order,
    });
    count++;
  }

  const totalCategories = await FaqCategory.countDocuments();
  const totalFaqs = await Faq.countDocuments({ isDeleted: false });
  console.log(`\n=== DONE ===`);
  console.log(`  Categories: ${totalCategories}`);
  console.log(`  FAQs:       ${totalFaqs}`);
  console.log(`  Upserted in this run: ${count}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
