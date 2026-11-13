# Академія чарівних світів

Браузерная 3D-игра-приключение для ребёнка 6–7 лет (Three.js + TypeScript + Vite, PWA).
Сейчас это **вертикальный срез** первого мира — Королевства фей: одна локация, героиня, кот-помощник,
единорог с заданием на счёт, кристалл, звёзды, тайный сундук, сохранение.

    npm install
    npm run dev        # http://localhost:5173, с телефона в той же сети — адрес Network из вывода
    npm run build      # сборка в dist/ (относительные пути, годится для GitHub Pages)

    node tools/shot.mjs http://localhost:5173/ shots desktop|mobile   # сценарный прогон со скриншотами
    node tools/closeup.mjs http://localhost:5173/ shots               # крупные планы
    node tools/budget.mjs                                             # на что уходят треугольники в кадре
    node tools/fps.mjs q=2 q=1                                        # частота кадров по уровням качества
    node tools/pack_hero.mjs <src>                                    # пересобрать героиню из исходных glTF
    python tools/usd2glb.py <kit> public/models/nature2               # пересобрать набор природы из USD
    python3 tools/gen_voice.py                                        # озвучка voice/phrases.json (Gemini TTS)

Параметры URL: `?q=0|1|2` — зафиксировать уровень графики (иначе снижается сам при <34 fps).

Структура: `src/core` — движковые вещи (модели, ввод, звук, сохранение), `src/world` — локация,
`src/game` — персонажи, `src/ui` — интерфейс и строки (uk/ru), `public/models` — CC0-модели (см. CREDITS.md).
