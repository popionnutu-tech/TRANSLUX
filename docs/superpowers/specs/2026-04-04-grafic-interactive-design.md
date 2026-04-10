# Интерактивный Grafic — Дизайн-спецификация

## Контекст

Текущая система генерации расписания использует два отдельных интерфейса:
- `/assignments` — таблица с dropdown для назначения водителей
- `/grafic` — генерация PNG через серверный рендер (Sharp + SVG overlay на PNG шаблон)

Серверный рендер страдает от багов позиционирования текста (неточные координаты, несовпадение шрифтов). Новый подход: **одна страница** с PNG шаблоном как фоном, HTML текстом поверх, и html2canvas для скачивания.

## Решение

Одна страница `/grafic` заменяет обе текущие. PNG шаблон используется как `background-image`, а дата и данные водителей рендерятся через HTML/CSS. Скачивание через `html2canvas` — файл = экран.

## Архитектура

### Страница: `/grafic`
- **Роли**: ADMIN, GRAFIC
- **Заменяет**: `/assignments` + `/grafic`

### Компоненты

```
GraficPage (page.tsx)
└── GraficClient.tsx
    ├── DatePicker + кнопки (Copiază, Descarcă)
    ├── PageTabs (Pagina 1 / Pagina 2)
    └── ScheduleCanvas
        ├── background-image: schedule-p{1,2}.png
        ├── DateOverlay (HTML текст "DD.MM.YYYY")
        └── DriverCell × 14
            ├── PhoneText (HTML)
            ├── NameText (HTML)
            └── onClick → AssignmentPopup
                ├── DriverSelect
                ├── VehicleTurSelect
                └── VehicleReturSelect
```

### ScheduleCanvas

Контейнер с фиксированными размерами:
```css
.schedule-canvas {
  position: relative;
  width: 896px;
  height: 1200px;
  background-image: url('/templates/schedule-p1.png');
  background-size: cover;
}
```

HTML-элементы позиционируются абсолютно внутри этого контейнера:
- Дата: `top: ~65px, left: ~500px` (italic serif, тёмно-бордовый)
- Водитель строки i: `top: 285 + i*67, right: ~30px` (телефон bold + имя regular)

Точные координаты — те же что в текущем `LAYOUT`, но через CSS `position: absolute`.

### AssignmentPopup

При клике на ячейку "Nr. Șofer" — popup/popover:
- Dropdown водителя (drivers WHERE active=true, sorted by full_name)
- Dropdown машины тур (vehicles WHERE active=true)  
- Dropdown машины ретур (опционально, по умолчанию = машина тур)
- Кнопки: Salvează / Șterge / Anulează
- Сохранение → `upsertAssignment()` → обновление UI optimistically

### Скачивание PNG

```typescript
import html2canvas from 'html2canvas';

async function downloadPage(pageNum: 1 | 2) {
  const el = document.getElementById(`schedule-canvas-p${pageNum}`);
  const canvas = await html2canvas(el, { 
    width: 896, height: 1200, scale: 1 
  });
  const link = document.createElement('a');
  link.download = `grafic-${dateDisplay}-p${pageNum}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
```

При скачивании popup скрывается, интерактивные элементы hidden — остаётся только текст поверх фона.

## Data Model

Без изменений в базе. Используются существующие таблицы:
- `crm_routes` — маршруты
- `daily_assignments` — назначения (driver_id, vehicle_id, vehicle_id_retur)
- `drivers` — водители (full_name, phone)
- `vehicles` — машины (plate_number)

## Server Actions

Объединить из `/assignments/actions.ts` и `/grafic/actions.ts`:

```typescript
// Загрузка всех данных для страницы
getGraficData(date: string): Promise<{
  routes: RouteWithAssignment[];  // crm_routes + joined assignment + driver + vehicle
  drivers: Driver[];               // все активные водители
  vehicles: Vehicle[];             // все активные машины
}>

// CRUD назначений (из существующего assignments/actions.ts)
upsertAssignment(crmRouteId, date, driverId, vehicleId, vehicleIdRetur)
deleteAssignment(assignmentId)
copyAssignments(sourceDate, targetDate)
```

## Имя водителя

`extractFirstName(fullName)` — берёт последнее слово из `full_name`:
- "Cramari Igor" → "Igor"  
- "I." → "I." (если в БД только инициал — показываем что есть)

## Телефон

`toLocalPhone(phone)` — конвертирует 373... → 069... (существующая функция)

## UI Flow

1. Диспетчер открывает `/grafic`
2. Выбирает дату → загружаются маршруты + назначения
3. Видит шаблон с заполненными данными водителей
4. Кликает на пустую/заполненную ячейку → popup
5. Выбирает водителя + машину → сохранение → ячейка обновляется
6. "Copiază de ieri" → копирует все назначения
7. "Descarcă" → html2canvas → PNG скачивается

## Файлы для изменения

| Файл | Действие |
|------|----------|
| `apps/web/src/app/(dashboard)/grafic/GraficClient.tsx` | Полная переписка — интерактивный шаблон |
| `apps/web/src/app/(dashboard)/grafic/actions.ts` | Объединить с assignments/actions.ts |
| `apps/web/src/app/(dashboard)/grafic/page.tsx` | Обновить (возможно без изменений) |
| `apps/web/package.json` | Добавить `html2canvas` |
| `apps/web/src/components/Sidebar.tsx` | Убрать ссылку на Programare, оставить Grafic |

**Удалить/Deprecate:**
- `apps/web/src/lib/schedule-image.ts` (больше не нужен)
- `apps/web/src/app/api/schedule-image/route.ts` (больше не нужен)
- Sharp + opentype.js зависимости для рендера (можно оставить для других целей)

## Верификация

1. Открыть `/grafic`, выбрать дату
2. Убедиться что шаблон отображается с данными водителей
3. Кликнуть на пустую ячейку → popup → выбрать водителя → сохранить
4. Скачать PNG → сравнить с эталоном (шрифты, позиции, цвета)
5. Проверить "Copiază de ieri"
6. Проверить обе страницы (1-14 и 15-28)
