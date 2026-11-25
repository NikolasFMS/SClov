/**
 * Built-in External Word Dictionaries Registry
 * Word lists from popular association board games (not divided into 4-word cards,
 * so they always operate in random combination mode).
 */
import { russianKeywords as decryptoEnRu, englishKeywords as decryptoEnEn } from "./00_Dictionary_Decripto_En.js";
import { russianKeywords as codenamesGagaRu, englishKeywords as codenamesGagaEn } from "./01_Dictionary_Codenames_GaGaGames_Ru.js";
import { russianKeywords as codenamesRu, englishKeywords as codenamesEn } from "./02_Dictionary_Codenames_En.js";
import { russianKeywords as codenamesDuetRu, englishKeywords as codenamesDuetEn } from "./03_Dictionary_Codenames_Duet_En.js";
import { russianKeywords as codenamesUndercoverRuRu, englishKeywords as codenamesUndercoverRuEn } from "./04_Dictionary_Codenames_Undercover_Ru.js";
import { russianKeywords as codenamesUndercoverEnRu, englishKeywords as codenamesUndercoverEnEn } from "./05_Dictionary_Codenames_Undercover_En.js";
import { russianKeywords as pardRu, englishKeywords as pardEn } from "./06_Dictionary_Pard_Ru.js";
import { russianKeywords as vpupkinRu, englishKeywords as vpupkinEn } from "./07_Dictionary_vpupkin_Ru.js";
import { russianKeywords as ivanZavorinRu, englishKeywords as ivanZavorinEn } from "./08_Dictionary_IvanZavorin_Ru.js";
import { russianKeywords as deNullRuRu, englishKeywords as deNullRuEn } from "./09_Dictionary_deNull_Ru.js";
import { russianKeywords as deNull18Ru, englishKeywords as deNull18En } from "./10_Dictionary_deNull_18_Ru.js";
import { russianKeywords as deNullEnRu, englishKeywords as deNullEnEn } from "./11_Dictionary_deNull_En.js";
import { russianKeywords as deNull18EnRu, englishKeywords as deNull18EnEn } from "./12_Dictionary_deNull_18_En.js";
import { russianKeywords as esperantoRu, englishKeywords as esperantoEn } from "./13_Dictionary_Esperanto.js";
import { russianKeywords as doodleDashRu, englishKeywords as doodleDashEn } from "./14_Dictionary_DoodleDash_Ru.js";
import { russianKeywords as justOneRu, englishKeywords as justOneEn } from "./15_Dictionary_JustOne.js";
import { russianKeywords as soCloverRu, englishKeywords as soCloverEn } from "./16_Dictionary_SoClover_En.js";
import { russianKeywords as lowInkRu, englishKeywords as lowInkEn } from "./17_Dictionary_LowInk_Ru.js";

const KEEP_UPPERCASE = new Set([
  "СССР", "НАСА", "СМИ", "ДТП", "КГБ", "ФСБ", "ФБР", "ЦРУ", "НЛО", "ДНК", "РНК", "США", "МГУ", "БДСМ", "ВИЧ",
  "ТНТ", "СТС", "МЧС", "ГАИ", "ГИБДД", "ЖКХ", "ООН", "НАТО", "ЧП", "ИИ", "ПК", "ТВ", "УЗИ", "ЭКГ", "СМС", "РФ",
  "NASA", "USSR", "BDSM", "HTML", "WIFI", "LGBT", "SWAT", "ESPN", "IMAX", "AIDS", "ASMR", "MILF",
  "UFO", "CIA", "FBI", "USA", "VIP", "BBQ", "DNA", "RNA", "GPS", "ATM", "BMW", "KFC", "NBA", "NFL", "NHL",
  "DJ", "TV", "IQ", "AI", "VR", "PC", "UK", "US", "CD", "ID", "PR", "IT", "HR", "3D", "4K"
]);

function formatWord(raw) {
  const cleaned = String(raw || "").trim().replace(/\s+/g, " ");
  if (!cleaned) return "";

  const isAllCaps = cleaned === cleaned.toUpperCase() && cleaned !== cleaned.toLowerCase();
  if (!isAllCaps) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  if (KEEP_UPPERCASE.has(cleaned)) {
    return cleaned;
  }

  return cleaned.charAt(0) + cleaned.slice(1).toLowerCase();
}

function createWordDeck({ id, nameRU, nameEN, keywordsRU, keywordsEN }) {
  const count = Math.min(
    Array.isArray(keywordsRU) ? keywordsRU.length : 0,
    Array.isArray(keywordsEN) ? keywordsEN.length : 0
  );

  const words = [];
  for (let i = 0; i < count; i++) {
    const ru = formatWord(keywordsRU[i]);
    const en = formatWord(keywordsEN[i]);
    if (ru) {
      words.push({ ru, en: en || ru });
    }
  }

  return {
    id,
    name: {
      ru: nameRU,
      en: nameEN
    },
    words
  };
}

export const EXTRA_DICTIONARY_DECKS = [
  createWordDeck({
    id: "so_clover_en_set",
    nameRU: "So Clover!: Оригинал (словарь)",
    nameEN: "So Clover!: Original (Word List)",
    keywordsRU: soCloverRu,
    keywordsEN: soCloverEn
  }),
  createWordDeck({
    id: "decrypto_base_en_set",
    nameRU: "Декодер: Базовый",
    nameEN: "Decrypto: Base",
    keywordsRU: decryptoEnRu,
    keywordsEN: decryptoEnEn
  }),
  createWordDeck({
    id: "codenames_base_ru_set",
    nameRU: "Codenames: GaGa Games",
    nameEN: "Codenames: GaGa Games",
    keywordsRU: codenamesGagaRu,
    keywordsEN: codenamesGagaEn
  }),
  createWordDeck({
    id: "codenames_base_en_set",
    nameRU: "Codenames: Оригинал",
    nameEN: "Codenames: Original",
    keywordsRU: codenamesRu,
    keywordsEN: codenamesEn
  }),
  createWordDeck({
    id: "codenames_duet_set",
    nameRU: "Codenames: Дуэт",
    nameEN: "Codenames: Duet",
    keywordsRU: codenamesDuetRu,
    keywordsEN: codenamesDuetEn
  }),
  createWordDeck({
    id: "codenames_undercover_ru",
    nameRU: "Codenames: Undercover (RU) 18+",
    nameEN: "Codenames: Undercover (RU) 18+",
    keywordsRU: codenamesUndercoverRuRu,
    keywordsEN: codenamesUndercoverRuEn
  }),
  createWordDeck({
    id: "codenames_undercover_en",
    nameRU: "Codenames: Undercover (EN) 18+",
    nameEN: "Codenames: Undercover (EN) 18+",
    keywordsRU: codenamesUndercoverEnRu,
    keywordsEN: codenamesUndercoverEnEn
  }),
  createWordDeck({
    id: "just_one_ru_set",
    nameRU: "Намёк понял: Оригинал",
    nameEN: "Just One: Original",
    keywordsRU: justOneRu,
    keywordsEN: justOneEn
  }),
  createWordDeck({
    id: "doodle_dash_ru_set",
    nameRU: "Скоростные каракули",
    nameEN: "Doodle Dash",
    keywordsRU: doodleDashRu,
    keywordsEN: doodleDashEn
  }),
  createWordDeck({
    id: "low_ink_ru_set",
    nameRU: "Призрачные чернила",
    nameEN: "Low Ink",
    keywordsRU: lowInkRu,
    keywordsEN: lowInkEn
  }),
  createWordDeck({
    id: "pard_set",
    nameRU: "Словарь от Pard",
    nameEN: "Pard Dictionary",
    keywordsRU: pardRu,
    keywordsEN: pardEn
  }),
  createWordDeck({
    id: "vpupkin_set",
    nameRU: "Словарь от vpupkin",
    nameEN: "vpupkin Dictionary",
    keywordsRU: vpupkinRu,
    keywordsEN: vpupkinEn
  }),
  createWordDeck({
    id: "ivan_zavorin_ru_set",
    nameRU: "Иван Заворин 18+",
    nameEN: "Ivan Zavorin 18+ (RU)",
    keywordsRU: ivanZavorinRu,
    keywordsEN: ivanZavorinEn
  }),
  createWordDeck({
    id: "de_null_ru_set",
    nameRU: "deNULL (RU)",
    nameEN: "deNULL (RU)",
    keywordsRU: deNullRuRu,
    keywordsEN: deNullRuEn
  }),
  createWordDeck({
    id: "de_null_18_ru_set",
    nameRU: "deNULL 18+ (RU)",
    nameEN: "deNULL 18+ (RU)",
    keywordsRU: deNull18Ru,
    keywordsEN: deNull18En
  }),
  createWordDeck({
    id: "de_null_en_set",
    nameRU: "deNULL (EN)",
    nameEN: "deNULL (EN)",
    keywordsRU: deNullEnRu,
    keywordsEN: deNullEnEn
  }),
  createWordDeck({
    id: "de_null_18_en_set",
    nameRU: "deNULL 18+ (EN)",
    nameEN: "deNULL 18+ (EN)",
    keywordsRU: deNull18EnRu,
    keywordsEN: deNull18EnEn
  }),
  createWordDeck({
    id: "custom_esperanto_set",
    nameRU: "Эсперанто",
    nameEN: "Esperanto",
    keywordsRU: esperantoRu,
    keywordsEN: esperantoEn
  })
];
