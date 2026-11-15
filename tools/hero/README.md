# Детская модель героини (TECH-14): как она собрана

Итог — `models-unused/hero/child.glb`: один меш (20 638 треугольников) с одной текстурой `T_Child_BaseColor`
на скелете игры UAL из 65 костей. Игра эту модель пока не загружает; подключение — отдельным шагом TECH-14
(тогда файл переезжает в `models-src/hero/child.glb`, и `npm run assets` сжимает его в `public/models/hero/`).

Модель собрана 2026-11-15 (проба Q6, принята заказчиком). Права — в `CREDITS.md`.

## Что в репозитории и чего в нём нет

| Есть | Нет (и не нужно для игры) |
|---|---|
| `models-unused/hero/child.glb` — готовая модель | сырые выходы Meshy: черновики, текстурированная модель, авториг (`rigged.glb`), превью |
| скрипты этого каталога | Blender (нужен только для шага 2) |
| скелет и клипы игры: `public/models/hero/base.glb`, `anims.glb` | ключ Meshy (`~/.config/academy/meshy.env`, только на машине заказчика) |

Повторить сборку с нуля без сырых выходов Meshy нельзя: шаг 1 платный и даёт каждый раз другую модель.
Шаги 2–3 повторяемы, если сырые выходы сохранены вне репозитория.

## Шаги

1. **Meshy (ПЛАТНО, только по команде заказчика)** — `meshy.py`. Ключ читается из `~/.config/academy/meshy.env`;
   предохранитель `START`/`LIMIT` отказывает, если вызов может превысить разрешённые кредиты (на пробу заказчик
   разрешил 300, потрачено 45). Каталог `--out` — вне репозитория.
   ```
   python3 -I tools/hero/meshy.py --out <каталог вне репозитория> preview c meshy-7.1
   python3 -I tools/hero/meshy.py --out <...> wait c preview
   python3 -I tools/hero/meshy.py --out <...> refine c   &&  ... wait c refine
   python3 -I tools/hero/meshy.py --out <...> rig c      &&  ... wait c rig      # -> <...>/c/rigged.glb
   ```
2. **Blender, бесплатно** — `build.py`: суставы скелета UAL переносятся в суставы авторига Meshy с сохранением
   ориентации костей, веса — от Meshy.
   ```
   blender -b --factory-startup --python tools/hero/build.py -- <...>/c/rigged.glb <...>/child_ual.glb
   ```
   Рядом пишется `<...>/child_ual.report.json` (треугольники, кости, высоты таза: 0,519 м против 0,932 м).
3. **Имя текстуры** — `name_texture.mjs`: Blender называет текстуру `Image_0`, а сборка кладёт её в общий
   `hero/tex/<имя>.webp` рядом с текстурами прежней героини, поэтому текстура получает имя `T_Child_BaseColor`.
   Меняется только имя, остальное (геометрия, скин, изображение) — как было.
   ```
   node tools/hero/name_texture.mjs <...>/child_ual.glb models-unused/hero/child.glb
   ```
4. **Проверка анимаций глазами (по желанию)** — `merge.py` вклеивает клипы игры в модель для просмотра в Blender;
   результат никуда не кладётся.
   ```
   python3 -I tools/hero/merge.py <...>/child_ual.glb <...>/child_anim.glb
   ```
5. **Встройка** (отдельный шаг TECH-14): `models-src/hero/child.glb` ← `models-unused/hero/child.glb`,
   затем `npm run assets`.

Упаковку проверяет `tools/hero.test.mjs` (в `npm test`): 65 костей с именами UAL, треугольников не больше 25 000,
текстура WebP не больше 1024², каждый файл в пределах `MAX_FILE` из `tools/assets.mjs`.

Сумма sha256 файла пробы (`child_ual.glb`, до переименования текстуры):
`d7ba37f7def5fa8e9ea741807a963f96a3673efeef75c4cc4cb4a7211f53ad36`; итог шага 3 —
`5b525a8cb7d97f298c8e3f22ab006016bd9e4fb9532db31eae6b8fc0f71194af`.
