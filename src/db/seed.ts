// Fills the database with test data: 1000 contacts with notes. About a third
// of them have a keep-in-touch frequency, and a few "Тестов" contacts sit on
// the edges of the countdown to check the dates by hand.
//
//   pnpm db:seed            fills an empty database
//   pnpm db:seed --reset    deletes ALL contacts and notes first, then fills
//
// The data is generated from a fixed random seed, so every run produces the
// same people. Emails use the reserved example.* domains on purpose.

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getDatabaseConfig, loadEnvFileIfPresent } from "./config";
import type { KeepInTouchFrequency } from "./keep-in-touch";
import { contacts, notes, type NewContact, type NewNote } from "./schema";

const CONTACT_COUNT = 1000;
const RANDOM_SEED = 20261010;
const INSERT_BATCH_SIZE = 250;
const DAY_MS = 24 * 60 * 60 * 1000;

// --- Random helpers ---------------------------------------------------------

// mulberry32: a tiny seeded generator, enough for test data
function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = createRandom(RANDOM_SEED);

function randomInt(min: number, max: number) {
  return min + Math.floor(random() * (max - min + 1));
}

function chance(probability: number) {
  return random() < probability;
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

function pickSeveral<T>(items: readonly T[], count: number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) {
    picked.push(...pool.splice(Math.floor(random() * pool.length), 1));
  }
  return picked;
}

function pickWeighted<T>(items: readonly { weight: number; value: T }[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let point = random() * total;
  for (const item of items) {
    point -= item.weight;
    if (point < 0) return item.value;
  }
  return items[items.length - 1].value;
}

// --- Names ------------------------------------------------------------------

type Gender = "m" | "f";

const FIRST_NAMES: Record<Gender, readonly string[]> = {
  m: [
    "Александр", "Алексей", "Андрей", "Антон", "Артём", "Борис", "Вадим",
    "Валерий", "Василий", "Виктор", "Виталий", "Владимир", "Владислав",
    "Вячеслав", "Геннадий", "Георгий", "Глеб", "Григорий", "Даниил", "Денис",
    "Дмитрий", "Евгений", "Егор", "Иван", "Игорь", "Илья", "Кирилл",
    "Константин", "Лев", "Леонид", "Максим", "Марк", "Матвей", "Михаил",
    "Никита", "Николай", "Олег", "Павел", "Пётр", "Роман", "Руслан", "Семён",
    "Сергей", "Станислав", "Степан", "Тимофей", "Тимур", "Фёдор", "Эдуард",
    "Юрий", "Ярослав",
  ],
  f: [
    "Александра", "Алёна", "Алина", "Алиса", "Алла", "Анастасия", "Анна",
    "Валентина", "Валерия", "Варвара", "Вера", "Вероника", "Виктория",
    "Галина", "Дарья", "Диана", "Евгения", "Екатерина", "Елена", "Елизавета",
    "Жанна", "Зоя", "Инна", "Ирина", "Карина", "Кира", "Кристина", "Ксения",
    "Лариса", "Лидия", "Любовь", "Людмила", "Маргарита", "Марина", "Мария",
    "Надежда", "Наталья", "Нина", "Оксана", "Олеся", "Ольга", "Полина",
    "Светлана", "София", "Таисия", "Тамара", "Татьяна", "Ульяна", "Юлия",
    "Яна",
  ],
};

// Masculine forms; feminizeSurname() derives the feminine ones
const SURNAMES: readonly string[] = [
  "Иванов", "Смирнов", "Кузнецов", "Попов", "Васильев", "Петров", "Соколов",
  "Михайлов", "Новиков", "Фёдоров", "Морозов", "Волков", "Алексеев",
  "Лебедев", "Семёнов", "Егоров", "Павлов", "Козлов", "Степанов", "Николаев",
  "Орлов", "Андреев", "Макаров", "Никитин", "Захаров", "Зайцев", "Соловьёв",
  "Борисов", "Яковлев", "Григорьев", "Романов", "Воробьёв", "Сергеев",
  "Кузьмин", "Фролов", "Александров", "Дмитриев", "Королёв", "Гусев",
  "Киселёв", "Ильин", "Максимов", "Поляков", "Сорокин", "Виноградов",
  "Ковалёв", "Белов", "Медведев", "Антонов", "Тарасов", "Жуков", "Баранов",
  "Филиппов", "Комаров", "Давыдов", "Беляев", "Герасимов", "Богданов",
  "Осипов", "Сидоров", "Матвеев", "Титов", "Марков", "Миронов", "Крылов",
  "Куликов", "Карпов", "Власов", "Мельников", "Денисов", "Гаврилов",
  "Тихонов", "Казаков", "Афанасьев", "Данилов", "Савельев", "Тимофеев",
  "Фомин", "Чернов", "Абрамов", "Мартынов", "Ефимов", "Федотов", "Щербаков",
  "Назаров", "Калинин", "Исаев", "Чернышёв", "Быков", "Маслов", "Родионов",
  "Коновалов", "Лазарев", "Воронин", "Климов", "Филатов", "Пономарёв",
  "Голубев", "Кудрявцев", "Прохоров", "Наумов", "Потапов", "Журавлёв",
  "Овчинников", "Трофимов", "Леонов", "Соболев", "Ермаков", "Колесников",
  "Гончаров", "Емельянов", "Никифоров", "Грачёв", "Котов", "Гришин",
  "Ефремов", "Архипов", "Громов", "Кириллов", "Малышев", "Панов", "Моисеев",
  "Румянцев", "Акимов", "Кондратьев", "Бирюков", "Горбунов", "Анисимов",
  "Тихомиров", "Галкин", "Лукьянов", "Михеев", "Скворцов", "Юдин",
  "Белоусов", "Нестеров", "Симонов", "Прокофьев", "Харитонов", "Князев",
  "Цветков", "Левин", "Митрофанов", "Воронов", "Аксёнов", "Мальцев",
  "Логинов", "Горшков", "Савин", "Краснов", "Майоров", "Демидов", "Елисеев",
  "Рыбаков", "Сафонов", "Плотников", "Фокин", "Вишневский", "Островский",
  "Левицкий", "Белинский", "Высоцкий", "Раевский", "Шевченко", "Бондаренко",
  "Ткаченко", "Кравченко", "Коваленко", "Савченко", "Петренко", "Ковальчук",
];

function feminizeSurname(surname: string) {
  if (/(ск|цк)ий$/.test(surname)) return surname.replace(/ий$/, "ая");
  if (/(ов|ев|ёв|ин|ын)$/.test(surname)) return `${surname}а`;
  return surname;
}

const TRANSLITERATION: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function transliterate(text: string) {
  return Array.from(text.toLowerCase(), (char) => TRANSLITERATION[char] ?? char).join("");
}

// --- Building blocks for texts ----------------------------------------------

const COMPANIES = [
  "Вектор", "Северный ветер", "Орион", "Меридиан", "Альтаир", "Балтика-Софт",
  "Гранит", "Новая линия", "ТехноСфера", "Импульс", "Зелёный мыс", "Аврора",
  "Причал", "Форпост", "Сириус-Проект", "Кедр",
];

const POSITIONS = [
  "руководитель отдела продаж", "аналитик", "бухгалтер",
  "инженер-проектировщик", "дизайнер", "менеджер проектов",
  "системный администратор", "маркетолог", "юрист", "тестировщик",
  "главный инженер", "логист", "HR-менеджер", "разработчик",
  "финансовый директор", "офис-менеджер", "технолог", "экономист",
  "редактор", "специалист по закупкам",
];

const CITIES_WHERE = [
  "в Казани", "в Новосибирске", "в Екатеринбурге", "в Санкт-Петербурге",
  "в Нижнем Новгороде", "в Сочи", "в Калининграде", "в Самаре",
  "в Ростове-на-Дону", "в Красноярске", "в Москве",
];

const CITIES_FROM = [
  "из Воронежа", "из Твери", "из Ярославля", "из Перми", "из Томска",
  "из Тулы", "из Рязани", "из Уфы", "из Краснодара", "из Владимира",
];

const TRIP_PLACES = [
  "на Алтай", "в Карелию", "в Хибины", "на Байкал", "на Камчатку",
  "в Приэльбрусье", "на Куршскую косу",
];

const MONTHS_IN = [
  "в январе", "в феврале", "в марте", "в апреле", "в мае", "в июне",
  "в июле", "в августе", "в сентябре", "в октябре", "в ноябре", "в декабре",
];

const MONTHS_BY = [
  "к январю", "к февралю", "к марту", "к апрелю", "к маю", "к июню",
  "к июлю", "к августу", "к сентябрю", "к октябрю", "к ноябрю", "к декабрю",
];

const BOOKS = [
  "Мастер и Маргарита", "Сто лет одиночества", "Шантарам",
  "Думай медленно… решай быстро", "Три товарища", "Цветы для Элджернона",
  "Вино из одуванчиков", "Тень ветра",
];

const SPECIALISTS_WHOM = [
  "стоматолога", "автомеханика", "репетитора по математике", "риелтора",
  "юриста", "ветеринара", "мастера по ремонту", "педиатра",
];

// Short names in the genitive case: "друг Миши", "жена Димы"
const FRIENDS_OF: Record<Gender, readonly string[]> = {
  m: ["Миши", "Димы", "Серёжи", "Саши", "Лёши", "Паши", "Андрея", "Кости", "Вани", "Игоря"],
  f: ["Оли", "Кати", "Тани", "Маши", "Лены", "Наташи", "Ани", "Юли", "Светы", "Иры"],
};

const CHILDREN_OF = ["Сони", "Миши", "Вари", "Тимофея", "Алисы", "Матвея", "Полины", "Артёма", "Киры", "Льва"];

// --- Kinds of acquaintances -------------------------------------------------

type Profile = { about: string; howWeMet: string | null; notePool: string[] };

// Picks the masculine or the feminine wording for the contact
type Wording = (masculine: string, feminine: string) => string;

function generalNotes(g: Wording): string[] {
  return [
    `Созвонились. Договорились встретиться на следующей неделе, ${g("он", "она")} напишет, когда будет удобно.`,
    `Виделись на выходных. ${g("Обещал", "Обещала")} прислать фотографии.`,
    `Встретились за кофе. ${g("Рассказал", "Рассказала")}, что меняет работу — переходит в «${pick(COMPANIES)}».`,
    `${g("Переехал", "Переехала")} в другой район. Новый адрес пришлёт сообщением.`,
    `${g("Просил", "Просила")} напомнить про встречу ближе ${pick(MONTHS_BY)}.`,
    `Договорились: с меня билеты, с ${g("него", "неё")} — жильё. Едем ${pick(MONTHS_IN)}.`,
    `${g("Вернул", "Вернула")} книгу. ${g("Посоветовал", "Посоветовала")} почитать «${pick(BOOKS)}».`,
    `У ${g("него", "неё")} родилась дочь. Поздравить и передать подарок.`,
    `${g("Занял", "Заняла")} у меня ${randomInt(2, 30)} тысяч до конца месяца.`,
    `Ищет хорошего ${pick(SPECIALISTS_WHOM)} — узнать у знакомых и написать.`,
    `Долго говорили по телефону. У ${g("него", "неё")} всё хорошо, зовёт в гости ${pick(MONTHS_IN)}.`,
    `Договорились вместе пойти на концерт ${pick(MONTHS_IN)}. Билеты покупает ${g("он", "она")}.`,
    `${g("Согласился", "Согласилась")} помочь с переездом в субботу. С меня обед.`,
    `Обсудили отпуск. Советует ехать ${pick(TRIP_PLACES)} в сентябре — меньше людей.`,
    `День рождения ${pick(MONTHS_IN)} — не забыть поздравить.`,
    `Договорились созвониться после праздников и выбрать день для встречи.`,
  ];
}

function classmate(g: Wording): Profile {
  const now = pick([
    "сейчас работает программистом", "сейчас врач-кардиолог",
    "преподаёт в университете", `${g("открыл", "открыла")} свою кофейню`,
    "занимается недвижимостью", "работает в банке",
    `теперь живёт ${pick(CITIES_WHERE)}`,
    "ведёт бухгалтерию небольших компаний", "работает инженером на заводе",
    "занимается дизайном интерьеров",
  ]);
  return {
    about: `${g("Одноклассник", "Одноклассница")}, ${now}`,
    howWeMet: pick([
      "Учились в одном классе с пятого по одиннадцатый",
      "Сидели за одной партой в школе",
      `Вместе учились в школе № ${randomInt(1, 180)}`,
      "Из параллельного класса, дружим со школы",
    ]),
    notePool: [
      `Обсуждали встречу выпускников ${pick(MONTHS_IN)}. ${g("Он", "Она")} собирает список, кто придёт.`,
      `${g("Нашёл", "Нашла")} старые школьные фотографии, обещает оцифровать и прислать.`,
      ...generalNotes(g),
    ],
  };
}

function universityFriend(g: Wording): Profile {
  return {
    about: `${g("Однокурсник", "Однокурсница")}, ${pick(POSITIONS)}`,
    howWeMet: pick([
      "Учились в одной группе в университете",
      "Жили в одном общежитии на первом курсе",
      "Вместе писали диплом у одного научного руководителя",
      "Познакомились в студенческом турклубе",
      "Вместе ездили в стройотряд после второго курса",
    ]),
    notePool: [
      `Встреча курса ${pick(MONTHS_IN)}. ${g("Он", "Она")} бронирует столик, с меня — обзвонить остальных.`,
      `${g("Защитил", "Защитила")} диссертацию. Поздравить и позвать отметить.`,
      ...generalNotes(g),
    ],
  };
}

function colleague(g: Wording): Profile {
  const company = pick(COMPANIES);
  const isFormer = chance(0.55);
  return {
    about: `${isFormer ? g("Бывший коллега", "Бывшая коллега") : "Коллега"}, ${pick(POSITIONS)}`,
    howWeMet: isFormer
      ? pick([
          `Работали вместе в компании «${company}»`,
          `Пришли в «${company}» в один год`,
          `Вместе делали проект для «${company}»`,
        ])
      : pick([
          "Работаем в соседних отделах",
          "Сидим в одном кабинете",
          "Вместе ведём один проект",
        ]),
    notePool: [
      `Обсудили проект. ${g("Обещал", "Обещала")} прислать презентацию до пятницы.`,
      `Отправить ${g("ему", "ей")} резюме — передаст руководителю.`,
      `${g("Перешёл", "Перешла")} в «${pick(COMPANIES)}». Договорились не теряться и обедать раз в месяц.`,
      `${g("Рекомендовал", "Рекомендовала")} курс по управлению проектами. Ссылку пришлёт.`,
      "Созвон по работе: договорились о сроках, финальная версия — к концу месяца.",
      `${g("Попросил", "Попросила")} рекомендацию для новой работы. Написать до среды.`,
      ...generalNotes(g),
    ],
  };
}

function neighbor(g: Wording): Profile {
  return {
    about: `${g("Сосед", "Соседка")} ${pick(["по лестничной клетке", "по даче", "с пятого этажа", "по подъезду", "этажом выше", "по гаражу"])}`,
    howWeMet: pick([
      "Живём в одном подъезде",
      "Соседние участки на даче",
      "Познакомились на собрании жильцов",
      "Вместе гуляем с собаками во дворе",
    ]),
    notePool: [
      `${g("Оставил", "Оставила")} мне ключи на время отпуска. Поливать цветы по средам.`,
      "Договорились вместе заказать вывоз мусора с участка, счёт пополам.",
      `${g("Попросил", "Попросила")} перфоратор до выходных.`,
      "Собирает подписи за ремонт подъезда. Зайдёт вечером в четверг.",
      ...generalNotes(g),
    ],
  };
}

function hobbyFriend(g: Wording): Profile {
  return {
    about: pick([
      "Играем вместе в футбол по четвергам",
      `${g("Партнёр", "Партнёрша")} по теннису`,
      "Ходим вместе в походы",
      "Из книжного клуба",
      "Из бегового клуба",
      "Играем в настольные игры по пятницам",
      "Из школы танцев",
      "Вместе поём в хоре",
      "Из шахматного клуба",
      "Из фотоклуба",
      "Катаемся вместе на велосипедах",
      "Вместе ходим в бассейн",
    ]),
    howWeMet: pick([
      "Познакомились на тренировке",
      "Пришли в клуб в один день",
      "Познакомил общий тренер",
      `Познакомились в поездке ${pick(TRIP_PLACES)}`,
      "Оказались в одной команде на турнире",
    ]),
    notePool: [
      `Договорились на игру в четверг в 20:00. Мячи привезёт ${g("он", "она")}.`,
      `Обсудили поездку ${pick(TRIP_PLACES)} ${pick(MONTHS_IN)}. Список снаряжения ${g("он", "она")} пришлёт в чат.`,
      `${g("Предложил", "Предложила")} записаться на забег ${pick(MONTHS_IN)}. Подумать и ответить до конца недели.`,
      `Следующая встреча клуба — у ${g("него", "неё")} дома. Принести что-нибудь к чаю.`,
      ...generalNotes(g),
    ],
  };
}

const SPECIALISTS: readonly { title: string | [string, string]; only?: Gender }[] = [
  { title: "Стоматолог" },
  { title: "Риелтор" },
  { title: "Юрист по недвижимости" },
  { title: "Бухгалтер" },
  { title: "Репетитор по английскому" },
  { title: "Парикмахер" },
  { title: "Ветеринар" },
  { title: "Тренер по плаванию" },
  { title: "Нотариус" },
  { title: "Страховой агент" },
  { title: "Педиатр" },
  { title: ["Массажист", "Массажистка"] },
  { title: "Фотограф" },
  { title: "Турагент" },
  { title: "Логопед" },
  { title: "Психолог" },
  { title: "Терапевт в районной поликлинике" },
  { title: "Кинолог" },
  { title: "Флорист" },
  { title: "Дизайнер интерьеров" },
  { title: "Финансовый консультант" },
  { title: "Автомеханик", only: "m" },
  { title: "Электрик", only: "m" },
  { title: "Сантехник", only: "m" },
  { title: "Мастер по ремонту квартир", only: "m" },
  { title: "Сборщик мебели", only: "m" },
  { title: "Мастер маникюра", only: "f" },
  { title: "Няня", only: "f" },
  { title: "Портниха", only: "f" },
];

function specialist(g: Wording, gender: Gender): Profile {
  const { title } = pick(SPECIALISTS.filter((item) => !item.only || item.only === gender));
  return {
    about: typeof title === "string" ? title : g(title[0], title[1]),
    howWeMet: pick([
      "Посоветовали коллеги",
      "Нашли по рекомендации соседей",
      "Посоветовала мама",
      "Обращаемся уже несколько лет",
      "Нашли по отзывам, остались довольны",
      `Контакт от ${pick([...FRIENDS_OF.m, ...FRIENDS_OF.f])}`,
    ]),
    notePool: [
      "Договорились на следующий раз примерно через полгода, записаться заранее.",
      `Договорились о цене: ${randomInt(3, 90)} тысяч за всю работу, половина — вперёд.`,
      `${g("Сделал", "Сделала")} всё быстро и аккуратно. Можно советовать знакомым.`,
      `Перенесли встречу на следующую неделю, ${g("он", "она")} перезвонит.`,
      `${g("Сказал", "Сказала")} прийти с документами: паспорт и договор.`,
      `Прислать ${g("ему", "ей")} фото и размеры до пятницы.`,
      `Записались на ${pick(["понедельник", "вторник", "четверг", "субботу"])}, ${randomInt(9, 19)}:00.`,
      `${g("Предупредил", "Предупредила")}, что с нового года цены вырастут.`,
    ],
  };
}

function friendOfFriends(g: Wording, gender: Gender): Profile {
  const otherGender: Gender = gender === "m" ? "f" : "m";
  const anyFriend = pick([...FRIENDS_OF.m, ...FRIENDS_OF.f]);
  return {
    about: pick([
      `${g("Друг", "Подруга")} ${anyFriend}`,
      `${g("Муж", "Жена")} ${pick(FRIENDS_OF[otherGender])}`,
      `${g("Брат", "Сестра")} ${anyFriend}`,
      `${g("Давний друг", "Давняя подруга")} семьи`,
    ]),
    howWeMet: pick([
      `Познакомились на дне рождения у ${anyFriend}`,
      `Вместе отмечали Новый год у ${anyFriend}`,
      `Познакомились на свадьбе ${anyFriend}`,
      "Ездили одной компанией на шашлыки",
      "Оказались за одним столом на юбилее",
    ]),
    notePool: generalNotes(g),
  };
}

function relative(g: Wording): Profile {
  return {
    about: g(
      pick(["Двоюродный брат", "Дядя", "Троюродный брат", "Крёстный", "Племянник", "Муж двоюродной сестры"]),
      pick(["Двоюродная сестра", "Тётя", "Троюродная сестра", "Крёстная", "Племянница", "Жена двоюродного брата"]),
    ),
    howWeMet: pick([
      "Родня по маминой линии",
      "Родня по папиной линии",
      "Видимся на семейных праздниках",
      `Родственники ${pick(CITIES_FROM)}`,
    ]),
    notePool: [
      `Собираемся всей семьёй на юбилей бабушки ${pick(MONTHS_IN)}. С нас торт.`,
      `${g("Просил", "Просила")} помочь с выбором ноутбука для сына.`,
      "Договорились приехать в гости на майские.",
      `Передать через ${g("него", "неё")} лекарства для бабушки.`,
      `${g("Прислал", "Прислала")} старые семейные фотографии — распечатать для альбома.`,
      ...generalNotes(g),
    ],
  };
}

function professionalContact(g: Wording): Profile {
  return {
    about: pick([
      "Продакт-менеджер в финтехе", "Архитектор", "HR-директор",
      g("Журналист", "Журналистка"), "Руководит небольшой студией дизайна",
      "Консультант по налогам", "Организует отраслевые конференции",
      g("Основатель", "Основательница") + " онлайн-школы",
      "Владеет сетью пекарен", "Переводчик с немецкого",
      "Редактор в издательстве", "Преподаёт на курсах аналитики",
    ]),
    howWeMet: pick([
      `Познакомились на конференции ${pick(CITIES_WHERE)}`,
      "Вместе выступали на митапе",
      "Пересеклись на отраслевой выставке",
      "Познакомились на курсах повышения квалификации",
      "Сидели рядом на тренинге",
      `Летели одним рейсом ${pick(CITIES_FROM)}`,
    ]),
    notePool: [
      `Обменялись контактами. ${g("Обещал", "Обещала")} познакомить с нужным человеком.`,
      `Отправить ${g("ему", "ей")} ссылку на доклад и слайды.`,
      `${g("Позвал", "Позвала")} выступить на встрече сообщества ${pick(MONTHS_IN)}. Ответить до конца недели.`,
      `Обсудили возможное сотрудничество. ${g("Он", "Она")} пришлёт предложение на почту.`,
      ...generalNotes(g),
    ],
  };
}

function fellowParent(g: Wording): Profile {
  const place = pick(["из садика", "из класса", "из секции", "из музыкальной школы"]);
  return {
    about: `${g("Папа", "Мама")} ${pick(CHILDREN_OF)} ${place}`,
    howWeMet: pick([
      "Дети ходят в одну группу",
      "Дети учатся в одном классе",
      "Познакомились на родительском собрании",
      "Дети вместе занимаются в секции",
    ]),
    notePool: [
      "Договорились по очереди забирать детей по средам.",
      `Собираем на подарок учителю, перевести ${g("ему", "ей")} 1000 рублей.`,
      "Дети хотят в выходные в парк — созвониться в пятницу.",
      `${g("Позвал", "Позвала")} на день рождения ребёнка в субботу, к 12:00.`,
      "Отдаёт детский велосипед — забрать на неделе.",
    ],
  };
}

function createProfile(gender: Gender): Profile {
  const g: Wording = (masculine, feminine) => (gender === "m" ? masculine : feminine);
  const build = pickWeighted<() => Profile>([
    { weight: 8, value: () => classmate(g) },
    { weight: 10, value: () => universityFriend(g) },
    { weight: 18, value: () => colleague(g) },
    { weight: 7, value: () => neighbor(g) },
    { weight: 10, value: () => hobbyFriend(g) },
    { weight: 17, value: () => specialist(g, gender) },
    { weight: 12, value: () => friendOfFriends(g, gender) },
    { weight: 6, value: () => relative(g) },
    { weight: 8, value: () => professionalContact(g) },
    { weight: 4, value: () => fellowParent(g) },
  ]);
  return build();
}

// --- Contact details --------------------------------------------------------

function createPhone() {
  const digits = (count: number) =>
    Array.from({ length: count }, () => randomInt(0, 9)).join("");
  const operator = `9${digits(2)}`;
  return chance(0.85)
    ? `+7 ${operator} ${digits(3)}-${digits(2)}-${digits(2)}`
    : `8 (${operator}) ${digits(3)}-${digits(2)}-${digits(2)}`;
}

function createEmail(firstName: string, surname: string) {
  const first = transliterate(firstName);
  const last = transliterate(surname);
  const localPart = pick([
    `${first}.${last}`,
    `${first[0]}.${last}`,
    `${last}.${first[0]}`,
    `${last}${randomInt(70, 99)}`,
    `${first}_${last}`,
  ]);
  return `${localPart}@${pick(["example.com", "example.org", "example.net"])}`;
}

// A moment between `from` and `to`, at a time of day when people talk
function randomMoment(from: Date, to: Date) {
  const day = new Date(from.getTime() + random() * (to.getTime() - from.getTime()));
  day.setHours(randomInt(8, 21), randomInt(0, 59), randomInt(0, 59), 0);
  if (day < from) return from;
  return day > to ? to : day;
}

type SeedNote = Omit<NewNote, "contactId"> & { createdAt: Date };
type SeedContact = {
  contact: NewContact & { createdAt: Date };
  notes: SeedNote[];
};

function createContacts(now: Date, count: number): SeedContact[] {
  const usedNames = new Set<string>();
  const result: SeedContact[] = [];

  while (result.length < count) {
    const gender: Gender = chance(0.5) ? "m" : "f";
    const firstName = pick(FIRST_NAMES[gender]);
    const baseSurname = pick(SURNAMES);
    const surname = gender === "f" ? feminizeSurname(baseSurname) : baseSurname;
    const name = `${firstName} ${surname}`;
    if (usedNames.has(name)) continue;
    usedNames.add(name);

    const profile = createProfile(gender);
    const createdAt = randomMoment(
      new Date(now.getTime() - 1100 * DAY_MS),
      new Date(now.getTime() - 14 * DAY_MS),
    );
    const noteCount = pickWeighted([
      { weight: 25, value: 0 },
      { weight: 35, value: 1 },
      { weight: 25, value: 2 },
      { weight: 10, value: 3 },
      { weight: 5, value: 4 },
    ]);

    result.push({
      contact: {
        name,
        about: profile.about,
        howWeMet: chance(0.9) ? profile.howWeMet : null,
        phone: chance(0.85) ? createPhone() : null,
        email: chance(0.6) ? createEmail(firstName, surname) : null,
        createdAt,
      },
      notes: pickSeveral(profile.notePool, noteCount).map((body) => ({
        body,
        createdAt: randomMoment(createdAt, now),
      })),
    });
  }

  return result;
}

// --- Keep in touch ----------------------------------------------------------

// Called after all contacts are generated, so the people and their notes stay
// the same as before the keep-in-touch fields appeared
function addKeepInTouch(seedContacts: SeedContact[], now: Date) {
  for (const { contact, notes } of seedContacts) {
    if (!chance(1 / 3)) continue;

    contact.keepInTouchFrequency = pickWeighted<KeepInTouchFrequency>([
      { weight: 15, value: "week" },
      { weight: 35, value: "month" },
      { weight: 30, value: "quarter" },
      { weight: 20, value: "year" },
    ]);
    // As if the frequency was chosen when the contact was added
    contact.keepInTouchSetAt = contact.createdAt;

    if (chance(0.3)) {
      const lastNoteAt = Math.max(
        contact.createdAt.getTime(),
        ...notes.map((note) => note.createdAt.getTime()),
      );
      contact.lastContactedAt = randomMoment(new Date(lastNoteAt), now);
    }
  }
}

// Contacts on the edges of the countdown. "Тестов" is not among SURNAMES,
// so the names never clash, and searching "тест" finds all of them.
const BOUNDARY_CONTACTS: readonly {
  gender: Gender;
  name: string;
  about: string;
  frequency: KeepInTouchFrequency;
  createdDaysAgo: number;
  noteDaysAgo: number[];
  contactedDaysAgo?: number;
}[] = [
  {
    gender: "f",
    name: "Анна Тестова",
    about: "Проверка сроков: раз в неделю, последняя заметка 6 дней назад",
    frequency: "week",
    createdDaysAgo: 90,
    noteDaysAgo: [6, 40],
  },
  {
    gender: "m",
    name: "Борис Тестов",
    about: "Проверка сроков: раз в неделю, последняя заметка 7 дней назад",
    frequency: "week",
    createdDaysAgo: 90,
    noteDaysAgo: [7, 40],
  },
  {
    gender: "f",
    name: "Вера Тестова",
    about: "Проверка сроков: раз в неделю, последняя заметка 8 дней назад",
    frequency: "week",
    createdDaysAgo: 90,
    noteDaysAgo: [8, 40],
  },
  {
    gender: "m",
    name: "Глеб Тестов",
    about: "Проверка сроков: раз в месяц, заметок нет, частоту выбрали 10 дней назад",
    frequency: "month",
    createdDaysAgo: 10,
    noteDaysAgo: [],
  },
  {
    gender: "f",
    name: "Дарья Тестова",
    about:
      "Проверка сроков: раз в неделю, заметка 20 дней назад, «Связался» 7 дней назад",
    frequency: "week",
    createdDaysAgo: 90,
    noteDaysAgo: [20],
    contactedDaysAgo: 7,
  },
];

// Exactly N days before now is exactly N days back in Moscow too:
// Moscow has no daylight saving time
function createBoundaryContacts(now: Date): SeedContact[] {
  const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);

  return BOUNDARY_CONTACTS.map((boundary) => {
    const g: Wording = (masculine, feminine) =>
      boundary.gender === "m" ? masculine : feminine;
    const createdAt = daysAgo(boundary.createdDaysAgo);
    const bodies = pickSeveral(generalNotes(g), boundary.noteDaysAgo.length);

    return {
      contact: {
        name: boundary.name,
        about: boundary.about,
        phone: createPhone(),
        createdAt,
        keepInTouchFrequency: boundary.frequency,
        keepInTouchSetAt: createdAt,
        lastContactedAt:
          boundary.contactedDaysAgo === undefined
            ? null
            : daysAgo(boundary.contactedDaysAgo),
      },
      notes: bodies.map((body, index) => ({
        body,
        createdAt: daysAgo(boundary.noteDaysAgo[index]),
      })),
    };
  });
}

// --- Writing to the database ------------------------------------------------

function inBatches<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}

async function main() {
  loadEnvFileIfPresent();

  const shouldReset = process.argv.includes("--reset");
  const pool = new Pool(getDatabaseConfig());
  const db = drizzle({ client: pool });

  try {
    const existingCount = await db.$count(contacts);
    if (existingCount > 0 && !shouldReset) {
      console.error(
        `The contacts table already has ${existingCount} rows, nothing was changed.`,
      );
      console.error(
        "To delete ALL contacts and notes and seed again, run: pnpm db:seed --reset",
      );
      process.exitCode = 1;
      return;
    }

    const now = new Date();
    const seedContacts = createContacts(
      now,
      CONTACT_COUNT - BOUNDARY_CONTACTS.length,
    );
    addKeepInTouch(seedContacts, now);
    seedContacts.push(...createBoundaryContacts(now));
    let noteCount = 0;

    await db.transaction(async (tx) => {
      if (shouldReset) {
        await tx.execute(
          sql`truncate table ${notes}, ${contacts} restart identity`,
        );
      }

      for (const batch of inBatches(seedContacts, INSERT_BATCH_SIZE)) {
        const inserted = await tx
          .insert(contacts)
          .values(batch.map((item) => item.contact))
          .returning({ id: contacts.id });

        // Rows come back in the order they were inserted
        const batchNotes = batch.flatMap((item, index) =>
          item.notes.map((note) => ({ ...note, contactId: inserted[index].id })),
        );
        if (batchNotes.length > 0) {
          await tx.insert(notes).values(batchNotes);
          noteCount += batchNotes.length;
        }
      }
    });

    console.log(`Seeded ${seedContacts.length} contacts and ${noteCount} notes.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Seeding failed", error);
  process.exitCode = 1;
});
