# Папка колод карт / Deck modules folder

Колоды оформлены как **чистые стандартные ES-модули JavaScript** (`.js`), которые работают напрямую в любом браузере и на **GitHub Pages** без необходимости использования сборщиков.

---

### Как добавить новую колоду:
1. Создайте файл `src/decks/вашаКолода.js` (по одному из шаблонов ниже).
2. Зарегистрируйте её в `src/decks.js`:
   ```javascript
   import yourDeck from "./decks/вашаКолода.js";
   
   export const REGISTERED_DECKS = [
     originalDeck,
     partyWordsDeck,
     cinemaDeck,
     yourDeck // <-- ваша колода здесь
   ];
   ```

---

### Формат 1: Колода с готовыми карточками (4 слова на карту)
В такой колоде поддерживаются оба режима игры: и «Готовые карточки», и «Случайная комбинация слов».

```javascript
export default {
  id: "custom_cards",
  name: {
    ru: "Моя колода карточек",
    en: "My Card Deck"
  },
  description: {
    ru: "Описание вашей колоды на русском языке.",
    en: "Description of your deck in English."
  },
  cards: [
    {
      id: "card-1",
      ru: ["Север", "Восток", "Юг", "Запад"],
      en: ["North", "East", "South", "West"]
    },
    {
      id: "card-2",
      ru: ["Огонь", "Вода", "Земля", "Воздух"],
      en: ["Fire", "Water", "Earth", "Air"]
    }
    // минимум 5 карт для раунда
  ]
};
```

---

### Формат 2: Колода из списка слов (массив слов без деления на карты)
Если колода содержит только массив слов, игра **автоматически включает режим «Случайная комбинация»** и блокирует режим готовых карт.

```javascript
export default {
  id: "custom_words",
  name: {
    ru: "Мой список слов",
    en: "My Word List"
  },
  description: {
    ru: "Просто массив слов, которые случайным образом перемешиваются по 4 на карту.",
    en: "Just a list of words automatically arranged into random 4-word cards."
  },
  // Двуязычный массив объектов:
  words: [
    { ru: "Космос", en: "Space" },
    { ru: "Океан", en: "Ocean" },
    { ru: "Вулкан", en: "Volcano" }
    // минимум 20 слов для раунда
  ]
};
```
