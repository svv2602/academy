# Вещи героини (PLAY-04, PLAY-05, PLAY-06): как они собраны

`items.py` строит вещи из простых фигур Blender (цилиндры, конусы, сферы, торы, звёзды) — собственные модели игры,
не CC0-наборы и не платный сервис (`CREDITS.md`). Запуск бесплатный и локальный, из корня репозитория:

    blender -b --factory-startup --python tools/items/items.py -- models-src/items models-unused/items
    npm run assets                          # models-src/items -> public/models/items (сжатие)
    npm run e2e -- --update-models          # если менялся список вещей: переписать tools/models-used.json

Первый каталог получает вещи первой лавки (их грузит игра), второй — вещи образов PLAY-06, которые игра пока не грузит.

| id | кость | где |
|---|---|---|
| `wand_star`, `wand_crystal` | `hand_r` | `models-src/items/` |
| `wreath`, `crown`, `wizard_hat`, `earrings_star` | `Head` | `models-src/items/` |
| `wings_butterfly` (два узла `wing_l`, `wing_r` с шарниром у позвоночника — машут) | `spine_03` | `models-src/items/` |
| `tiara`, `wizard_cap`, `elf_ears` | `Head` | `models-unused/items/` |
| `wand_flower`, `wand_moon`, `wand_leaf` | `hand_r` | `models-unused/items/` |

## Как вещь держится на героине

Каждая вещь смоделирована в координатах покоя **немасштабированной** модели героини (`models-src/hero/child.glb`, оси Blender:
лицо смотрит в −y, верх +z). Игра (`src/game/gear.ts`, `loadGear`) вешает вещь под её кость с обратной матрицей покоя кости,
взятой в пространстве модели (до масштаба `model.scale` ≈ 1,32, которым `buildHero` подгоняет рост), — тогда вещь растёт
вместе с героиней и повторяет каждое движение кости. Список «вещь → кость» — таблица `GEAR` в `gear.ts`; скрипт печатает его
строкой `ITEMS {...}` с числом треугольников.

Палочка смотрит вверх и чуть внутрь, а не вперёд, как в пробе: вперёд она в беге проходила сквозь голову (R20).
Проверка — автопрохождение (`tools/shot.mjs`, «her items»): каждая вещь во всех клипах остаётся у своей кости, палочка
не ближе 2 см к телу в `Walk`/`Run`/`Jump`/`Interact`.
